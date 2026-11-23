/*
 * check-lang.js — `npm run check:lang` (CLAUDE.md rules 4 and 5, spec 04 §4.5, spec 09 rule 1).
 *
 * Scans code — js/, css/, index.html and tools/ (not data/, content/, tools/fixtures/, assets/vendor/) — and FAILS on:
 *   1. Polish letters ą ć ę ł ń ś ź ż (any case);
 *   2. the Polish opening quote „ (the closing ” is also the English closing quote, so it is allowed);
 *   3. a word from the stop list of frequent Polish UI and comment words, whole word, any case.
 * Spec 09 rule 1 (since stage 3 also errors): target-language facts live only in js/lang.js, js/config.js and content/ —
 *   4. locale codes (en-GB, en-US, es-ES, es-MX, es-419 …) in code (LM.fmt in js/utils.js may name en-US for dates);
 *   5. Spanish letters á é í ó ú ü ñ ¿ ¡ (ó counts here too);
 *   6. region names of the target language (Spain, Latin America, Mexico …) and frequent Spanish words (whole words).
 *   Test data of language-dependent logic lives in tools/fixtures/lang/ (spec 09 rule 3), which is not scanned.
 *
 * False positives: tools/check-lang-allow.txt, one rule per line: <path glob relative to the repo> <regex>; "#" comments.
 * This file, the allow list and tools/extract-strings.js are skipped (they hold the patterns).
 *
 *   node tools/check-lang.js            report and exit 1 on errors
 *   node tools/check-lang.js --list     also print every matching line
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LANGUAGE_RULES_ARE_ERRORS = true; // rules 4–6 (spec 09 rule 1) are errors since stage 3

const PL_LETTERS = /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/;
const PL_QUOTE = /„/;
const STOP_WORDS = [
  // spec 04 §4.5
  "dodaj", "zapisz", "anuluj", "usu[nń]", "dalej", "wr[oó][cć]", "wynik", "poziom", "zadanie", "poka[zż]", "ukryj", "umiem",
  "dzi[sś]", "szlak", "fiszki", "zestaw", "b[lł][aą]d", "powt[oó]rka", "egzamin",
  // frequent words of Polish comments and messages written without diacritics
  "oraz", "jest", "tylko", "albo", "przez", "jako", "kiedy", "gdy", "czy", "teraz", "jeszcze", "wszystkie", "sie", "nie",
  "tak", "jesli", "zeby", "przy", "bez", "dla", "pusty", "pusta", "strona", "podstrona", "profil", "postep", "uwaga", "poprawn\\w*",
  // found in stage 5: a Polish unit, a Polish label and the reference app's deck ids
  "pkt", "dodano", "dodany", "czasowniki", "kolokacje", "temat"
];
const STOP = new RegExp("(^|[^\\p{L}\\p{N}_])(" + STOP_WORDS.join("|") + ")(?=$|[^\\p{L}\\p{N}_])", "iu");
const LOCALE = /\b(en-GB|en-US|es-ES|es-MX|es-US|es-AR|es-CO|es-419|pl-PL)\b/;
const ES_LETTERS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡]/;
// Region names and frequent Spanish words that never occur in English code or comments (whole words)
const ES_WORDS = new RegExp("(^|[^\\p{L}\\p{N}_])(Spain|Latin America|Mexico|Argentina|Colombia|Castilian|castellano|espa\\w*ol|hola|gracias|" +
  "estoy|est[aá]s|gusta|gustan|quiero|tengo|tienes|pero|muy|usted|ustedes|vosotros|nosotros|hermano|hermana|ciudad|ayer|ma[nñ]ana|acuerdo)(?=$|[^\\p{L}\\p{N}_])", "iu");

const SKIP_DIRS = ["fixtures", "vendor", "node_modules"];
const SKIP_FILES = ["tools/check-lang.js", "tools/extract-strings.js", "tools/check-lang-allow.txt"];
const LANG_FILES = ["js/lang.js", "js/config.js"];

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, "/"); }

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (f) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (SKIP_DIRS.indexOf(f) === -1) walk(p, out); }
    else if (/\.(js|css|html)$/.test(f)) out.push(p);
  });
  return out;
}

function globToRe(glob) {
  return new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*") + "$");
}

function loadAllow() {
  const file = path.join(__dirname, "check-lang-allow.txt");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && l[0] !== "#"; }).map(function (l) {
    const sp = l.indexOf(" ");
    return { file: globToRe(l.slice(0, sp)), re: new RegExp(l.slice(sp + 1).trim(), "u") };
  });
}

function check() {
  const allow = loadAllow();
  const files = walk(path.join(ROOT, "js"), []).concat(walk(path.join(ROOT, "css"), []), walk(path.join(ROOT, "tools"), []), [path.join(ROOT, "index.html")]);
  const errors = [], warnings = [];
  files.forEach(function (file) {
    const r = rel(file);
    if (SKIP_FILES.indexOf(r) !== -1) return;
    const isLang = LANG_FILES.indexOf(r) !== -1;
    fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(function (line, i) {
      const allowed = function () { return allow.some(function (a) { return a.file.test(r) && a.re.test(line); }); };
      const at = r + ":" + (i + 1);
      let why = null;
      if (PL_LETTERS.test(line)) why = "Polish letter";
      else if (PL_QUOTE.test(line)) why = "Polish quote „";
      else { const m = STOP.exec(line); if (m) why = "Polish word \"" + m[2] + "\""; }
      if (why && !isLang && !allowed()) errors.push({ at: at, why: why, line: line.trim() });
      let warn = null;
      if (!isLang && LOCALE.test(line) && !(r === "js/utils.js" && /en-US/.test(line))) warn = "locale code " + LOCALE.exec(line)[1];
      else if (!isLang && !why && ES_LETTERS.test(line)) warn = "Spanish letter outside js/lang.js and js/config.js";
      else if (!isLang && !why && ES_WORDS.test(line)) warn = "target-language fact \"" + ES_WORDS.exec(line)[2] + "\" outside js/lang.js and js/config.js";
      if (warn && !allowed()) (LANGUAGE_RULES_ARE_ERRORS ? errors : warnings).push({ at: at, why: warn, line: line.trim() });
    });
  });
  return { errors: errors, warnings: warnings };
}

function summary(list) {
  const per = {};
  list.forEach(function (e) { const f = e.at.replace(/:\d+$/, ""); per[f] = (per[f] || 0) + 1; });
  return Object.keys(per).sort(function (a, b) { return per[b] - per[a]; }).map(function (f) { return String(per[f]).padStart(6) + "  " + f; });
}

if (require.main === module) {
  const res = check();
  const list = process.argv.indexOf("--list") !== -1;
  if (res.warnings.length) {
    console.log("Warnings: " + res.warnings.length);
    if (list) res.warnings.forEach(function (w) { console.log("  " + w.at + "  " + w.why + "  | " + w.line.slice(0, 140)); });
    else summary(res.warnings).forEach(function (l) { console.log(l); });
  }
  if (!res.errors.length) { console.log("check:lang: OK"); process.exit(0); }
  if (list) res.errors.forEach(function (e) { console.log("  " + e.at + "  " + e.why + "  | " + e.line.slice(0, 140)); });
  else summary(res.errors).forEach(function (l) { console.log(l); });
  console.error("check:lang: " + res.errors.length + " lines with Polish text or target-language facts outside js/lang.js and js/config.js");
  process.exit(1);
}

module.exports = { check: check, STOP: STOP };
