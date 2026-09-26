// https://datatracker.ietf.org/doc/html/rfc2083#section-15

const crc_table: number[] = [];

for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if ((c & 1) === 1) {
      c = 0xEDB88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  crc_table[n] = c;
}

function update_crc(crc: number, data: Uint8Array) {
  let c = crc;
  for (let n = 0; n < data.length; n++) {
    c = crc_table[Number((c ^ data[n]) & 0xff)] ^ (c >>> 8);
  }
  return c;
}

export function crc32(data: Uint8Array) {
  const MASK = 0xffffffff;
  return update_crc(MASK, data) ^ MASK;
}
