// brand/cmap.mjs: which characters a font file has glyphs for, read from its
// cmap table. Used at build time (scripts/fetch-library.mjs) to tell, per
// content language, which fonts miss letters such as ő and ű
// (docs/wizards/brand.md 6.3). No dependency: TTF, OTF and WOFF2 (Node's own
// brotli). Only cmap formats 4 and 12 are read; every shipped font has one.

import zlib from "node:zlib";

// The WOFF2 known-table index (spec 5.1); only the position of a few matters.
const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

function base128(buf, at) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[at.pos++];
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return v;
  }
  throw new Error("Bad WOFF2 number.");
}

// The cmap table's bytes, from any of the three containers.
export function cmapTable(buf) {
  const sig = buf.toString("latin1", 0, 4);
  if (sig === "wOF2") {
    const numTables = buf.readUInt16BE(12);
    const compressed = buf.readUInt32BE(20);
    const at = { pos: 48 };
    let offset = 0;
    let found = null;
    for (let i = 0; i < numTables; i++) {
      const flags = buf[at.pos++];
      let tag = KNOWN_TAGS[flags & 0x3f];
      if ((flags & 0x3f) === 63) {
        tag = buf.toString("latin1", at.pos, at.pos + 4);
        at.pos += 4;
      }
      const version = flags >> 6;
      const orig = base128(buf, at);
      const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
      const length = transformed ? base128(buf, at) : orig;
      if (tag === "cmap") found = { offset, length };
      offset += length;
    }
    if (!found) throw new Error("The font has no cmap table.");
    const data = zlib.brotliDecompressSync(buf.subarray(at.pos, at.pos + compressed));
    return data.subarray(found.offset, found.offset + found.length);
  }
  if (sig === "wOFF") throw new Error("WOFF 1 is not supported; use WOFF2, TTF or OTF.");
  const v = buf.readUInt32BE(0);
  if (v !== 0x00010000 && sig !== "OTTO" && sig !== "true") throw new Error("Not a font file.");
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    if (buf.toString("latin1", rec, rec + 4) === "cmap") {
      const off = buf.readUInt32BE(rec + 8);
      return buf.subarray(off, off + buf.readUInt32BE(rec + 12));
    }
  }
  throw new Error("The font has no cmap table.");
}

// Every code point that maps to a real glyph (not .notdef).
export function codepoints(fontBuf) {
  const t = cmapTable(fontBuf);
  const n = t.readUInt16BE(2);
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const platform = t.readUInt16BE(4 + i * 8);
    const encoding = t.readUInt16BE(6 + i * 8);
    const off = t.readUInt32BE(8 + i * 8);
    subtables.push({ platform, encoding, off, format: t.readUInt16BE(off) });
  }
  const unicode = (s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10));
  const pick = subtables.find((s) => unicode(s) && s.format === 12) ?? subtables.find((s) => unicode(s) && s.format === 4);
  if (!pick) throw new Error("The font has no Unicode cmap (format 4 or 12).");
  const out = new Set();
  const o = pick.off;
  if (pick.format === 12) {
    const groups = t.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const p = o + 16 + g * 12;
      const start = t.readUInt32BE(p);
      const end = t.readUInt32BE(p + 4);
      const glyph = t.readUInt32BE(p + 8);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.add(c);
    }
    return out;
  }
  const segX2 = t.readUInt16BE(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = t.readUInt16BE(ends + s * 2);
    const start = t.readUInt16BE(starts + s * 2);
    const delta = t.readInt16BE(deltas + s * 2);
    const rangeAt = ranges + s * 2;
    const range = t.readUInt16BE(rangeAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph;
      if (range === 0) glyph = (c + delta) & 0xffff;
      else {
        const g = t.readUInt16BE(rangeAt + range + (c - start) * 2);
        glyph = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(c);
    }
  }
  return out;
}

// The letters each content language needs beyond A-Z (catalog.ts LANGUAGES).
// Romanian wants the comma-below ș ț, the correct forms.
export const LANGUAGE_LETTERS = {
  en: "",
  hu: "áéíóöőúüűÁÉÍÓÖŐÚÜŰ",
  de: "äöüßÄÖÜ",
  es: "áéíñóúüÁÉÍÑÓÚÜ¿¡",
  fr: "àâæçèéêëîïôœùûüÿÀÂÆÇÈÉÊËÎÏÔŒÙÛÜŸ",
  it: "àèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ",
  pt: "àáâãçéêíóôõúÀÁÂÃÇÉÊÍÓÔÕÚ",
  nl: "éëïóöüÉËÏÓÖÜ",
  pl: "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
  ro: "ăâîșțĂÂÎȘȚ",
};
const BASIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Per language: the letters the font lacks ("" when it has them all).
export function coverage(points) {
  const has = (ch) => points.has(ch.codePointAt(0));
  return Object.fromEntries(Object.entries(LANGUAGE_LETTERS).map(([lang, letters]) => [lang, [...BASIC, ...letters].filter((ch) => !has(ch)).join("")]));
}
