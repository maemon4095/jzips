import { BinaryWriter, checksum, chrono } from "../utils/mod.ts";

export type ZipEntry = {
  name: string;
  date: Date;
  content: Blob;
};

/*
  // Entire Zip File Structure

  [local file header 1]
  [file data 1]
  .
  .
  [local file header n]
  [file data n]
  [central directory header 1]
  .
  .
  [central directory header n]
  [zip64 end of central directory record]
  [zip64 end of central directory locator]
  [end of central directory record]
*/
export class ZipWriter {
  #filenameEncoder: TextEncoder = new TextEncoder();
  #output: WritableStream<ArrayBuffer>;
  #writtenEntries: ZipEntryInfo[] = [];
  #fileEntryOffset: number = 0;
  constructor(output: WritableStream<ArrayBuffer>) {
    this.#output = output;
  }

  async close() {
    await this.#output.close();
  }

  async writeEntry(entry: ZipEntry) {
    // write an file entry below and memory written entry info for write central directory header
    /*
      [local file header]
      [file data]
    */

    const filename = this.#filenameEncoder.encode(entry.name);
    const data = await entry.content.bytes();
    const compressedData = data;
    const crc32 = checksum.crc32(compressedData);
    const info: ZipEntryInfo = {
      name: filename.buffer,
      date: entry.date,
      offset: this.#fileEntryOffset,
      crc32: crc32,
      uncompressedSize: data.byteLength,
      compressedSize: compressedData.byteLength,
    };

    const writer = this.#output.getWriter();
    const headerSize = await writeLocalFileHeader(writer, info);
    await writer.write(compressedData.buffer);
    await writer.ready;
    writer.releaseLock();
    this.#fileEntryOffset += headerSize + compressedData.byteLength;
    this.#writtenEntries.push(info);
  }

  async complete() {
    const writer = this.#output.getWriter();
    const centralDirectoryStart = this.#fileEntryOffset;
    let offset = centralDirectoryStart;
    for (const info of this.#writtenEntries) {
      offset += await writeCentralDirectoryHeader(writer, info);
    }

    await writeEndOfCentralDirectorySection(
      writer,
      centralDirectoryStart,
      offset,
      this.#writtenEntries,
    );

    await writer.ready;
    writer.releaseLock();

    this.#fileEntryOffset = 0;
    this.#writtenEntries = [];
  }
}

const LOCAL_FILE_HEADER_SIGNETURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNETURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_HEADER_SIGNETURE = 0x06054b50;
const ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_TAG = 0x1;
const ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNETURE = 0x06064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNETURE = 0x07064b50;
const ZIP_VERSION = 45; // for zip64

type Binary = Uint8Array<ArrayBuffer>;

type ZipEntryInfo = {
  name: ArrayBuffer;
  date: Date;
  offset: number;
  crc32: number;
  uncompressedSize: number;
  compressedSize: number;
};

async function writeLocalFileHeader(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  info: ZipEntryInfo,
) {
  const extraField = createZip64ExtendedInformationExtraField(info, false);
  const fixedPart = createLocalFileHeaderFixedSizePart(
    info,
    extraField.byteLength,
  );
  await out.write(fixedPart);
  await out.write(info.name); // file name (variable size)
  await out.write(extraField); // extra field (variable size)

  return fixedPart.byteLength + info.name.byteLength + extraField.byteLength;
}

function createLocalFileHeaderFixedSizePart(
  info: ZipEntryInfo,
  extraFieldSize: number,
): ArrayBuffer {
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: 28,
  });
  /* 00 */ writer.writeUint32(LOCAL_FILE_HEADER_SIGNETURE); // local file header signature
  /* 04 */ writer.writeUint16(ZIP_VERSION); // version needed to extract (45 for zip64)
  /* 06 */ writer.writeUint16(0b0000_1000_0000_0000); // general purpose bit flag - bit 11: filename and comment must be encoded using UTF-8
  /* 08 */ writer.writeUint16(0); // compression method - 0 (stored)
  /* 10 */ writer.writeUint16(chrono.getMsDosTime(info.date)); //  last mod file time (MS-DOS format)
  /* 12 */ writer.writeUint16(chrono.getMsDosDate(info.date)); //  last mod file date (MS-DOS format)
  /* 16 */ writer.writeUint32(info.crc32); // crc-32
  /* 20 */ writer.writeUint32(0xFFFF_FFFF); // compressed size (magic for zip64)
  /* 24 */ writer.writeUint32(0xFFFF_FFFF); // uncompressed size (magic for zip64)
  /* 26 */ writer.writeUint16(info.name.byteLength); // file name length
  /* 28 */ writer.writeUint16(extraFieldSize); // extra field length

  return writer.complete();
}

function createZip64ExtendedInformationExtraField(
  info: ZipEntryInfo,
  needOffset: boolean,
): ArrayBuffer {
  const size = 16 + (needOffset ? 8 : 0);
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: size + 4,
  });
  writer.writeUint16(ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_TAG); // block type tag
  writer.writeUint16(size); // size of extra block
  writer.writeBigInt64(BigInt(info.uncompressedSize));
  writer.writeBigInt64(BigInt(info.compressedSize));
  if (needOffset) {
    writer.writeBigInt64(BigInt(info.offset)); // offset of local header record
  }
  // [omitted 4bytes] disk number

  return writer.complete();
}

function createCentralDirectoryHeaderFixedPart(
  info: ZipEntryInfo,
  extraFieldSize: number,
): ArrayBuffer {
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: 46,
  });
  writer.writeUint32(CENTRAL_DIRECTORY_HEADER_SIGNETURE); // central file header signature
  writer.writeUint8(ZIP_VERSION); // lower byte version made by: zip reference version.
  writer.writeUint8(3); // upper byte of version made by - 3: UNIX
  writer.writeUint16(ZIP_VERSION); // version needed to extract
  writer.writeUint16(0b0000_1000_0000_0000); // general purpose bit flag - bit 11: filename and comment must be encoded using UTF-8
  writer.writeUint16(0); // compression method - 0: stored(no compression)
  writer.writeUint16(chrono.getMsDosTime(info.date)); //  last mod file time (MS-DOS format)
  writer.writeUint16(chrono.getMsDosDate(info.date)); //  last mod file date (MS-DOS format)
  writer.writeUint32(info.crc32); // crc-32
  writer.writeUint32(0xFFFF_FFFF); // compressed size (magic for zip64)
  writer.writeUint32(0xFFFF_FFFF); // uncompressed size (magic for zip64)
  writer.writeUint16(info.name.byteLength); // file name length
  writer.writeUint16(extraFieldSize); // extra field length
  writer.writeUint16(0); // file comment length
  writer.writeUint16(0); // disk number start
  writer.writeUint16(0); // internal file attributes
  writer.writeUint32(0x81B6_0000); // external file attributes - -rw-rw-rw-
  writer.writeUint32(0xFFFF_FFFF); // relative offset of local header (magic for zip64)
  return writer.complete();
}

async function writeCentralDirectoryHeader(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  info: ZipEntryInfo,
): Promise<number> {
  const extraField = createZip64ExtendedInformationExtraField(info, true);
  const fixedPart = createCentralDirectoryHeaderFixedPart(
    info,
    extraField.byteLength,
  );
  await out.write(fixedPart);
  await out.write(info.name); // file name (variable size)
  await out.write(extraField); // extra field (variable size)
  // file comment (variable size)
  return fixedPart.byteLength + info.name.byteLength + extraField.byteLength;
}

async function writeZip64EndOfCentralDirectoryRecord(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  infos: ZipEntryInfo[],
  offsetOfCentralDirectory: number,
  sizeOfCentralDirectory: number,
) {
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: 56,
  });

  writer.writeUint32(ZIP64_END_OF_CENTRAL_DIRECTORY_SIGNETURE); // zip64 end of central dir signature                  (0x06064b50)
  writer.writeBigUint64(BigInt(44)); // size of zip64 end of central directory record (it must count for following fields only. 56 - 12)
  writer.writeUint8(ZIP_VERSION); // lower byte version made by: zip reference version.
  writer.writeUint8(3); // upper byte of version made by - 3: UNIX
  writer.writeUint16(45); // version needed to extract - 45: zip64
  writer.writeUint32(0); // number of this disk
  writer.writeUint32(0); // number of the disk with the start of the central directory
  writer.writeBigUint64(BigInt(infos.length)); // total number of entries in the central directory on this disk
  writer.writeBigUint64(BigInt(infos.length)); // total number of entries in the central directory
  writer.writeBigUint64(BigInt(sizeOfCentralDirectory)); // size of the central directory
  writer.writeBigUint64(BigInt(offsetOfCentralDirectory)); // offset of start of central directory with respect to the starting disk number

  // zip64 extensible data sector    (variable size)

  const buf = writer.complete();
  await out.write(buf);

  return buf.byteLength;
}

async function writeZip64EndOfCentralDirectoryLocator(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  zip64EndOfCentralDirectoryOffset: number,
) {
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: 20,
  });
  writer.writeUint32(ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIGNETURE); // zip64 end of central dir locator signature
  writer.writeUint32(0); // number of the disk with the start of the zip64 end of central directory               4 bytes
  writer.writeBigUint64(BigInt(zip64EndOfCentralDirectoryOffset)); // relative offset of the zip64 end of central directory record 8 bytes
  writer.writeUint32(0); // total number of disks           4 bytes

  const buf = writer.complete();
  await out.write(buf);

  return buf.byteLength;
}

async function writeEndOfCentralDirectoryRecord(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  numberOfEntries: number,
  offsetOfCentralDirectory: number,
  sizeOfCentralDirectory: number,
) {
  const writer = new BinaryWriter({
    defaultEndian: "little",
    initialCapacity: 22,
  });
  writer.writeUint32(END_OF_CENTRAL_DIRECTORY_HEADER_SIGNETURE); // end of central dir signature
  writer.writeUint16(0); // number of this disk
  writer.writeUint16(0); // number of the disk with the start of the central directory
  writer.writeUint16(numberOfEntries); // total number of entries in the central directory on this disk
  writer.writeUint16(numberOfEntries); // total number of entries in the central directory
  writer.writeUint32(sizeOfCentralDirectory); // size of the central directory
  writer.writeUint32(offsetOfCentralDirectory); // offset of start of central directory with respect to the starting disk number
  writer.writeUint16(0); // .ZIP file comment length
  // .ZIP file comment       (variable size)}
  const buf = writer.complete();
  await out.write(buf);
  return buf.byteLength;
}

async function writeEndOfCentralDirectorySection(
  out: WritableStreamDefaultWriter<ArrayBuffer>,
  offsetOfCentralDirectory: number,
  offset: number,
  infos: ZipEntryInfo[],
) {
  const sizeOfCentralDirectory = offset - offsetOfCentralDirectory;
  let written = 0;
  written += await writeZip64EndOfCentralDirectoryRecord(
    out,
    infos,
    offsetOfCentralDirectory,
    sizeOfCentralDirectory,
  );
  written += await writeZip64EndOfCentralDirectoryLocator(
    out,
    offset,
  );
  written += await writeEndOfCentralDirectoryRecord(
    out,
    0xFFFF, // magic for zip64
    0xFFFF_FFFF, // magic for zip64
    0xFFFF_FFFF, // magic for zip64
  );

  return written;
}
