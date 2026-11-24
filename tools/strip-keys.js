/*
 * strip-keys.js — items for the solver subagent without the answer key (spec 10 §4, step 4).
 *
 *   node tools/strip-keys.js <file or folder>… [--out <file>]
 *
 * Reads trail quizzes, exercise sets, final tests, the placement pool and the lab contrast cards (their mini quizzes) (JSON files; a folder = every *.json in it,
 * topics.json and mixes.json skipped) and prints one JSON document: { about, tasks: [ … ] }, one task per item, in file order.
 * Every task keeps what the learner sees (prompt, options, text with gaps, hints, the English context, the set passage)
 * and loses the key and everything shown only after checking:
 *   correct, accepted, answers, explanation, optionNotes, trap, fixes, errorRange, noError, parts, gaps[].accepted,
 *   cells[].accepted (given cells keep their form: the learner sees them)
 * Types whose key IS the task are turned into what the learner sees, in a fixed shuffled order (seeded by the item id):
 *   reorder → "tiles" (the words of the first answer, as the engine builds them), match → "left" and "right" columns,
 *   find-error → "tokens" only, dictation → the text with a note (the learner hears it; check it for language problems only).
 * Output fields are those of the engine; "instruction" says in English what the learner is asked to do.
 */
"use strict";

const fs = require("fs");
const path = require("path");

global.window = global.window || global;
require(path.join(__dirname, "..", "js", "lang.js"));
require(path.join(__dirname, "..", "js", "exercise-logic.js"));
const X = global.LM.exLogic;

const KEY_FIELDS = ["correct", "accepted", "answers", "explanation", "optionNotes", "trap", "fixes", "errorRange", "noError", "parts"];
const INSTRUCTION = {
  "multiple-choice": "Choose the right option.",
  "reorder": "Put the tiles in order to say the English context sentence.",
  "find-error": "Find the wrong word or words (or say there is no mistake) and give the correction.",
  "short-answer": "Fill the gap ___.",
  "gap-fill": "Fill every gap {{n}}.",
  "match": "Match every item on the left with one on the right.",
  "transformation": "Complete the second sentence so it means the same as the source, using the key word unchanged.",
  "translate": "Translate the English sentence into the target language.",
  "dictation": "Dictation: the learner hears this text and writes it down. Check the text for language problems only.",
  "paradigm": "Fill every empty cell of the table."
};

/** Deterministic random numbers from a string (the same item always gets the same order). */
function seeded(text) {
  let x = 0;
  for (const c of String(text)) x = (x * 31 + c.codePointAt(0)) % 2147483647;
  x = x || 1;
  return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}

/** One item without its key. */
function stripItem(it, ctx) {
  const out = { id: it.id, type: it.type, instruction: INSTRUCTION[it.type] || "" };
  if (ctx) Object.keys(ctx).forEach(function (k) { if (ctx[k]) out[k] = ctx[k]; });
  Object.keys(it).forEach(function (k) {
    if (KEY_FIELDS.indexOf(k) !== -1 || k === "id" || k === "type" || k === "tags") return;
    out[k] = it[k];
  });
  const rng = seeded(it.id);
  if (it.type === "multiple-choice" && it.question && !it.prompt) out.instruction = INSTRUCTION["multiple-choice"]; // placement question
  if (it.type === "reorder") out.tiles = X.reorderTokens(it, rng).map(function (t) { return t.text; });
  if (it.type === "gap-fill") out.gaps = (it.gaps || []).map(function (g) { return g.hint ? { hint: g.hint } : {}; });
  if (it.type === "paradigm") out.cells = (it.cells || []).map(function (c) { return c.given ? { label: c.label, given: c.accepted[0] } : { label: c.label }; });
  if (it.type === "match") {
    delete out.pairs; delete out.extraRight;
    out.left = (it.pairs || []).map(function (p) { return p[0]; });
    out.right = X.prepareMatch(it, rng).map(function (r) { return r.text; });
  }
  if (it.type === "dictation") out.text = it.text;
  return out;
}

/** Tasks of one file: quiz / set / final test (items) or placement pool (questions). */
function stripFile(file) {
  const d = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  const src = path.basename(file);
  if (Array.isArray(d.questions)) {
    return d.questions.map(function (q) { return Object.assign({ file: src, level: q.level }, stripItem(Object.assign({}, q, { type: q.type || "multiple-choice" }))); });
  }
  if (Array.isArray(d.contrasts)) { // lab contrast cards (spec 06 E7): the mini quiz of each card
    return [].concat.apply([], d.contrasts.map(function (k) {
      const title = (k.sides || []).map(function (x) { return x.name; }).join(" vs ");
      return ((k.quiz && k.quiz.items) || []).map(function (it) { return stripItem(it, { file: src, level: k.level, set: "Contrast card: " + title }); });
    }));
  }
  const ctx = { file: src, level: d.level || null, set: d.title || d.id, passage: d.passage || null, script: d.script || null };
  return (d.items || []).map(function (it) { return stripItem(it, ctx); });
}

function filesOf(arg) {
  const p = path.resolve(arg);
  if (!fs.existsSync(p)) throw new Error("not found: " + arg);
  if (fs.statSync(p).isDirectory()) {
    return fs.readdirSync(p).filter(function (f) { return /\.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).sort().map(function (f) { return path.join(p, f); });
  }
  return [p];
}

function main(argv) {
  const outAt = argv.indexOf("--out");
  const out = outAt !== -1 ? argv[outAt + 1] : null;
  const inputs = argv.filter(function (a, i) { return outAt === -1 || (i !== outAt && i !== outAt + 1); });
  if (!inputs.length) { console.error("Usage: node tools/strip-keys.js <file or folder>… [--out <file>]"); process.exit(2); }
  const tasks = [].concat.apply([], inputs.map(filesOf).reduce(function (a, b) { return a.concat(b); }, []).map(stripFile));
  const doc = JSON.stringify({ about: "Tasks without the answer key (tools/strip-keys.js, spec 10 §4). Answer every task; the key is hidden.", tasks: tasks }, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, doc, "utf8"); console.log("strip-keys: " + tasks.length + " tasks → " + out); }
  else process.stdout.write(doc);
}

module.exports = { stripItem: stripItem, stripFile: stripFile, KEY_FIELDS: KEY_FIELDS };
if (require.main === module) main(process.argv.slice(2));
