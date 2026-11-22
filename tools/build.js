/*
 * build.js — the one build entry point (spec 02 §4).
 *
 *   npm run build              validate → generate data/*.js from content/ (data/ is rebuilt from scratch)
 *   npm run build -- --bump    the same, then raise the version stamp: package.json "lmVersion",
 *                              ?v=N on every local <script>/<link> in index.html and LM.VERSION in js/config.js
 *   node tools/build.js --check   only the checks (used by `npm run validate`), writes nothing
 *
 * Modules live in tools/build/ (one per data kind). Each gets a shared ctx with the syllabus, the topic map,
 * log / warn / error. Errors stop the build with exit code 1; warnings are printed and the build goes on.
 * The page works without running this: data/ is committed.
 */
"use strict";

const C = require("./build/common");
const cp = require("child_process");

const args = process.argv.slice(2);
const CHECK = args.indexOf("--check") !== -1;
const BUMP = args.indexOf("--bump") !== -1;

const ctx = {
  errors: [], warnings: [],
  log: function (m) { console.log(m); },
  warn: function (m) { ctx.warnings.push(m); },
  error: function (m) { ctx.errors.push(m); }
};

function finish(label) {
  ctx.warnings.forEach(function (w) { console.warn("WARNING: " + w); });
  if (ctx.errors.length) {
    console.error("ERRORS (" + ctx.errors.length + "):");
    ctx.errors.forEach(function (e) { console.error("  - " + e); });
    process.exit(1);
  }
  console.log(label);
}

/** Separate validators that are files of their own (tools/validate-*.js). */
function runValidators() {
  const list = require("./validate").VALIDATORS;
  list.forEach(function (v) {
    const r = cp.spawnSync(process.execPath, [C.path.join(__dirname, v)], { stdio: "inherit" });
    if (r.status !== 0) { console.error("Validator failed: tools/" + v); process.exit(1); }
  });
}

function bump() {
  const pkgFile = C.path.join(C.ROOT, "package.json");
  const pkg = JSON.parse(C.read(pkgFile));
  const next = String((parseInt(pkg.lmVersion, 10) || 0) + 1);
  pkg.lmVersion = next;
  C.fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  const htmlFile = C.path.join(C.ROOT, "index.html");
  const html = C.read(htmlFile).replace(/((?:src|href)="(?!https?:)[^"?]+\.(?:js|css))(?:\?v=[\w.-]+)?"/g, "$1?v=" + next + "\"");
  C.fs.writeFileSync(htmlFile, html, "utf8");
  const cfgFile = C.path.join(C.ROOT, "js", "config.js");
  const cfg = C.read(cfgFile).replace(/LM\.VERSION = "[\w.-]*";/, "LM.VERSION = \"" + next + "\";");
  C.fs.writeFileSync(cfgFile, cfg, "utf8");
  console.log("Version stamp: " + next + " (package.json lmVersion, index.html ?v=, LM.VERSION)");
}

const MODULES = ["syllabus", "pages", "tests", "quizzes", "trail", "lab", "exercises", "decks", "writing", "exams", "search"];

// 1. Validate (structural checks run inside the modules; content validators are separate files)
if (!CHECK) runValidators();
require("./build/syllabus").load(ctx);
if (ctx.errors.length) finish("");

// 2. Generate into tmp/build-data, then replace data/ only when there are no errors
const OUT = C.path.join(C.ROOT, "tmp", "build-data");
C.fs.rmSync(OUT, { recursive: true, force: true });
C.fs.mkdirSync(OUT, { recursive: true });
C.OUT = OUT;
MODULES.forEach(function (m) { require("./build/" + m).build(ctx); });
require("./build/syllabus").checkAvailable(ctx);
if (!CHECK && !ctx.errors.length) {
  C.fs.rmSync(C.DATA, { recursive: true, force: true });
  C.fs.renameSync(OUT, C.DATA);
} else C.fs.rmSync(OUT, { recursive: true, force: true });

if (BUMP && !CHECK && !ctx.errors.length) bump();
finish(CHECK ? "Build checks: OK" : "Build: OK, " + C.written.length + " files in data/");
