// Repairs files that were corrupted by PowerShell 5.1 (ANSI read → UTF-8 write).
// Reverses cp1252-decoded UTF-8 bytes back into proper UTF-8 and strips BOM.
import fs from "node:fs";

const CP1252 = new Map([
  [0x80, "\u20ac"], [0x82, "\u201a"], [0x83, "\u0192"], [0x84, "\u201e"],
  [0x85, "\u2026"], [0x86, "\u2020"], [0x87, "\u2021"], [0x88, "\u02c6"],
  [0x89, "\u2030"], [0x8a, "\u0160"], [0x8b, "\u2039"], [0x8c, "\u0152"],
  [0x8e, "\u017d"], [0x91, "\u2018"], [0x92, "\u2019"], [0x93, "\u201c"],
  [0x94, "\u201d"], [0x95, "\u2022"], [0x96, "\u2013"], [0x97, "\u2014"],
  [0x98, "\u203a"], [0x99, "\u0153"], [0x9a, "\u0161"], [0x9b, "\u203a"],
  [0x9c, "\u0153"], [0x9e, "\u017e"], [0x9f, "\u0178"],
]);
const REVERSE = new Map([...CP1252].map(([byte, ch]) => [ch, byte]));

function repair(text) {
  let str = text.replace(/^\uFEFF/, "");
  const bytes = [];
  let corrupted = false;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (REVERSE.has(ch)) {
      bytes.push(REVERSE.get(ch));
      corrupted = true;
    } else if (cp <= 0xff) {
      bytes.push(cp);
      if (cp >= 0x80) corrupted = true;
    } else {
      // Not part of the mojibake — write it out as its own UTF-8 bytes.
      for (const b of Buffer.from(ch, "utf8")) bytes.push(b);
    }
  }
  if (!corrupted) return null;
  return Buffer.from(bytes).toString("utf8");
}

for (const file of process.argv.slice(2)) {
  const original = fs.readFileSync(file, "utf8");
  const fixed = repair(original);
  if (fixed === null) {
    console.log(`skip (clean): ${file}`);
    continue;
  }
  fs.writeFileSync(file, fixed, "utf8");
  console.log(`repaired: ${file}`);
}
