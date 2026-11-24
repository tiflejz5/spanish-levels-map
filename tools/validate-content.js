/*
 * validate-content.js — content rules of docs/plan/scripts/validate_plan.py, ported rule by rule, plus the
 * heuristics of spec 06 E11. Run by `npm run validate` and `npm run build`; errors stop the build (exit code 1).
 *
 *   node tools/validate-content.js              the real content (content/), like `validate_plan.py content`
 *   node tools/validate-content.js docs/plan    the plan: syllabus + examples/, like `validate_plan.py docs/plan`
 *   node tools/validate-content.js <dir>        any folder with syllabus.json (and examples/ for the examples mode)
 *
 * Ported from validate_plan.py (same rule, same severity): syllabus (levels, units, topic ids, categories), topic pages
 * (front matter, file name, fixed sections in order, mistakes and practice format, length, links, characters), trail
 * quizzes, exercise sets and final tests (shape, ids, every item type), decks, placement pool, lab files.
 * Spec 06 E11 on top:
 *   1. an accepted answer that starts with a subject pronoun needs the variant without it (warning; translate, short-answer, typed cards)
 *   2. an -o / -a adjective after a gender link ("I am" / "you are", LM.lang.content.genderLinks) without its other-gender
 *      twin and without a gender note (warning); a "you (plural)" task without a region note that accepts only the informal
 *      or only the formal plural forms (warning)
 *   3. characters outside the target alphabet + ASCII + typography in target-language fields (error)
 *   4. multiple choice: exactly one correct option, no duplicates after normalisation, explanation, optionNotes length (errors)
 *   + translate sources ≤ 9 words at A1–A2, ≤ 14 later (spec 07 §5, warning).
 * Two deliberate differences from validate_plan.py, both because content/ still holds only the plan's samples:
 *   - the placement pool shape (5 grammar, 3 vocabulary, 2 reading per level) is a warning until STRICT is set
 *     (the first stage X writes the whole pool, spec 10 §3); validate_plan.py reports it as an error for content/;
 *   - completeness of an "available" level is checked by tools/build/syllabus.js (checkAvailable, a warning until the first
 *     content stage); validate_plan.py reads levels.json as a flat map and never sees the "levels" object.
 * Language facts (alphabet, pronouns, gender links, plural "you" forms) come from LM.lang.content (js/lang.js).
 */
"use strict";

const fs = require("fs");
const path = require("path");

global.window = global.window || global;
require(path.join(__dirname, "..", "js", "config.js"));
require(path.join(__dirname, "..", "js", "lang.js"));
require(path.join(__dirname, "..", "js", "learning.js")); // LM.learn.SKILL_OF: syllabus category → placement skill (E10)
require(path.join(__dirname, "..", "js", "lab-logic.js")); // LM.labLogic.validate: lab structure (spec 06 E7)
const LANG = global.LM.lang;
const APP = global.LM.APP;
const FACTS = LANG.content;
const LAB = global.LM.labLogic;

const STRICT = true;  // spec 10 §3: true from the first stage X (the whole placement pool exists)

const REPO = path.join(__dirname, "..");
const ARG = process.argv[2] ? path.resolve(process.argv[2]) : path.join(REPO, "content");
const EXAMPLES = fs.existsSync(path.join(ARG, "examples"));
const TREE = EXAMPLES ? path.join(ARG, "examples") : ARG;
const FULL = !EXAMPLES;

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TYPO = "—–…“”‘’·→✗✓×÷°€";
const SECTIONS = {
  verbs: ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
  grammar: ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
  cases: ["How it works", "When to use it", "Examples", "Common mistakes", "Practice", "Answers"],
  functions: ["Key phrases", "Dialogue", "Common mistakes", "Practice", "Answers"],
  vocabulary: ["Words", "Word partners", "Common mistakes", "Practice", "Answers"]
};
const OPTIONAL = ["Good to know", "Culture note", "Real life vs exam"];
const WORDS = { A1: [300, 700], A2: [300, 700], B1: [450, 850], B2: [450, 850], C1: [500, 1000], C2: [500, 1000] };
const TYPES = ["multiple-choice", "reorder", "find-error", "short-answer", "gap-fill", "match", "transformation", "translate", "dictation", "paradigm"];
const CASES = ["nominative", "genitive", "dative", "accusative", "instrumental", "locative", "vocative"];
const SOURCE_WORDS = { A1: 9, A2: 9, B1: 14, B2: 14, C1: 14, C2: 14 };
// English cues (the language of explanation): a gender note, a "you (plural)" task, a region note (labels of the voice variants)
const GENDER_NOTE = /\b(female|male|woman|man|women|men|girl|boy|girls|boys|feminine|masculine|she|he|her|his)\b|\((m|f)\)/i;
const YOU_PLURAL = /\byou[ ,(]*plural\b|\byou all\b|\byou guys\b|\bboth of you\b|\byou two\b|\(to (two|three|several|a group|both|your friends|your parents)\b/i;
const REGION_NOTE = new RegExp("\\b(" + APP.speech.variants.map(function (v) { return v.label; }).join("|") + "|region|regional)\\b", "i");

const errors = [], warnings = [];
function rel(p) { return path.relative(REPO, p).replace(/\\/g, "/"); }
function err(where, msg) { errors.push("ERROR  " + where + ": " + msg); }
function warn(where, msg) { warnings.push("warn   " + where + ": " + msg); }
function load(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")); } catch (e) { err(rel(p), "cannot read JSON (" + e.message + ")"); return null; }
}
function list(dir, re) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(function (f) { return re.test(f); }).sort().map(function (f) { return path.join(dir, f); }) : []; }
function subdirs(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(function (f) { return fs.statSync(path.join(dir, f)).isDirectory(); }).sort() : []; }
function str(x) { return x == null ? "" : String(x); }
function isInt(x) { return Number.isInteger(x); }
function words(s) { return str(s).trim().split(/\s+/).filter(Boolean); }

// ---------------------------------------------------------------- syllabus
function checkSyllabus(p) {
  const d = load(p);
  const topics = {};
  if (!d) return topics;
  const w = rel(p);
  if (d.lang !== APP.targetLang) err(w, "lang is " + JSON.stringify(d.lang) + ", expected " + JSON.stringify(APP.targetLang));
  const cats = d.categories || {};
  if ((d.levels || []).map(function (L) { return L.id; }).join() !== LEVELS.join()) err(w, "levels must be exactly A1…C2 in order");
  const unitIds = new Set();
  (d.levels || []).forEach(function (L) {
    ["land", "goal"].forEach(function (k) { if (!L[k]) err(w, L.id + ": missing " + k); });
    if (!(L.units || []).length) err(w, L.id + ": no units");
    (L.units || []).forEach(function (U) {
      if (unitIds.has(U.id)) err(w, "duplicate unit id " + U.id);
      unitIds.add(U.id);
      const n = (U.topics || []).length;
      if (!n) err(w, U.id + ": empty unit");
      if (n < 2 || n > 8) warn(w, U.id + ": " + n + " topics (expected 2–8)");
      (U.topics || []).forEach(function (T) {
        const tid = str(T.id);
        const m = /^(a1|a2|b1|b2|c1|c2)-([a-z]+)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(tid);
        if (!m) { err(w, "bad topic id " + JSON.stringify(tid)); return; }
        if (m[1].toUpperCase() !== L.id) err(w, tid + " is listed under " + L.id);
        if (m[2] !== T.category || !(T.category in cats)) err(w, tid + ": category mismatch or unknown category");
        if (topics[tid]) err(w, "duplicate topic id " + tid);
        ["title", "example"].forEach(function (k) { if (!T[k]) err(w, tid + ": missing " + k); });
        topics[tid] = Object.assign({}, T, { level: L.id, unit: U.id });
      });
    });
  });
  return topics;
}

// ---------------------------------------------------------------- shared rules
const PUNCT = new RegExp("[" + LANG.sentenceOpeners + "?!.,;:]", "g");
const ALLOWED = new Set((FACTS.alphabet + TYPO).split(""));
/** E11 rule 3: characters outside the target alphabet + ASCII + typography (wrong-language letters, broken encoding). */
function charset(where, text) {
  const bad = [];
  Array.from(str(text)).forEach(function (c) { if (c.codePointAt(0) > 126 && !ALLOWED.has(c) && bad.indexOf(c) === -1) bad.push(c); });
  if (bad.length) err(where, "characters outside the " + APP.language + " alphabet: " + bad.sort().join(" ") + " in " + JSON.stringify(str(text).slice(0, 60)));
}

/** E11 rule 1: an accepted answer starting with a subject pronoun needs the variant without it. */
function pronounVariants(where, accepted) {
  const norm = function (s) { return str(s).replace(PUNCT, "").trim().toLowerCase(); };
  const have = new Set(accepted.map(norm));
  accepted.forEach(function (a) {
    const w = norm(a).split(/\s+/);
    if (w.length > 1 && FACTS.subjectPronouns.indexOf(w[0]) !== -1 && !have.has(w.slice(1).join(" "))) {
      warn(where, "accepted " + JSON.stringify(a) + " starts with a subject pronoun; the variant without it is missing");
    }
  });
}

/** Every full target sentence an item accepts (for the E11 heuristics), normalized. */
function fullSentences(it) {
  const out = [];
  const add = function (s) { const n = LANG.normalizeSentence(s); if (n && out.indexOf(n) === -1) out.push(n); };
  if (it.type === "translate") (it.accepted || []).forEach(add);
  else if (it.type === "short-answer") (it.accepted || []).forEach(function (a) { add(str(it.prompt).replace(/\([^)]*\)/g, " ").replace("___", a)); });
  else if (it.type === "transformation") (it.answers || []).forEach(function (a) { add([it.before, a, it.after].filter(Boolean).join(" ")); });
  else if (it.type === "gap-fill") {
    const gaps = it.gaps || [];
    let combos = [[]];
    gaps.forEach(function (g) {
      const next = [];
      combos.forEach(function (c) { (g.accepted || []).forEach(function (a) { if (next.length < 64) next.push(c.concat(a)); }); });
      combos = next;
    });
    combos.forEach(function (c) { add(str(it.text).replace(/\{\{(\d+)\}\}/g, function (m, n) { return c[Number(n) - 1] || ""; })); });
  } else if (it.type === "typed") (it.accepted || []).forEach(add);
  else if (it.type === "cloze") {
    const m = /\{\{([^}]+)\}\}/.exec(str(it.text));
    if (m) m[1].split("|").forEach(function (a) { add(str(it.text).replace(m[0], a)); });
  }
  return out;
}

/** English fields of an item (gender and region notes live there). */
function englishOf(it) { return [it.prompt, it.source, it.context, it.hint, it.front, it.explanation, it.note, it.en].map(str).join(" "); }

/** E11 rule 2: gender of the speaker / listener and "you (plural)". */
function genderAndYou(where, it) {
  const sentences = fullSentences(it);
  if (!sentences.length) return;
  const en = englishOf(it);
  if (!GENDER_NOTE.test(en)) {
    const seen = new Set();
    sentences.forEach(function (s) {
      const w = s.split(" ");
      for (let i = 0; i < w.length - 1; i++) {
        if (FACTS.genderLinks.indexOf(w[i]) === -1) continue;
        const twin = FACTS.genderTwin(w[i + 1]);
        if (!twin || seen.has(w[i + 1])) continue;
        const other = w.slice(0, i + 1).concat(twin, w.slice(i + 2)).join(" ");
        if (sentences.indexOf(other) === -1) {
          seen.add(w[i + 1]);
          warn(where, JSON.stringify(w[i] + " " + w[i + 1]) + ": the answer shows a gender, the other form (" + twin + ") is not accepted and the task has no gender note");
        }
      }
    });
  }
  if (YOU_PLURAL.test(en) && !REGION_NOTE.test(en)) {
    const kinds = new Set(sentences.map(FACTS.youPlural));
    if (kinds.size < 2) warn(where, "a \"you (plural)\" task without a region note accepts only " + FACTS.youPluralNames[kinds.has("informal") ? "informal" : "formal"] + " forms");
  }
}

/** Python check_mc + E11 rule 4. */
function checkMc(where, it, opts) {
  const o = Array.isArray(it.options) ? it.options : [];
  if (o.length < 2 || o.length > 5) err(where, "multiple-choice needs 2–5 options");
  const normed = o.map(function (x) { return LANG.normalizeAnswer(x); });
  if (new Set(normed).size !== o.length) err(where, "duplicate options (after normalisation)");
  const c = it.correct;
  if (!isInt(c) || c < 0 || c >= o.length) err(where, "correct must be an option index (exactly one correct option)");
  if (!it.explanation) err(where, "explanation missing");
  const notes = it.optionNotes;
  if (notes != null) {
    if (!Array.isArray(notes) || notes.length !== o.length) err(where, "optionNotes length differs from options");
    else if (isInt(c) && c >= 0 && c < notes.length && notes[c] !== null) err(where, "optionNotes for the correct option must be null");
    else if (notes.some(function (n, i) { return i !== c && n == null; })) warn(where, "a wrong option has no note");
  } else if (opts && opts.notesExpected) warn(where, "no optionNotes (one note per wrong option, spec 07 §4)");
  o.forEach(function (x) { charset(where, x); });
  if (it.prompt != null) charset(where, it.prompt);
}

function checkItem(where, it, level) {
  const t = it.type;
  if (TYPES.indexOf(t) === -1) { err(where, "unknown type " + JSON.stringify(t)); return; }
  if (t !== "dictation" && !it.explanation) err(where, "explanation missing");
  if (t === "multiple-choice") checkMc(where, it, { notesExpected: true });
  else if (t === "gap-fill") {
    const n = (str(it.text).match(/\{\{\d+\}\}/g) || []).length;
    if (n === 0 || n !== (it.gaps || []).length || n > 4) err(where, "gap-fill: 1–4 gaps {{n}} matching gaps[]");
    (it.gaps || []).forEach(function (g) {
      if (!(g.accepted || []).length) err(where, "gap without accepted answers");
      (g.accepted || []).forEach(function (a) { charset(where, a); });
      if (g.hint != null) charset(where, g.hint);
    });
    charset(where, it.text);
  } else if (t === "reorder") {
    const ans = it.answers || [];
    if (!ans.length || !it.context) err(where, "reorder needs context and answers");
    const bag = function (s) { return str(s).replace(PUNCT, "").toLowerCase().split(/\s+/).filter(Boolean).sort().join(" "); };
    if (ans.some(function (a) { return bag(a) !== bag(ans[0]); })) err(where, "reorder: every answer must use exactly the same words");
    ans.forEach(function (a) { charset(where, a); });
  } else if (t === "find-error") {
    const tok = it.tokens || [], r = it.errorRange || [];
    if (!it.noError && (r.length !== 2 || !(r[0] >= 0 && r[0] <= r[1] && r[1] < tok.length) || !(it.fixes || []).length)) err(where, "find-error: tokens, errorRange [from, to], fixes");
    tok.concat(it.fixes || []).forEach(function (a) { charset(where, a); });
  } else if (t === "short-answer") {
    (it.accepted || []).forEach(function (a) { charset(where, a); });
    pronounVariants(where, it.accepted || []);
  } else if (t === "translate") {
    const acc = it.accepted || [];
    if (!it.source || acc.length < 1 || acc.length > 8) err(where, "translate: source and 1–8 accepted");
    if (Array.from(str(it.source)).some(function (c) { return c.codePointAt(0) > 126 && TYPO.indexOf(c) === -1; })) warn(where, "translate source should be English");
    if (level && SOURCE_WORDS[level] && words(it.source).length > SOURCE_WORDS[level]) warn(where, "translate source has " + words(it.source).length + " words (at most " + SOURCE_WORDS[level] + " at " + level + ")");
    pronounVariants(where, acc);
    acc.forEach(function (a) { charset(where, a); });
  } else if (t === "match") {
    const pairs = it.pairs || [];
    if (["definition", "halves", "translation", "response"].indexOf(it.mode) === -1 || pairs.length < 3 || pairs.length > 6) err(where, "match: mode and 3–6 pairs");
    if (new Set(pairs.map(function (p) { return p[1]; })).size !== pairs.length || new Set(pairs.map(function (p) { return p[0]; })).size !== pairs.length) err(where, "match: duplicate side");
    pairs.forEach(function (p) { charset(where, p[0]); if (it.mode !== "translation" && it.mode !== "definition") charset(where, p[1]); });
  } else if (t === "paradigm") {
    const cells = it.cells || [];
    if (cells.length < 3 || cells.length > 8) err(where, "paradigm: 3–8 cells");
    if (new Set(cells.map(function (c) { return c.label; })).size !== cells.length) err(where, "paradigm: duplicate labels");
    if (cells.filter(function (c) { return !c.given; }).length < 2) err(where, "paradigm: at least 2 cells to fill");
    if (!it.lemma || !it.prompt) err(where, "paradigm: lemma and prompt");
    cells.forEach(function (c) {
      if (!(c.accepted || []).length) err(where, "paradigm: cell " + JSON.stringify(c.label) + " without accepted");
      (c.accepted || []).forEach(function (a) { charset(where, a); });
      charset(where, c.label);
    });
    charset(where, it.lemma);
  } else if (t === "dictation") {
    const n = words(it.text).length;
    if (n < 4 || n > 30) err(where, "dictation: 4–30 words");
    charset(where, it.text);
    (it.accepted || []).forEach(function (a) { charset(where, a); });
  } else if (t === "transformation") {
    ["source", "keyword", "answers"].forEach(function (k) { if (!it[k] || (Array.isArray(it[k]) && !it[k].length)) err(where, "transformation: " + k + " missing"); });
    [it.source, it.keyword, it.before, it.after].concat(it.answers || []).forEach(function (a) { charset(where, a); });
  }
  genderAndYou(where, it);
}

// ---------------------------------------------------------------- content types
function checkPage(p, topics) {
  const raw = fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const w = rel(p);
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!m) { err(w, "front matter missing"); return; }
  const fm = {};
  m[1].split("\n").forEach(function (line) {
    const i = line.indexOf(":");
    if (i !== -1) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });
  const body = m[2];
  const tid = fm.id || "";
  const T = topics[tid];
  if (!T) { err(w, "id " + JSON.stringify(tid) + " is not in the syllabus"); return; }
  if (fm.level !== T.level || fm.category !== T.category) err(w, "level/category differ from the syllabus");
  ["title", "summary"].forEach(function (k) { if (!fm[k]) err(w, "front matter: " + k + " missing"); });
  if (str(fm.summary).length > 140) err(w, "summary longer than 140 characters");
  const expect = T.category + "-" + tid.split("-").slice(2).join("-") + ".md";
  if (path.basename(p) !== expect || path.basename(path.dirname(p)) !== T.level.toLowerCase()) err(w, "file should be " + T.level.toLowerCase() + "/" + expect);
  if (!/^# \S/m.test(body)) err(w, "no # title");
  const heads = []; body.replace(/^## (.+?)\s*$/gm, function (x, h) { heads.push(h); return x; });
  const need = SECTIONS[T.category] || [];
  const seq = heads.filter(function (h) { return need.indexOf(h) !== -1; });
  if (seq.join("\u0000") !== need.join("\u0000")) err(w, "sections must be, in order: " + need.join(" · ") + " (found: " + heads.join(" · ") + ")");
  heads.forEach(function (h) { if (need.indexOf(h) === -1 && OPTIONAL.indexOf(h) === -1) err(w, "unknown section " + JSON.stringify(h)); });
  if (heads.length && heads[heads.length - 1] !== "Answers") err(w, "Answers must be the last section");
  const n = (body.replace(/[|*_#>\-]/g, " ").match(/\S+/g) || []).length;
  const lim = WORDS[T.level];
  if (n < lim[0] || n > lim[1]) warn(w, n + " words (expected " + lim[0] + "–" + lim[1] + ")");
  if (!new RegExp("^\\|\\s*" + APP.language + "\\s*\\|\\s*English\\s*\\|", "m").test(body)) err(w, "no table with header | " + APP.language + " | English |");
  const sec = /## Common mistakes\n([\s\S]*?)(?=\n## )/.exec(body);
  if (sec) {
    const lines = sec[1].split("\n").filter(function (l) { return l.indexOf("- ") === 0; });
    if (lines.length < 3 || lines.length > 5) err(w, "mistakes section: 3–5 lines (found " + lines.length + ")");
    lines.forEach(function (l) {
      if (l.indexOf("✗") === -1 || l.indexOf("✓") === -1 || l.indexOf("→") === -1) err(w, "mistake line must be '- ✗ *wrong* → ✓ *right* — why': " + JSON.stringify(l.slice(0, 50)));
    });
  }
  const prac = /## Practice\n([\s\S]*?)(?=\n## )/.exec(body);
  const ans = /## Answers\n([\s\S]*)/.exec(body);
  if (prac && ans) {
    const a = (prac[1].match(/^\d+\./gm) || []).length, b = (ans[1].match(/^\d+\./gm) || []).length;
    if (a < 6 || a > 8) err(w, "practice: 6–8 numbered items (found " + a + ")");
    if (a !== b) err(w, "practice has " + a + " items but answers has " + b);
  }
  body.replace(/\[\[([^\]]+)\]\]/g, function (x, link) { if (!topics[link]) err(w, "link [[" + link + "]] is not a topic id"); return x; });
  charset(w, body);
}

function checkQuiz(p, topics) {
  const d = load(p);
  if (!d) return;
  const w = rel(p);
  if (d.id !== d.topic || !topics[d.topic]) err(w, "quiz id must equal an existing topic id");
  if (path.basename(p) !== d.id + ".json") err(w, "file name must be <topic id>.json");
  if (d.passScore !== 3 || (d.items || []).length !== 4) err(w, "quiz: exactly 4 items, passScore 3");
  const ids = new Set();
  const level = topics[d.topic] ? topics[d.topic].level : null;
  (d.items || []).forEach(function (it, i) {
    const at = w + " #" + (i + 1);
    if (it.type !== "multiple-choice" && it.type !== "gap-fill") err(at, "quiz items are multiple-choice (one gap-fill allowed)");
    if (ids.has(it.id)) err(at, "duplicate id");
    ids.add(it.id);
    checkItem(at, it, level);
  });
  if ((d.items || []).filter(function (it) { return it.type === "gap-fill"; }).length > 1) err(w, "quiz: at most one gap-fill");
  const pos = (d.items || []).filter(function (it) { return it.type === "multiple-choice"; }).map(function (it) { return it.correct; });
  if (pos.length >= 3 && new Set(pos).size === 1) warn(w, "the correct option is always in the same position");
}

function checkSet(p, topics) {
  const d = load(p);
  if (!d) return;
  const w = rel(p);
  if (!topics[d.topic] && d.kind !== "level-test") err(w, "topic " + JSON.stringify(d.topic) + " not in syllabus");
  const level = d.level || (topics[d.topic] ? topics[d.topic].level : null);
  if (d.kind === "level-test") {
    if (d.passPercent !== 80) err(w, "final test: passPercent 80");
    // A TEMPORARY pool (stage 5 minimal pools, see tools/validate-exercises.js) may be smaller until stage X
    if ((d.items || []).length !== 30 || d.draw !== 20) (/^TEMPORARY\b/.test(str(d.note)) ? warn : err)(w, "final test: 30 items, draw 20" + (/^TEMPORARY\b/.test(str(d.note)) ? " (temporary pool)" : ""));
  } else {
    if (!new RegExp("^" + str(d.topic).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d+$").test(str(d.id))) err(w, "set id must be <topic id>-<n>");
    const n = (d.items || []).length;
    if (n < 8 || n > 12) err(w, "set: 8–12 items");
    const cat = topics[d.topic] ? topics[d.topic].category : null;
    if (new Set((d.items || []).map(function (it) { return it.type; })).size < 4 && ["verbs", "grammar", "cases"].indexOf(cat) !== -1) err(w, "set: at least four different item types");
  }
  const ids = new Set();
  (d.items || []).forEach(function (it, i) {
    const at = w + " #" + (i + 1);
    if (d.kind !== "level-test" && !new RegExp("^" + str(d.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d\\d$").test(str(it.id))) err(at, "item id must be <set id>-NN");
    if (ids.has(it.id)) err(at, "duplicate id");
    ids.add(it.id);
    if (!(it.tags || []).length) warn(at, "no tags");
    checkItem(at, it, level);
  });
}

function checkDeck(p) {
  const d = load(p);
  if (!d) return;
  const w = rel(p);
  const ids = new Set();
  (d.cards || []).forEach(function (c, i) {
    const at = w + " #" + (i + 1);
    if (!new RegExp("^" + str(d.id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d{3}$").test(str(c.id))) err(at, "card id must be <deck id>-NNN");
    if (ids.has(c.id)) err(at, "duplicate id");
    ids.add(c.id);
    if (LEVELS.indexOf(c.level) === -1) err(at, "level missing");
    if (c.type === "typed") {
      if (!c.front || !(c.accepted || []).length || !c.back) err(at, "typed: front, accepted, back");
      (c.accepted || []).forEach(function (a) { charset(at, a); });
      [c.back, c.example].forEach(function (a) { if (a != null) charset(at, a); });
      pronounVariants(at, c.accepted || []);
    } else if (c.type === "cloze") {
      if ((str(c.text).match(/\{\{[^}]+\}\}/g) || []).length !== 1) err(at, "cloze: exactly one {{gap}}");
      if (!c.hint) err(at, "cloze: hint (English) missing");
      if (!c.en) warn(at, "cloze: no English translation (en)");
      charset(at, c.text);
    } else {
      err(at, "unknown card type " + JSON.stringify(c.type));
      return;
    }
    genderAndYou(at, c);
  });
}

function checkPlacement(p, topics, full) {
  const d = load(p);
  if (!d) return;
  const w = rel(p);
  const ids = new Set(), count = {};
  (d.questions || []).forEach(function (q, i) {
    const at = w + " #" + (i + 1);
    if (ids.has(q.id)) err(at, "duplicate id");
    ids.add(q.id);
    if (LEVELS.indexOf(q.level) === -1 || ["grammar", "vocabulary", "reading"].indexOf(q.skill) === -1) err(at, "level / skill");
    if ((q.options || []).length !== 4) err(at, "4 options");
    checkMc(at, Object.assign({}, q, { prompt: q.question }));
    if (q.skill === "reading") {
      const n = words(q.passage).length;
      const lim = ["A1", "A2", "B1"].indexOf(q.level) !== -1 ? [30, 80] : [60, 130];
      if (n < lim[0] || n > lim[1]) err(at, "reading passage " + n + " words (expected " + lim[0] + "–" + lim[1] + ")");
      charset(at, q.passage);
    }
    if (q.topicId != null && !topics[q.topicId]) err(at, "topicId " + JSON.stringify(q.topicId) + " not in syllabus");
    if (q.topicId && topics[q.topicId] && topics[q.topicId].level !== q.level) warn(at, "topicId is from another level");
    // E10: the skill agrees with the topic's category (verbs and cases count as grammar)
    if (q.topicId && topics[q.topicId] && q.skill !== "reading") {
      const cat = topics[q.topicId].category;
      const skill = global.LM.learn.SKILL_OF[cat];
      if (skill && skill !== q.skill) warn(at, "skill " + q.skill + " but the topic is " + cat + " (counts as " + skill + ")");
    }
    const k = q.level + "/" + q.skill;
    count[k] = (count[k] || 0) + 1;
  });
  if (full) {
    LEVELS.forEach(function (lv) {
      const got = ["grammar", "vocabulary", "reading"].map(function (s) { return count[lv + "/" + s] || 0; });
      if (got.join() !== "5,3,2") (STRICT ? err : warn)(w, lv + ": (" + got.join(", ") + ") questions (grammar, vocabulary, reading), expected (5, 3, 2)" + (STRICT ? "" : " — an error from the first stage X"));
    });
  }
}

function checkLab(p, topics) {
  const d = load(p);
  if (!d) return;
  const w = rel(p);
  // case models (a lab of another language: spec 09); cards, contrasts and trees are checked by checkLabDir
  (d.models || []).forEach(function (m) {
    ["singular", "plural"].forEach(function (num) {
      if (Object.keys(m[num] || {}).sort().join() !== CASES.slice().sort().join()) err(w, "model " + m.id + ": " + num + " must have all 7 cases");
      Object.keys(m[num] || {}).forEach(function (k) { charset(w, m[num][k]); });
    });
  });
}

/**
 * The lab folder as one data set (spec 06 E7): LM.labLogic.validate (structure, ids, axes, scenes, contrast cards,
 * trees: links, reachability, cycles), the target-language charset, and every quiz item of a contrast card with the
 * item rules (E11 rule 4: one correct option, no duplicates, explanation, optionNotes).
 */
function checkLabDir(dir, topics) {
  const files = list(dir, /\.json$/);
  const pick = function (re) { return files.find(function (f) { return re.test(path.basename(f)); }); };
  const cardsFile = pick(/^cards/), ctrFile = pick(/^contrasts/), treesFile = pick(/^trees/);
  if (!cardsFile) return;
  const cards = load(cardsFile) || {};
  const ctr = ctrFile ? (load(ctrFile) || {}) : {};
  const trees = treesFile ? (load(treesFile) || {}) : {};
  const lab = { axes: cards.axes, cards: cards.cards || [], contrasts: ctr.contrasts || [], trees: trees.trees || [] };
  const res = LAB.validate(lab, topics);
  const where = rel(dir);
  res.errors.forEach(function (e) { err(where, e); });
  // a sample card may name a card that is not in the sample (docs/plan/examples)
  res.warnings.forEach(function (x) { if (!(EXAMPLES && /no such card yet/.test(x))) warn(where, x); });
  LAB.targetTexts(lab).forEach(function (t) { charset(where + " " + t.where, t.text); });
  lab.contrasts.forEach(function (k) {
    ((k.quiz && k.quiz.items) || []).forEach(function (it, i) {
      const at = rel(ctrFile) + " " + k.id + " quiz #" + (i + 1);
      checkItem(at, it, k.level);
    });
  });
}

function checkTree(root, topics, full) {
  subdirs(path.join(root, "pages")).forEach(function (lv) { list(path.join(root, "pages", lv), /\.md$/).forEach(function (p) { checkPage(p, topics); }); });
  subdirs(path.join(root, "quizzes")).forEach(function (lv) { list(path.join(root, "quizzes", lv), /\.json$/).forEach(function (p) { checkQuiz(p, topics); }); });
  list(path.join(root, "exercises"), /\.json$/).forEach(function (p) { if (["topics.json", "mixes.json"].indexOf(path.basename(p)) === -1) checkSet(p, topics); });
  list(path.join(root, "tests"), /^final-.*\.json$/).forEach(function (p) { checkSet(p, topics); });
  list(path.join(root, "decks"), /\.json$/).forEach(function (p) { if (path.basename(p) !== "index.json") checkDeck(p); });
  list(path.join(root, "tests"), /^placement.*\.json$/).forEach(function (p) { checkPlacement(p, topics, full && p.indexOf("sample") === -1); });
  list(path.join(root, "lab"), /\.json$/).forEach(function (p) { if (p.indexOf("trees") === -1) checkLab(p, topics); });
  checkLabDir(path.join(root, "lab"), topics);
}

const topics = checkSyllabus(path.join(ARG, "syllabus.json"));
checkTree(TREE, topics, FULL);
console.log("Content validation (" + rel(TREE) + "): " + Object.keys(topics).length + " topics");
warnings.forEach(function (w) { console.warn(w); });
errors.forEach(function (e) { console.error(e); });
console.log(errors.length + " error(s), " + warnings.length + " warning(s)");
if (errors.length) process.exit(1);
