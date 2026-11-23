/*
 * extract-strings.js — lists the string literals of js/ that are probably shown to the user (spec 04 §4.6).
 *
 *   node tools/extract-strings.js              prints "file:line  text" for every likely user-visible literal, then a count
 *   node tools/extract-strings.js --out FILE   also writes the list to FILE (e.g. tmp/strings.txt)
 *   node tools/extract-strings.js --polish     only literals that still look Polish (check-lang rules)
 *
 * A small tokenizer collects ' " ` literals outside comments and regular expressions. A literal counts as visible when it
 * has a letter and either a space between words or a capitalised word of 3+ letters. Selectors, keys, paths, URLs,
 * CSS values and ids are skipped. It is a reading aid for the consistency pass, not a test.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PL = /[ąćęłńśźżĄĆĘŁŃŚŹŻ„]/;

/** String literals of a JS source: [{ line, text }]. Template literals keep ${…} as written. */
function literals(src) {
  const out = [];
  let i = 0, line = 1, last = "";
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { const j = src.indexOf("*/", i + 2); const end = j < 0 ? n : j + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|return$|typeof$|^$/.test(last)) {
      // regular expression literal
      i++;
      let inClass = false;
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "[") inClass = true; else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || "")) i++;
      last = "re";
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") {
      const startLine = line;
      let j = i + 1, text = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") { text += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === "\n") line++;
        text += src[j];
        j++;
      }
      out.push({ line: startLine, text: text });
      i = j + 1;
      last = "str";
      continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++; last = src.slice(i, j); i = j; continue; }
      last = c;
    }
    i++;
  }
  return out;
}

function visible(t) {
  if (!/\p{L}/u.test(t)) return false;
  if (/^(#\/|https?:|data\/|js\/|assets\/|\.|\[|:|@)/.test(t)) return false;           // routes, URLs, paths, selectors
  if (/^[a-z0-9_$.\-:/#*[\]="' ]+$/.test(t) && !/ [a-z]+ [a-z]+/.test(t)) return false;   // ids, class lists, keys
  if (/^(var\(|rgba?\(|translate|scale|M\d|\d)/.test(t)) return false;                   // CSS and SVG values
  return / \p{L}/u.test(t) || /\p{Lu}\p{L}{2,}/u.test(t) || PL.test(t);
}

function extract(opts) {
  opts = opts || {};
  const dir = path.join(ROOT, "js");
  const rows = [];
  fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
    literals(fs.readFileSync(path.join(dir, f), "utf8")).forEach(function (l) {
      if (!visible(l.text)) return;
      if (opts.polish && !PL.test(l.text) && !require("./check-lang").STOP.test(l.text)) return;
      rows.push({ at: "js/" + f + ":" + l.line, text: l.text });
    });
  });
  return rows;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rows = extract({ polish: args.indexOf("--polish") !== -1 });
  const text = rows.map(function (r) { return r.at.padEnd(30) + "  " + r.text; }).join("\n");
  const o = args.indexOf("--out");
  if (o !== -1 && args[o + 1]) {
    fs.mkdirSync(path.dirname(path.resolve(args[o + 1])), { recursive: true });
    fs.writeFileSync(path.resolve(args[o + 1]), text + "\n", "utf8");
  } else console.log(text);
  console.log("extract-strings: " + rows.length + " likely user-visible literals" + (args.indexOf("--polish") !== -1 ? " that still look Polish" : ""));
}

module.exports = { extract: extract, literals: literals, visible: visible };
