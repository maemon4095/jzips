import * as zip from "../../src/zip/mod.ts";

const file = await Deno.create("./test.local.zip");

const [getBlob, stream] = createSink();

const writer = new zip.ZipWriter(stream);
const now = new Date();

await writer.writeEntry({
  date: now,
  name: "test.txt",
  content: new Blob(["test"]),
});
await writer.complete();

const b = getBlob();

await file.write(await b.bytes());

function createSink(): [() => Blob, WritableStream<ArrayBuffer>] {
  let chunks: ArrayBuffer[] = [];
  const stream = new WritableStream<ArrayBuffer>({
    write(chunk) {
      chunks.push(chunk);
    },
  });
  return [
    () => {
      const b = new Blob(chunks);
      chunks = [];
      return b;
    },
    stream,
  ];
}
