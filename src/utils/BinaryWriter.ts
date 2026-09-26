export type BinaryWriterInit = {
  defaultEndian?: "little" | "big";
  initialCapacity?: number;
  maxCapacity?: number;
};

export class BinaryWriter {
  #buffer: ArrayBuffer;
  #view: DataView;
  #offset: number;
  #written: number;
  #defaultEndian: boolean;

  constructor(
    { defaultEndian, initialCapacity, maxCapacity }: BinaryWriterInit = {},
  ) {
    this.#buffer = new ArrayBuffer(initialCapacity ?? 0, {
      maxByteLength: maxCapacity ?? 1073741824, // 1GB
    });
    this.#view = new DataView(this.#buffer);
    this.#offset = 0;
    this.#written = 0;
    this.#defaultEndian = defaultEndian === "little";
  }

  #reserve(min: number) {
    if ((this.#offset + min) < this.#buffer.byteLength) {
      return;
    }

    if (this.#buffer.byteLength + min > this.#buffer.maxByteLength) {
      throw new Error("Buffer length exceeds the limit.");
    }

    this.#buffer.resize(this.#buffer.byteLength + min);
  }

  #advance(delta: number) {
    this.#offset += delta;
    this.#written = Math.max(this.#written, this.#offset);
  }

  get offset(): number {
    return this.#offset;
  }

  complete() {
    return this.#buffer.transferToFixedLength(this.#written);
  }

  seekTo(offset: number) {
    if (offset > this.#written) {
      throw new Error("seek destination must inside the buffer.");
    }
    this.#offset = offset;
  }

  writeUint8Array(value: Uint8Array) {
    this.#reserve(value.byteLength);
    const dst = new Uint8Array(this.#buffer, this.#offset, value.byteLength);
    dst.set(value);
    this.#advance(value.byteLength);
  }

  writeUint8(value: number) {
    this.#reserve(1);
    this.#view.setUint8(this.#offset, value);
    this.#advance(1);
  }

  writeUint16(value: number, littleEndian?: boolean) {
    this.#reserve(2);
    this.#view.setUint16(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(2);
  }

  writeUint32(value: number, littleEndian?: boolean) {
    this.#reserve(4);
    this.#view.setUint32(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(4);
  }

  writeBigUint64(value: bigint, littleEndian?: boolean) {
    this.#reserve(8);
    this.#view.setBigUint64(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(8);
  }

  writeInt8(value: number) {
    this.#reserve(1);
    this.#view.setInt8(this.#offset, value);
    this.#advance(1);
  }

  writeInt16(value: number, littleEndian?: boolean) {
    this.#reserve(2);
    this.#view.setInt16(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(2);
  }

  writeInt32(value: number, littleEndian?: boolean) {
    this.#reserve(4);
    this.#view.setInt32(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(4);
  }

  writeBigInt64(value: bigint, littleEndian?: boolean) {
    this.#reserve(8);
    this.#view.setBigInt64(
      this.#offset,
      value,
      littleEndian ?? this.#defaultEndian,
    );
    this.#advance(8);
  }

  writeUint16LE(value: number) {
    this.writeUint16(value, true);
  }

  writeUint32LE(value: number) {
    this.writeUint32(value, true);
  }

  writeBigUint64LE(value: bigint) {
    this.writeBigUint64(value, true);
  }

  writeUint16BE(value: number) {
    this.writeUint16(value, false);
  }

  writeUint32BE(value: number) {
    this.writeUint32(value, false);
  }

  writeBigUint64BE(value: bigint) {
    this.writeBigUint64(value, false);
  }

  writeInt16LE(value: number) {
    this.writeInt16(value, true);
  }

  writeInt32LE(value: number) {
    this.writeInt32(value, true);
  }

  writeBigInt64LE(value: bigint) {
    this.writeBigInt64(value, true);
  }

  writeInt16BE(value: number) {
    this.writeInt16(value, false);
  }

  writeInt32BE(value: number) {
    this.writeInt32(value, false);
  }

  writeBigInt64BE(value: bigint) {
    this.writeBigInt64(value, false);
  }
}
