/*
 * validate-exercises.js — validator of exercise sets, the topic → sets map, mixes and level final tests
 * (port of the reference tools/waliduj-cwiczenia.js, spec 03). Run by `npm run validate` and `npm run build`;
 * errors stop the build (exit code 1).
 *
 * Kept from the reference: every per-item rule (all item types, ids unique across the bank, explanation,
 * passage / script for reading / listening), set fields, the map, mixes, final-test pool rules.
 * Dropped: the old English Tense Lab files, the "Dobierz czas" tree, exam folders and the C1 format
 * (lab: stage 6; exams: stage E). Added: the item type `paradigm` (basic shape only; full rules in stage 4, spec 06 E6),
 * topics from content/syllabus.json, final tests required only for AVAILABLE levels (spec 06 E1).
 * Messages are still Polish; they are translated with the rest of the tools in stage 2.
 *
 * Usage: node tools/validate-exercises.js [root]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, "..");
const CONTENT = path.join(ROOT, "content");
const errors = [];
const warnings = [];
function err(msg) { errors.push(msg); }

function readJson(rel) {
  const file = path.join(CONTENT, rel);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")); } catch (e) { err(rel + ": niepoprawny JSON (" + e.message + ")"); return null; }
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
if (!topics.size) err("content/syllabus.json: brak tematów");

function words(sentence) {
  return String(sentence).trim().split(/\s+/).map(function (w) { return w.replace(/[.,!?;]+$/, "").replace(/’/g, "'").toLowerCase(); }).filter(Boolean);
}
function sameMultiset(a, b) { return a.slice().sort().join("\u0000") === b.slice().sort().join("\u0000"); }
function nonEmpty(s) { return typeof s === "string" && s.trim() !== ""; }

// ---------- Zestawy ----------
const itemIds = new Set();
const setsByTopic = {};
let itemCount = 0;
function checkItem(it, where, set) {
  const id = it && it.id;
  const at = where + " " + (id || "?");
  if (!nonEmpty(id)) err(where + ": zadanie bez id");
  else if (itemIds.has(id)) err(where + ": zdublowane id zadania " + id + " (id muszą być unikalne w całym banku)");
  else itemIds.add(id);
  itemCount++;
  if (TYPES.indexOf(it.type) === -1) { err(at + ": nieznany typ " + it.type); return; }
  if (!nonEmpty(it.explanation)) err(at + ": brak explanation");
  if (it.topic != null && !topics.has(it.topic)) err(at + ": topic " + it.topic + " nie istnieje w niezbednik/index.json");
  if (it.level != null && LEVELS.indexOf(it.level) === -1) err(at + ": nieznany poziom " + it.level);
  if (it.tags != null && !(Array.isArray(it.tags) && it.tags.every(nonEmpty))) err(at + ": tags musi być tablicą napisów");

  if (it.type === "multiple-choice") {
    const o = it.options;
    // Do ośmiu opcji tylko bez tasowania (fixedOrder, np. B2 Listening Part 3: A–H); tasowane — 2–4
    const maxOpts = it.fixedOrder ? 8 : 4;
    if (!Array.isArray(o) || o.length < 2 || o.length > maxOpts || !o.every(nonEmpty)) err(at + ": options — 2–" + maxOpts + " niepuste opcje");
    else if (new Set(o).size !== o.length) err(at + ": powtórzone opcje");
    if (!Number.isInteger(it.correct) || !Array.isArray(o) || it.correct < 0 || it.correct >= o.length) err(at + ": correct poza zakresem");
    if (it.optionNotes != null) {
      if (!Array.isArray(it.optionNotes) || !Array.isArray(o) || it.optionNotes.length !== o.length) err(at + ": optionNotes musi mieć tyle pozycji co options");
      else if (Number.isInteger(it.correct) && it.correct >= 0 && it.correct < o.length && it.optionNotes[it.correct] !== null) err(at + ": optionNotes dla poprawnej opcji musi być null");
    }
    if (it.kind != null && KINDS.indexOf(it.kind) === -1) err(at + ": nieznany kind " + it.kind);
    if ((it.kind == null || it.kind === "form") && String(it.prompt || "").indexOf("___") === -1) err(at + ": kind „form” wymaga luki ___ w prompt");
    if (it.kind === "reading" && !nonEmpty(set.passage)) err(at + ": kind „reading” bez passage w zestawie");
    if (it.kind === "listening" && !nonEmpty(it.script) && !nonEmpty(set && set.script)) err(at + ": kind „listening” bez script (w zadaniu ani w zestawie)");
  } else if (it.type === "reorder") {
    const a = it.answers;
    if (!Array.isArray(a) || !a.length || !a.every(nonEmpty)) { err(at + ": brak answers"); return; }
    const base = words(a[0]);
    if (base.length < 2) err(at + ": zdanie do ułożenia ma mniej niż 2 wyrazy");
    a.slice(1).forEach(function (x) { if (!sameMultiset(words(x), base)) err(at + ": answers mają różne zestawy wyrazów („" + x + "”)"); });
    const extra = it.extraTokens || [];
    if (!Array.isArray(extra) || extra.length > 2) err(at + ": extraTokens — najwyżej 2");
    else extra.forEach(function (e) { if (base.indexOf(String(e).toLowerCase()) !== -1) err(at + ": extraToken „" + e + "” występuje w odpowiedzi"); });
  } else if (it.type === "find-error") {
    if (!Array.isArray(it.tokens) || it.tokens.length < 2 || !it.tokens.every(nonEmpty)) err(at + ": tokens — co najmniej 2 wyrazy");
    if (!it.noError) {
      const r = it.errorRange;
      if (!(Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[0] <= r[1] && Array.isArray(it.tokens) && r[1] < it.tokens.length)) err(at + ": errorRange poza tokens");
      if (!Array.isArray(it.fixes) || !it.fixes.length || !it.fixes.every(function (f) { return typeof f === "string"; })) err(at + ": fixes — niepusta lista");
      else if (Array.isArray(r) && Array.isArray(it.tokens)) {
        const wrong = it.tokens.slice(r[0], r[1] + 1).join(" ").toLowerCase();
        it.fixes.forEach(function (f) { if (f.toLowerCase() === wrong) err(at + ": poprawka „" + f + "” jest taka sama jak błędny fragment"); });
      }
    }
  } else if (it.type === "short-answer") {
    if ((String(it.prompt || "").match(/___/g) || []).length !== 1) err(at + ": prompt musi mieć dokładnie jedną lukę ___");
    if (!Array.isArray(it.accepted) || !it.accepted.length || !it.accepted.every(nonEmpty)) err(at + ": accepted — niepusta lista");
  } else if (it.type === "paradigm") {
    checkParadigm(it, at);
  } else {
    checkV6Item(it, at);
  }
}

/** paradigm ("Fill the table", spec 06 E6): basic shape; stage 4 adds the full rules. */
function checkParadigm(it, at) {
  if (!nonEmpty(it.prompt)) err(at + ": paradigm bez prompt");
  if (!nonEmpty(it.lemma)) err(at + ": paradigm bez lemma");
  const cells = it.cells;
  if (!Array.isArray(cells) || cells.length < 3 || cells.length > 8) { err(at + ": cells — 3–8 komórek"); return; }
  cells.forEach(function (c, i) {
    if (!c || !nonEmpty(c.label)) err(at + ": komórka " + (i + 1) + " bez label");
    if (!c || !Array.isArray(c.accepted) || !c.accepted.length || !c.accepted.every(nonEmpty)) err(at + ": komórka " + (i + 1) + " — accepted musi być niepustą listą");
  });
  if (cells.every(function (c) { return c && c.given; })) err(at + ": wszystkie komórki są given");
}

// ---------- Nowe typy zadań (paczka v6, spec 12, sekcja 4; wzór reguł: docs/rozbudowa-v6/scripts/validate_v6.py) ----------
const MATCH_MODES = ["definition", "halves", "translation", "response"];
/** Liczba słów jak w Cambridge: skrót (n't, 's, 're, 've, 'd, 'll, 'm) = dwa słowa, poza let's. */
function cambridgeWords(s) {
  return String(s).replace(/’/g, "'").trim().split(/\s+/).filter(Boolean).reduce(function (n, w) {
    return n + (/(n't|'s|'re|'ve|'d|'ll|'m)$/i.test(w) && w.toLowerCase() !== "let's" ? 2 : 1);
  }, 0);
}
function norm6(s) { return String(s).trim().replace(/\s+/g, " ").replace(/’/g, "'").replace(/[.,!?;]+$/, "").toLowerCase(); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function checkV6Item(it, at) {
  if (it.type === "gap-fill") {
    const nums = (String(it.text || "").match(/\{\{(\d+)\}\}/g) || []).map(function (m) { return Number(m.slice(2, -2)); });
    const gaps = Array.isArray(it.gaps) ? it.gaps : [];
    if (nums.length < 1 || nums.length > 4) err(at + ": gap-fill musi mieć 1–4 luki, ma " + nums.length);
    if (nums.join(",") !== nums.map(function (_, i) { return i + 1; }).join(",")) err(at + ": luki muszą być numerowane {{1}}…{{n}} po kolei");
    if (gaps.length !== nums.length) err(at + ": gaps ma " + gaps.length + " elementów, a luk jest " + nums.length);
    gaps.forEach(function (g, i) {
      if (!g || !Array.isArray(g.accepted) || !g.accepted.length || !g.accepted.every(nonEmpty)) err(at + ": luka " + (i + 1) + " bez accepted");
      if (g && g.hint != null && !nonEmpty(g.hint)) err(at + ": luka " + (i + 1) + " — hint musi być niepustym tekstem");
    });
  } else if (it.type === "match") {
    const pairs = Array.isArray(it.pairs) ? it.pairs : [];
    if (pairs.length < 3 || pairs.length > 6) err(at + ": match musi mieć 3–6 par, ma " + pairs.length);
    if (!pairs.every(function (x) { return Array.isArray(x) && x.length === 2 && nonEmpty(x[0]) && nonEmpty(x[1]); })) { err(at + ": każda para to [lewa, prawa] (niepuste teksty)"); return; }
    const left = pairs.map(function (x) { return norm6(x[0]); }), right = pairs.map(function (x) { return norm6(x[1]); });
    if (new Set(left).size !== left.length || new Set(right).size !== right.length) err(at + ": teksty par muszą być unikalne");
    const extra = it.extraRight == null ? [] : it.extraRight;
    if (!Array.isArray(extra) || extra.length > 2 || !extra.every(nonEmpty)) err(at + ": extraRight — najwyżej 2 niepuste teksty");
    else if (extra.some(function (e) { return right.indexOf(norm6(e)) !== -1; })) err(at + ": extraRight powtarza prawą stronę pary");
    if (MATCH_MODES.indexOf(it.mode) === -1) err(at + ": mode musi być jednym z: " + MATCH_MODES.join(", "));
  } else if (it.type === "transformation") {
    const kw = String(it.keyword || "").trim();
    const answers = Array.isArray(it.answers) ? it.answers : [];
    const lim = it.wordLimit == null ? [2, 5] : it.wordLimit;
    if (!(Array.isArray(lim) && lim.length === 2 && lim[0] >= 1 && lim[0] <= lim[1])) { err(at + ": wordLimit musi być [min, max]"); return; }
    if (!kw || !answers.length || !answers.every(nonEmpty)) err(at + ": transformation wymaga keyword i answers");
    answers.forEach(function (a) {
      if (kw && !new RegExp("(^|[^\\w'])" + escapeRe(kw.toLowerCase()) + "(?!\\w)").test(String(a).toLowerCase())) err(at + ": odpowiedź „" + a + "” nie zawiera słowa kluczowego " + kw);
      const n = cambridgeWords(a);
      if (n < lim[0] || n > lim[1]) err(at + ": odpowiedź „" + a + "” ma " + n + " słów, limit " + lim[0] + "–" + lim[1]);
    });
    if (it.parts != null && (!Array.isArray(it.parts) || it.parts.length !== 2 || !it.parts.every(function (p) { return Array.isArray(p) && p.length && p.every(nonEmpty); }))) err(at + ": parts musi mieć dokładnie 2 elementy (listy wariantów)");
    ["source", "before", "after"].forEach(function (k) { if (typeof it[k] !== "string") err(at + ": brak pola " + k); });
    if (!nonEmpty(it.source)) err(at + ": source nie może być puste");
  } else if (it.type === "translate") {
    if (!Array.isArray(it.accepted) || it.accepted.length < 1 || it.accepted.length > 8 || !it.accepted.every(nonEmpty)) err(at + ": translate wymaga 1–8 accepted");
    if (!nonEmpty(it.source)) err(at + ": brak source");
    if (it.hint != null && !nonEmpty(it.hint)) err(at + ": hint musi być niepustym tekstem");
  } else if (it.type === "dictation") {
    const n = String(it.text || "").trim().split(/\s+/).filter(Boolean).length;
    if (n < 4 || n > 30) err(at + ": dyktando ma " + n + " słów (4–30)");
    const mp = it.maxPlays == null ? 3 : it.maxPlays;
    if (!Number.isInteger(mp) || mp < 1 || mp > 5) err(at + ": maxPlays 1–5");
    if (it.accepted != null && (!Array.isArray(it.accepted) || !it.accepted.every(nonEmpty))) err(at + ": accepted — lista niepustych wariantów");
  }
}


// ---------- Zestawy (content/exercises/<id>.json) ----------
const SETS_DIR = path.join(CONTENT, "exercises");
const setFiles = fs.existsSync(SETS_DIR) ? fs.readdirSync(SETS_DIR).filter(function (f) { return /.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).sort() : [];
const setIds = new Set();
setFiles.forEach(function (f) {
  const rel = "exercises/" + f;
  const set = readJson(rel);
  if (!set) return;
  const id = f.replace(/.json$/, "");
  setIds.add(id);
  if (set.id !== id) err(rel + ": id zestawu (" + set.id + ") ≠ nazwa pliku");
  if (set.version !== 1) err(rel + ": version musi być 1");
  if (set.topic != null && !topics.has(set.topic)) err(rel + ": topic " + set.topic + " nie istnieje w sylabusie");
  if (set.level != null && LEVELS.indexOf(set.level) === -1) err(rel + ": nieznany poziom " + set.level);
  if (!nonEmpty(set.title)) err(rel + ": brak title");
  if (!Array.isArray(set.items) || !set.items.length) { err(rel + ": brak items"); return; }
  set.items.forEach(function (it) { checkItem(Object.assign({ topic: set.topic, level: set.level }, it), f, set); });
});

// ---------- Testy końcowe poziomów (content/tests/final-<level>.json) ----------
let finalPools = 0, finalItems = 0;
const FINAL_TYPES = ["multiple-choice", "gap-fill", "short-answer", "match", "transformation", "translate", "reorder", "find-error", "paradigm"];
LEVELS.forEach(function (lvl) {
  const f = "final-" + lvl.toLowerCase() + ".json";
  const rel = "tests/" + f;
  if (!fs.existsSync(path.join(CONTENT, rel))) {
    if (status[lvl] === "available") warnings.push(rel + ": brak puli testu końcowego, a poziom " + lvl + " jest dostępny (błąd od pierwszego etapu treści)");
    return;
  }
  const set = readJson(rel);
  if (!set) return;
  finalPools++;
  const at = rel;
    if (set.version !== 1) err(at + ": version musi być 1");
    if (set.kind !== "level-test") err(at + ": kind musi być „level-test”");
    if (set.id !== "final-" + lvl.toLowerCase()) err(at + ": id musi być „final-" + lvl.toLowerCase() + "”");
    if (set.level !== lvl) err(at + ": level musi być " + lvl);
    if (set.draw !== 20) err(at + ": draw musi być 20");
    if (set.passPercent !== 80) err(at + ": passPercent musi być 80");
    if (set.defaultMode !== "exam") err(at + ": defaultMode musi być „exam”");
    if (!nonEmpty(set.title)) err(at + ": brak title");
    if (!Array.isArray(set.items) || set.items.length !== 30) { err(at + ": pula musi mieć 30 zadań, ma " + (Array.isArray(set.items) ? set.items.length : 0)); if (!Array.isArray(set.items)) return; }
    finalItems += set.items.length;
    let mc = 0, paradigms = 0;
    const covered = new Set();
    const perCat = {};
    set.items.forEach(function (it) {
      checkItem(Object.assign({ level: set.level }, it), f, set); // pola wg typu (spec 01 i 12), unikalne id w całym banku
      const q = at + " " + (it.id || "?");
      if (!nonEmpty(it.topic)) err(q + ": brak wymaganego topic");
      else if (topicLevel[it.topic] !== lvl) err(q + ": topic „" + it.topic + "” nie należy do poziomu " + lvl);
      else { covered.add(it.topic); perCat[topicCategory[it.topic]] = (perCat[topicCategory[it.topic]] || 0) + 1; }
      if (it.type === "dictation") err(q + ": dyktando niedozwolone w teście końcowym (test nie może zależeć od głosu)");
      else if (FINAL_TYPES.indexOf(it.type) === -1) err(q + ": typ „" + it.type + "” niedozwolony w teście końcowym");
      if (it.type === "transformation" && LEVELS.indexOf(lvl) < 2) err(q + ": transformation dopiero od B1");
      if (it.type === "translate" && LEVELS.indexOf(lvl) < 1) err(q + ": translate dopiero od A2");
      if (it.type === "multiple-choice") mc++;
      if (it.type === "paradigm") paradigms++;
    });
    if (paradigms > 2) err(at + ": najwyżej dwa zadania paradigm (jest " + paradigms + ")");
    if (mc * 2 < set.items.length) err(at + ": zadań wyboru jest " + mc + " z " + set.items.length + " (wymagana co najmniej połowa)");
    const levelTopics = Object.keys(topicLevel).filter(function (t) { return topicLevel[t] === lvl; });
    if (covered.size < 0.7 * levelTopics.length) err(at + ": pula pokrywa " + covered.size + " z " + levelTopics.length + " podstron (wymagane co najmniej 70%)");
    // Proporcje kategorii jak na liście poziomu (ostrzeżenie, gdy odchylenie > 2 zadania od udziału proporcjonalnego)
    const catCount = {};
    levelTopics.forEach(function (t) { catCount[topicCategory[t]] = (catCount[topicCategory[t]] || 0) + 1; });
    Object.keys(catCount).forEach(function (c) {
      const want = 30 * catCount[c] / levelTopics.length;
      const got = perCat[c] || 0;
      if (!got) err(at + ": brak zadań z kategorii „" + c + "”");
      else if (Math.abs(got - want) > 2) warnings.push(at + ": kategoria „" + c + "” ma " + got + " zadań, a proporcjonalnie ok. " + want.toFixed(1));
    });
});

// ---------- Mapa temat → zestawy (content/exercises/topics.json) ----------
const map = readJson("exercises/topics.json");
if (map) {
  Object.keys(map.topics || {}).forEach(function (t) {
    if (!topics.has(t)) err("exercises/topics.json: nieznany temat " + t);
    (map.topics[t] || []).forEach(function (s) {
      if (!setIds.has(s)) err("exercises/topics.json: brak pliku exercises/" + s + ".json");
      else (setsByTopic[t] = setsByTopic[t] || []).push(s);
    });
  });
  setIds.forEach(function (s) {
    const inMap = Object.keys(map.topics || {}).some(function (t) { return map.topics[t].indexOf(s) !== -1; });
    if (!inMap) warnings.push("zestaw " + s + " nie jest wpisany w exercises/topics.json (nie pojawi się w aplikacji)");
  });
}

// ---------- Zestawy mieszane (content/exercises/mixes.json) ----------
const mixes = readJson("exercises/mixes.json");
if (mixes) {
  const seen = new Set();
  (mixes.mixes || []).forEach(function (m) {
    const at = "mixes.json " + (m.id || "?");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(m.id || "")) err(at + ": id tylko małe litery, cyfry i myślniki");
    if (seen.has(m.id)) err(at + ": zdublowane id");
    seen.add(m.id);
    if (!nonEmpty(m.title)) err(at + ": brak title");
    if (!Array.isArray(m.topics) || !m.topics.length) err(at + ": brak topics");
    (m.topics || []).forEach(function (t) {
      if (!topics.has(t)) err(at + ": nieznany temat " + t);
      else if (!setsByTopic[t]) warnings.push(at + ": temat " + t + " nie ma jeszcze zestawów");
    });
    (m.types || []).forEach(function (t) { if (TYPES.indexOf(t) === -1) err(at + ": nieznany typ " + t); });
    if (m.count != null && !(Number.isInteger(m.count) && m.count > 0)) err(at + ": count musi być liczbą dodatnią");
  });
}


console.log("Walidacja ćwiczeń: zestawy " + setIds.size + ", zadania " + itemCount + ", mixy " + (mixes ? (mixes.mixes || []).length : 0) + ", testy końcowe " + finalPools + " (zadania " + finalItems + ")");
warnings.forEach(function (w) { console.warn("UWAGA: " + w); });
if (errors.length) {
  console.error("BŁĘDY (" + errors.length + "):");
  errors.forEach(function (e) { console.error("  - " + e); });
  process.exit(1);
}
console.log("OK");
