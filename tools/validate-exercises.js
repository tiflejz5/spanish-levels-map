/*
 * validate-exercises.js — validator of exercise sets, the topic → sets map, mixes and level final tests
 * (port of the reference exercise validator, spec 03). Run by `npm run validate` and `npm run build`;
 * errors stop the build (exit code 1).
 *
 * Kept from the reference: every per-item rule (all item types, ids unique across the bank, explanation,
 * passage / script for reading / listening), set fields, the map, mixes, final-test pool rules.
 * Dropped: the old English Tense Lab files, the old tense-picker tree, exam folders and the C1 format
 * (lab: stage 6; exams: stage E). Added: the item type `paradigm` (spec 06 E6), topics from content/syllabus.json,
 * final tests required only for AVAILABLE levels (spec 06 E1). Word counts use LM.lang.countWords (no English contractions).
 * The rules of docs/plan/scripts/validate_plan.py and spec 06 E11 are in tools/validate-content.js.
 *
 * Usage: node tools/validate-exercises.js [root]
 */
"use strict";

const fs = require("fs");
const path = require("path");

global.window = global.window || global;
require(path.join(__dirname, "..", "js", "lang.js"));
const LANG = global.LM.lang;

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const errors = [];
const warnings = [];
function err(msg) { errors.push(msg); }

function readJson(rel) {
  const file = path.join(CONTENT, rel);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (e) { err(rel + ": invalid JSON (" + e.message + ")"); return null; }
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPES = ["multiple-choice", "reorder", "find-error", "short-answer", "gap-fill", "match", "transformation", "translate", "dictation", "paradigm"];
const KINDS = ["form", "function", "meaning", "reading", "listening"];

// Topics from the syllabus; level status from content/levels.json
const syllabus = readJson("syllabus.json");
const status = ((readJson("levels.json") || {}).levels) || {};
const topics = new Set();
const topicLevel = {}, topicCategory = {};
(syllabus && syllabus.levels || []).forEach(function (l) {
  (l.units || []).forEach(function (u) { (u.topics || []).forEach(function (t) { topics.add(t.id); topicLevel[t.id] = l.id; topicCategory[t.id] = t.category; }); });
});
if (!topics.size) err("content/syllabus.json: no topics");

/** Words of a sentence as the engine compares them (LM.lang.normalizeSentence: case, punctuation and opening marks dropped). */
function words(sentence) {
  return LANG.normalizeSentence(sentence).split(" ").filter(Boolean);
}

function sameMultiset(a, b) { return a.slice().sort().join("\u0000") === b.slice().sort().join("\u0000"); }
function nonEmpty(s) { return typeof s === "string" && s.trim() !== ""; }

// ---------- Sets ----------
const itemIds = new Set();
const setsByTopic = {};
let itemCount = 0;
function checkItem(it, where, set) {
  const id = it && it.id;
  const at = where + " " + (id || "?");
  if (!nonEmpty(id)) err(where + ": item without an id");
  else if (itemIds.has(id)) err(where + ": duplicate item id " + id + " (ids must be unique across the whole bank)");
  else itemIds.add(id);
  itemCount++;
  if (TYPES.indexOf(it.type) === -1) { err(at + ": unknown type " + it.type); return; }
  if (!nonEmpty(it.explanation)) err(at + ": missing explanation");
  if (it.topic != null && !topics.has(it.topic)) err(at + ": topic " + it.topic + " does not exist in the syllabus");
  if (it.level != null && LEVELS.indexOf(it.level) === -1) err(at + ": unknown level " + it.level);
  if (it.tags != null && !(Array.isArray(it.tags) && it.tags.every(nonEmpty))) err(at + ": tags must be an array of strings");

  if (it.type === "multiple-choice") {
    const o = it.options;
    // Up to eight options only without shuffling (fixedOrder, e.g. A–H); shuffled — 2–4
    const maxOpts = it.fixedOrder ? 8 : 4;
    if (!Array.isArray(o) || o.length < 2 || o.length > maxOpts || !o.every(nonEmpty)) err(at + ": options — 2–" + maxOpts + " non-empty options");
    else if (new Set(o).size !== o.length) err(at + ": repeated options");
    if (!Number.isInteger(it.correct) || !Array.isArray(o) || it.correct < 0 || it.correct >= o.length) err(at + ": correct out of range");
    if (it.optionNotes != null) {
      if (!Array.isArray(it.optionNotes) || !Array.isArray(o) || it.optionNotes.length !== o.length) err(at + ": optionNotes must have as many entries as options");
      else if (Number.isInteger(it.correct) && it.correct >= 0 && it.correct < o.length && it.optionNotes[it.correct] !== null) err(at + ": optionNotes for the correct option must be null");
    }
    if (it.kind != null && KINDS.indexOf(it.kind) === -1) err(at + ": unknown kind " + it.kind);
    if ((it.kind == null || it.kind === "form") && String(it.prompt || "").indexOf("___") === -1) err(at + ": kind \"form\" needs a ___ gap in the prompt");
    if (it.kind === "reading" && !nonEmpty(set.passage)) err(at + ": kind \"reading\" without a passage in the set");
    if (it.kind === "listening" && !nonEmpty(it.script) && !nonEmpty(set && set.script)) err(at + ": kind \"listening\" without a script (neither in the item nor in the set)");
  } else if (it.type === "reorder") {
    const a = it.answers;
    if (!Array.isArray(a) || !a.length || !a.every(nonEmpty)) { err(at + ": missing answers"); return; }
    const base = words(a[0]);
    if (base.length < 2) err(at + ": the sentence to put in order has fewer than 2 words");
    a.slice(1).forEach(function (x) { if (!sameMultiset(words(x), base)) err(at + ": answers have different word sets (\"" + x + "\")"); });
    const extra = it.extraTokens || [];
    if (!Array.isArray(extra) || extra.length > 2) err(at + ": extraTokens — at most 2");
    else extra.forEach(function (e) { if (base.indexOf(String(e).toLowerCase()) !== -1) err(at + ": extraToken \"" + e + "\" occurs in the answer"); });
  } else if (it.type === "find-error") {
    if (!Array.isArray(it.tokens) || it.tokens.length < 2 || !it.tokens.every(nonEmpty)) err(at + ": tokens — at least 2 words");
    if (!it.noError) {
      const r = it.errorRange;
      if (!(Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[0] <= r[1] && Array.isArray(it.tokens) && r[1] < it.tokens.length)) err(at + ": errorRange outside tokens");
      if (!Array.isArray(it.fixes) || !it.fixes.length || !it.fixes.every(function (f) { return typeof f === "string"; })) err(at + ": fixes — a non-empty list");
      else if (Array.isArray(r) && Array.isArray(it.tokens)) {
        const wrong = it.tokens.slice(r[0], r[1] + 1).join(" ").toLowerCase();
        it.fixes.forEach(function (f) { if (f.toLowerCase() === wrong) err(at + ": the fix \"" + f + "\" is the same as the wrong fragment"); });
      }
    }
  } else if (it.type === "short-answer") {
    if ((String(it.prompt || "").match(/___/g) || []).length !== 1) err(at + ": the prompt must have exactly one ___ gap");
    if (!Array.isArray(it.accepted) || !it.accepted.length || !it.accepted.every(nonEmpty)) err(at + ": accepted — a non-empty list");
  } else if (it.type === "paradigm") {
    checkParadigm(it, at);
  } else {
    checkV6Item(it, at);
  }
}

/**
 * paradigm ("Fill the table", spec 06 E6): prompt and lemma, 3–8 cells with unique labels and accepted forms, at least two
 * cells to fill, given only as true; a cell's accepted forms differ after normalisation; gloss and explanation are text.
 */
function checkParadigm(it, at) {
  if (!nonEmpty(it.prompt)) err(at + ": paradigm without a prompt");
  if (!nonEmpty(it.lemma)) err(at + ": paradigm without a lemma");
  if (it.gloss != null && !nonEmpty(it.gloss)) err(at + ": gloss must be non-empty text");
  const cells = it.cells;
  if (!Array.isArray(cells) || cells.length < 3 || cells.length > 8) { err(at + ": cells — 3–8 cells"); return; }
  const labels = new Set();
  cells.forEach(function (c, i) {
    if (!c || !nonEmpty(c.label)) err(at + ": cell " + (i + 1) + " without a label");
    else if (labels.has(c.label.trim().toLowerCase())) err(at + ": duplicate cell label " + c.label);
    else labels.add(c.label.trim().toLowerCase());
    if (!c || !Array.isArray(c.accepted) || !c.accepted.length || !c.accepted.every(nonEmpty)) err(at + ": cell " + (i + 1) + " — accepted must be a non-empty list");
    else if (new Set(c.accepted.map(LANG.normalizeAnswer)).size !== c.accepted.length) err(at + ": cell " + (i + 1) + " — repeated accepted forms");
    if (c && c.given != null && c.given !== true) err(at + ": cell " + (i + 1) + " — given must be true or left out");
  });
  if (cells.filter(function (c) { return c && !c.given; }).length < 2) err(at + ": at least two cells to fill");
}

// ---------- Item types gap-fill, match, transformation, translate, dictation ----------
const MATCH_MODES = ["definition", "halves", "translation", "response"];
/** Word count of a transformation answer: LM.lang.countWords (the engine counts the same way, LM.exLogic.trTokens). */
function answerWords(s) { return LANG.countWords(s); }
function norm6(s) { return String(s).trim().replace(/\s+/g, " ").replace(/’/g, "'").replace(/[.,!?;]+$/, "").toLowerCase(); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function checkV6Item(it, at) {
  if (it.type === "gap-fill") {
    const nums = (String(it.text || "").match(/\{\{(\d+)\}\}/g) || []).map(function (m) { return Number(m.slice(2, -2)); });
    const gaps = Array.isArray(it.gaps) ? it.gaps : [];
    if (nums.length < 1 || nums.length > 4) err(at + ": gap-fill must have 1–4 gaps, it has " + nums.length);
    if (nums.join(",") !== nums.map(function (_, i) { return i + 1; }).join(",")) err(at + ": gaps must be numbered {{1}}…{{n}} in order");
    if (gaps.length !== nums.length) err(at + ": gaps has " + gaps.length + " entries, but there are " + nums.length + " gaps");
    gaps.forEach(function (g, i) {
      if (!g || !Array.isArray(g.accepted) || !g.accepted.length || !g.accepted.every(nonEmpty)) err(at + ": gap " + (i + 1) + " without accepted");
      if (g && g.hint != null && !nonEmpty(g.hint)) err(at + ": gap " + (i + 1) + " — hint must be non-empty text");
    });
  } else if (it.type === "match") {
    const pairs = Array.isArray(it.pairs) ? it.pairs : [];
    if (pairs.length < 3 || pairs.length > 6) err(at + ": match must have 3–6 pairs, it has " + pairs.length);
    if (!pairs.every(function (x) { return Array.isArray(x) && x.length === 2 && nonEmpty(x[0]) && nonEmpty(x[1]); })) { err(at + ": each pair is [left, right] (non-empty texts)"); return; }
    const left = pairs.map(function (x) { return norm6(x[0]); }), right = pairs.map(function (x) { return norm6(x[1]); });
    if (new Set(left).size !== left.length || new Set(right).size !== right.length) err(at + ": pair texts must be unique");
    const extra = it.extraRight == null ? [] : it.extraRight;
    if (!Array.isArray(extra) || extra.length > 2 || !extra.every(nonEmpty)) err(at + ": extraRight — at most 2 non-empty texts");
    else if (extra.some(function (e) { return right.indexOf(norm6(e)) !== -1; })) err(at + ": extraRight repeats the right side of a pair");
    if (MATCH_MODES.indexOf(it.mode) === -1) err(at + ": mode must be one of: " + MATCH_MODES.join(", "));
  } else if (it.type === "transformation") {
    const kw = String(it.keyword || "").trim();
    const answers = Array.isArray(it.answers) ? it.answers : [];
    const lim = it.wordLimit == null ? [2, 5] : it.wordLimit;
    if (!(Array.isArray(lim) && lim.length === 2 && lim[0] >= 1 && lim[0] <= lim[1])) { err(at + ": wordLimit must be [min, max]"); return; }
    if (!kw || !answers.length || !answers.every(nonEmpty)) err(at + ": transformation needs keyword and answers");
    answers.forEach(function (a) {
      if (kw && !new RegExp("(^|[^\\p{L}\\p{N}'])" + escapeRe(kw.toLowerCase()) + "(?![\\p{L}\\p{N}])", "u").test(String(a).toLowerCase())) err(at + ": the answer \"" + a + "\" does not contain the key word " + kw);
      const n = answerWords(a);
      if (n < lim[0] || n > lim[1]) err(at + ": the answer \"" + a + "\" has " + n + " words, limit " + lim[0] + "–" + lim[1]);
    });
    if (it.parts != null && (!Array.isArray(it.parts) || it.parts.length !== 2 || !it.parts.every(function (p) { return Array.isArray(p) && p.length && p.every(nonEmpty); }))) err(at + ": parts must have exactly 2 entries (lists of variants)");
    ["source", "before", "after"].forEach(function (k) { if (typeof it[k] !== "string") err(at + ": missing field " + k); });
    if (!nonEmpty(it.source)) err(at + ": source must not be empty");
  } else if (it.type === "translate") {
    if (!Array.isArray(it.accepted) || it.accepted.length < 1 || it.accepted.length > 8 || !it.accepted.every(nonEmpty)) err(at + ": translate needs 1–8 accepted");
    if (!nonEmpty(it.source)) err(at + ": missing source");
    if (it.hint != null && !nonEmpty(it.hint)) err(at + ": hint must be non-empty text");
  } else if (it.type === "dictation") {
    const n = String(it.text || "").trim().split(/\s+/).filter(Boolean).length;
    if (n < 4 || n > 30) err(at + ": the dictation has " + n + " words (4–30)");
    const mp = it.maxPlays == null ? 3 : it.maxPlays;
    if (!Number.isInteger(mp) || mp < 1 || mp > 5) err(at + ": maxPlays 1–5");
    if (it.accepted != null && (!Array.isArray(it.accepted) || !it.accepted.every(nonEmpty))) err(at + ": accepted — a list of non-empty variants");
  }
}


// ---------- Sets (content/exercises/<id>.json) ----------
const SETS_DIR = path.join(CONTENT, "exercises");
const setFiles = fs.existsSync(SETS_DIR) ? fs.readdirSync(SETS_DIR).filter(function (f) { return /.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).sort() : [];
const setIds = new Set();
setFiles.forEach(function (f) {
  const rel = "exercises/" + f;
  const set = readJson(rel);
  if (!set) return;
  const id = f.replace(/.json$/, "");
  setIds.add(id);
  if (set.id !== id) err(rel + ": set id (" + set.id + ") ≠ file name");
  if (set.version !== 1) err(rel + ": version must be 1");
  if (set.topic != null && !topics.has(set.topic)) err(rel + ": topic " + set.topic + " does not exist in the syllabus");
  if (set.level != null && LEVELS.indexOf(set.level) === -1) err(rel + ": unknown level " + set.level);
  if (!nonEmpty(set.title)) err(rel + ": missing title");
  if (!Array.isArray(set.items) || !set.items.length) { err(rel + ": missing items"); return; }
  set.items.forEach(function (it) { checkItem(Object.assign({ topic: set.topic, level: set.level }, it), f, set); });
});

// ---------- Level final tests (content/tests/final-<level>.json) ----------
let finalPools = 0, finalItems = 0;
const FINAL_TYPES = ["multiple-choice", "gap-fill", "short-answer", "match", "transformation", "translate", "reorder", "find-error", "paradigm"];
LEVELS.forEach(function (lvl) {
  const f = "final-" + lvl.toLowerCase() + ".json";
  const rel = "tests/" + f;
  if (!fs.existsSync(path.join(CONTENT, rel))) {
    if (status[lvl] === "available") warnings.push(rel + ": no final test pool, but level " + lvl + " is available (an error from the first content stage on)");
    return;
  }
  const set = readJson(rel);
  if (!set) return;
  finalPools++;
  const at = rel;
    if (set.version !== 1) err(at + ": version must be 1");
    if (set.kind !== "level-test") err(at + ": kind must be \"level-test\"");
    if (set.id !== "final-" + lvl.toLowerCase()) err(at + ": id must be \"final-" + lvl.toLowerCase() + "\"");
    if (set.level !== lvl) err(at + ": level must be " + lvl);
    if (set.draw !== 20) err(at + ": draw must be 20");
    if (set.passPercent !== 80) err(at + ": passPercent must be 80");
    if (set.defaultMode !== "exam") err(at + ": defaultMode must be \"exam\"");
    if (!nonEmpty(set.title)) err(at + ": missing title");
    if (!Array.isArray(set.items) || set.items.length !== 30) { err(at + ": the pool must have 30 items, it has " + (Array.isArray(set.items) ? set.items.length : 0)); if (!Array.isArray(set.items)) return; }
    finalItems += set.items.length;
    let mc = 0, paradigms = 0;
    const covered = new Set();
    const perCat = {};
    set.items.forEach(function (it) {
      checkItem(Object.assign({ level: set.level }, it), f, set); // fields by type, ids unique across the whole bank
      const q = at + " " + (it.id || "?");
      if (!nonEmpty(it.topic)) err(q + ": missing the required topic");
      else if (topicLevel[it.topic] !== lvl) err(q + ": topic \"" + it.topic + "\" does not belong to level " + lvl);
      else { covered.add(it.topic); perCat[topicCategory[it.topic]] = (perCat[topicCategory[it.topic]] || 0) + 1; }
      if (it.type === "dictation") err(q + ": dictation is not allowed in a final test (the test must not depend on a voice)");
      else if (FINAL_TYPES.indexOf(it.type) === -1) err(q + ": type \"" + it.type + "\" is not allowed in a final test");
      if (it.type === "transformation" && LEVELS.indexOf(lvl) < 2) err(q + ": transformation only from B1");
      if (it.type === "translate" && LEVELS.indexOf(lvl) < 1) err(q + ": translate only from A2");
      if (it.type === "multiple-choice") mc++;
      if (it.type === "paradigm") paradigms++;
    });
    if (paradigms > 2) err(at + ": at most two paradigm items (there are " + paradigms + ")");
    if (mc * 2 < set.items.length) err(at + ": " + mc + " of " + set.items.length + " items are multiple choice (at least half are required)");
    const levelTopics = Object.keys(topicLevel).filter(function (t) { return topicLevel[t] === lvl; });
    if (covered.size < 0.7 * levelTopics.length) err(at + ": the pool covers " + covered.size + " of " + levelTopics.length + " topic pages (at least 70% required)");
    // Category proportions as on the level list (a warning when off by more than 2 items from the proportional share)
    const catCount = {};
    levelTopics.forEach(function (t) { catCount[topicCategory[t]] = (catCount[topicCategory[t]] || 0) + 1; });
    Object.keys(catCount).forEach(function (c) {
      const want = 30 * catCount[c] / levelTopics.length;
      const got = perCat[c] || 0;
      if (!got) err(at + ": no items from the category \"" + c + "\"");
      else if (Math.abs(got - want) > 2) warnings.push(at + ": category \"" + c + "\" has " + got + " items, proportionally about " + want.toFixed(1));
    });
});

// ---------- Map topic → sets (content/exercises/topics.json) ----------
const map = readJson("exercises/topics.json");
if (map) {
  Object.keys(map.topics || {}).forEach(function (t) {
    if (!topics.has(t)) err("exercises/topics.json: unknown topic " + t);
    (map.topics[t] || []).forEach(function (s) {
      if (!setIds.has(s)) err("exercises/topics.json: missing file exercises/" + s + ".json");
      else (setsByTopic[t] = setsByTopic[t] || []).push(s);
    });
  });
  setIds.forEach(function (s) {
    const inMap = Object.keys(map.topics || {}).some(function (t) { return map.topics[t].indexOf(s) !== -1; });
    if (!inMap) warnings.push("set " + s + " is not listed in exercises/topics.json (it will not appear in the app)");
  });
}

// ---------- Mixed sets (content/exercises/mixes.json) ----------
const mixes = readJson("exercises/mixes.json");
if (mixes) {
  const seen = new Set();
  (mixes.mixes || []).forEach(function (m) {
    const at = "mixes.json " + (m.id || "?");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id || "")) err(at + ": id: lower-case letters, digits and hyphens only");
    if (seen.has(m.id)) err(at + ": duplicate id");
    seen.add(m.id);
    if (!nonEmpty(m.title)) err(at + ": missing title");
    if (!Array.isArray(m.topics) || !m.topics.length) err(at + ": missing topics");
    (m.topics || []).forEach(function (t) {
      if (!topics.has(t)) err(at + ": unknown topic " + t);
      else if (!setsByTopic[t]) warnings.push(at + ": topic " + t + " has no sets yet");
    });
    (m.types || []).forEach(function (t) { if (TYPES.indexOf(t) === -1) err(at + ": unknown type " + t); });
    if (m.count != null && !(Number.isInteger(m.count) && m.count > 0)) err(at + ": count must be a positive number");
  });
}


console.log("Exercise validation: sets " + setIds.size + ", items " + itemCount + ", mixes " + (mixes ? (mixes.mixes || []).length : 0) + ", final tests " + finalPools + " (items " + finalItems + ")");
warnings.forEach(function (w) { console.warn("WARNING: " + w); });
if (errors.length) {
  console.error("ERRORS (" + errors.length + "):");
  errors.forEach(function (e) { console.error("  - " + e); });
  process.exit(1);
}
console.log("OK");
