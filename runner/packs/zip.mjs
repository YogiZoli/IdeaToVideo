// packs/zip.mjs: a small zip writer and reader for block packs (.itvpack,
// DECISIONS 107). Deflate through node:zlib, CRC32 through zlib.crc32. Only
// what packs need: files, no folders entries, no encryption, no zip64.

import zlib from "node:zlib";

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

// entries: [{ name, data: Buffer | string }] -> the zip file as a Buffer.
export function zipBuffers(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(String(e.name).replace(/\\/g, "/"), "utf8");
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), "utf8");
    const crc = zlib.crc32(data);
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const method = useDeflate ? 8 : 0;
    // version 20, UTF-8 names (bit 11), fixed time 1980-01-01 so a pack is byte-stable
    const head = [u16(20), u16(0x0800), u16(method), u16(0), u16(0x21), u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0)];
    const local = Buffer.concat([u32(0x04034b50), ...head, name, body]);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(20), ...head, u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
  return Buffer.concat([...locals, central, end]);
}

// A zip file's entries: [{ name, data: Buffer }]. Refuses what packs never
// contain (encryption, zip64, unknown compression).
export function unzipBuffer(buf) {
  const sig = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (sig < 0) throw new Error("Not a zip file.");
  const count = buf.readUInt16LE(sig + 10);
  let p = buf.readUInt32LE(sig + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken zip file.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (flags & 1) throw new Error("Encrypted zip files are not supported.");
    if (size === 0xffffffff) throw new Error("Zip64 files are not supported.");
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const body = buf.subarray(start, start + size);
    let data;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) data = zlib.inflateRawSync(body);
    else throw new Error(`Unsupported compression in ${name}.`);
    if (!name.endsWith("/")) out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
