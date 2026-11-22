/*
 * check-lang.js — `npm run check:lang` (CLAUDE.md rule 4, spec 04, spec 09 rule 1).
 *
 * STAGE 1 VERSION: fails when code contains Polish letters or Polish quotes („ ”) in js/, css/, index.html
 * or tools/ (generated data/, content/ and test fixtures are not code). Prints a count per file.
 * Stage 2 extends it (Polish words without diacritics), stage 3 adds the rule "language facts only in
 * js/lang.js and js/config.js".
 *
 * Expected to FAIL until stage 2 has translated the UI.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PL = /[ąćęłńśźżĄĆĘŁŃŚŹŻ„]/g; // letters only Polish has (ó is Spanish too)
const SKIP_DIRS = ["fixtures", "vendor"];

function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (SKIP_DIRS.indexOf(f) === -1) walk(p, out); }
    else if (/\.(js|css|html)$/.test(f)) out.push(p);
  });
  return out;
}

const files = walk(path.join(ROOT, "js"), []).concat(walk(path.join(ROOT, "css"), []), walk(path.join(ROOT, "tools"), []), [path.join(ROOT, "index.html")]);
let total = 0;
const rows = [];
files.forEach(function (file) {
  if (/js[\\/](lang|config)\.js$/.test(file)) return; // the only places where target-language text may live
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let n = 0;
  lines.forEach(function (l) { if (PL.test(l)) n++; PL.lastIndex = 0; });
  if (n) { rows.push([path.relative(ROOT, file).replace(/\\/g, "/"), n]); total += n; }
});
rows.sort(function (a, b) { return b[1] - a[1]; });
if (!total) { console.log("check:lang: OK"); process.exit(0); }
rows.forEach(function (r) { console.log(String(r[1]).padStart(6) + "  " + r[0]); });
console.error("check:lang: " + total + " lines with Polish text in " + rows.length + " files");
process.exit(1);
