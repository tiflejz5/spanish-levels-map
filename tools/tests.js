/*
 * tests.js — unit tests of the pure logic (no DOM): learning (js/learning.js) —
 * review schedule, study streak and the placement test algorithm —
 * the exercise engine (js/exercise-logic.js), flashcards, the trail, exams, search,
 * and the attempts log / stats / automatic reviews (js/learning-stats.js).
 * No dependencies: built-in Node modules (assert).
 *
 * Usage (from the project folder):
 *   node tools/tests.js
 */
"use strict";

const assert = require("assert");
const path = require("path");

global.window = global;
require(path.join(__dirname, "..", "js", "lang.js"));
require(path.join(__dirname, "..", "js", "learning.js"));
require(path.join(__dirname, "..", "js", "exercise-logic.js"));
require(path.join(__dirname, "..", "js", "learning-stats.js"));
require(path.join(__dirname, "..", "js", "search-logic.js"));
require(path.join(__dirname, "..", "js", "exam-logic.js"));
require(path.join(__dirname, "..", "js", "final-logic.js"));
require(path.join(__dirname, "..", "js", "cards-logic.js"));
require(path.join(__dirname, "..", "js", "cards-schedule.js"));
require(path.join(__dirname, "..", "js", "trail-logic.js"));
const L = global.LM.learn;
const X = global.LM.exLogic;

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  " + name); } catch (e) { failures.push(name); console.log("  FAIL " + name + "\n       " + e.message); }
}

// Replacing "today" (one function, today())
function withToday(day, fn) {
  const original = L.today;
  L.today = function () { return day; };
  try { fn(); } finally { L.today = original; }
}

console.log("Dates");
test("today() returns the local day YYYY-MM-DD", function () {
  assert.match(L.today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(L.isDay(L.today()));
});
test("today() can be replaced", function () {
  withToday("2030-01-02", function () { assert.strictEqual(L.today(), "2030-01-02"); });
});
test("addDays across the end of a month, a year and a leap day", function () {
  assert.strictEqual(L.addDays("2026-01-31", 1), "2026-02-01");
  assert.strictEqual(L.addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(L.addDays("2028-02-28", 1), "2028-02-29");
  assert.strictEqual(L.addDays("2026-03-01", -1), "2026-02-28");
});
test("addDays across a DST change (end of March and October)", function () {
  assert.strictEqual(L.addDays("2026-03-28", 1), "2026-03-29");
  assert.strictEqual(L.addDays("2026-03-29", 1), "2026-03-30");
  assert.strictEqual(L.addDays("2026-10-24", 1), "2026-10-25");
  assert.strictEqual(L.addDays("2026-10-25", 1), "2026-10-26");
  assert.strictEqual(L.diffDays("2026-10-24", "2026-10-26"), 2);
});
test("isDay rejects bad dates", function () {
  ["2026-02-30", "2026-13-01", "tomorrow", "", null, "2026-1-1"].forEach(function (d) { assert.strictEqual(L.isDay(d), false, String(d)); });
});

console.log("Review schedule");
test("REVIEW_STEPS = [1, 3, 7]", function () {
  assert.deepStrictEqual(L.REVIEW_STEPS, [1, 3, 7]);
});
test("new entry: first review tomorrow", function () {
  assert.deepStrictEqual(L.newReview("2026-10-19"), { stage: 0, due: "2026-10-20", mastered: false });
});
test("not due on the day it is added, due the next day", function () {
  const r = L.newReview("2026-10-19");
  assert.strictEqual(L.isDue(r, "2026-10-19"), false);
  assert.strictEqual(L.isDue(r, "2026-10-20"), true);
});
test("an overdue review = due today (no penalty)", function () {
  const r = L.newReview("2026-10-01");
  assert.strictEqual(L.isDue(r, "2026-10-19"), true);
  // "Good" after a delay: the next stage counts from today, not from the due date
  assert.deepStrictEqual(L.reviewKnown(r, "2026-10-19"), { stage: 1, due: "2026-10-22", mastered: false });
});
test("the full path 1 → 3 → 7 → mastered", function () {
  let r = L.newReview("2026-10-19");                 // due 20
  r = L.reviewKnown(r, "2026-10-20");                // +3 → 23
  assert.deepStrictEqual(r, { stage: 1, due: "2026-10-23", mastered: false });
  r = L.reviewKnown(r, "2026-10-23");                // +7 → 30
  assert.deepStrictEqual(r, { stage: 2, due: "2026-10-30", mastered: false });
  r = L.reviewKnown(r, "2026-10-30");                // after the last stage
  assert.strictEqual(r.mastered, true);
  assert.strictEqual(L.isDue(r, "2027-01-01"), false);
});
test("\"Again\" goes back to stage 1 (tomorrow)", function () {
  const r = { stage: 2, due: "2026-10-30", mastered: false };
  assert.deepStrictEqual(L.reviewAgain(r, "2026-10-30"), { stage: 0, due: "2026-10-31", mastered: false });
});
test("changing the step array changes the schedule", function () {
  const saved = L.REVIEW_STEPS.slice();
  L.REVIEW_STEPS.splice(0, L.REVIEW_STEPS.length, 2, 5);
  try {
    let r = L.newReview("2026-10-19");
    assert.strictEqual(r.due, "2026-10-21");
    r = L.reviewKnown(r, "2026-10-21");
    assert.strictEqual(r.due, "2026-10-26");
    assert.strictEqual(L.reviewKnown(r, "2026-10-26").mastered, true);
  } finally {
    L.REVIEW_STEPS.splice(0, L.REVIEW_STEPS.length, ...saved);
  }
});

console.log("Study streak");
test("no activity → 0 / 0", function () {
  assert.deepStrictEqual(L.streak([], "2026-10-19"), { current: 0, longest: 0, activeToday: false });
});
test("activity today → streak 1", function () {
  assert.deepStrictEqual(L.streak(["2026-10-19"], "2026-10-19"), { current: 1, longest: 1, activeToday: true });
});
test("activity yesterday, none today yet → the streak is still alive", function () {
  const s = L.streak(["2026-10-16", "2026-10-17", "2026-10-18"], "2026-10-19");
  assert.strictEqual(s.current, 3);
  assert.strictEqual(s.activeToday, false);
});
test("a gap longer than a day → streak 0, the longest stays", function () {
  const s = L.streak(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-17"], "2026-10-19");
  assert.strictEqual(s.current, 0);
  assert.strictEqual(s.longest, 3);
});
test("duplicates, order and bad entries do not break the count", function () {
  const s = L.streak(["2026-10-19", "bad", "2026-10-18", "2026-10-19", "2026-10-17", "2026-02-30"], "2026-10-19");
  assert.deepStrictEqual(s, { current: 3, longest: 3, activeToday: true });
});
test("a streak across the end of a month", function () {
  const s = L.streak(["2026-09-29", "2026-09-30", "2026-10-01"], "2026-10-01");
  assert.strictEqual(s.current, 3);
});
test("days in the future are skipped", function () {
  assert.strictEqual(L.streak(["2026-10-25"], "2026-10-19").longest, 0);
});
test("the last 7 days: from the oldest to today", function () {
  const w = L.lastDays(["2026-10-13", "2026-10-19", "2026-10-01"], "2026-10-19", 7);
  assert.strictEqual(w.length, 7);
  assert.deepStrictEqual(w[0], { day: "2026-10-13", active: true });
  assert.deepStrictEqual(w[6], { day: "2026-10-19", active: true });
  assert.strictEqual(w.filter(function (d) { return d.active; }).length, 2);
});

console.log("Placement test");
function bank(perLevel) {
  const out = [];
  L.LEVELS.forEach(function (lvl) {
    for (let i = 0; i < perLevel; i++) out.push({ id: lvl + "-" + i, level: lvl });
  });
  return out;
}
test("start A2, right → up, wrong → down, limits A1/C2", function () {
  assert.strictEqual(L.LEVELS[L.nextLevelIndex(L.LEVELS.indexOf("A2"), true)], "B1");
  assert.strictEqual(L.LEVELS[L.nextLevelIndex(L.LEVELS.indexOf("A2"), false)], "A1");
  assert.strictEqual(L.nextLevelIndex(0, false), 0);
  assert.strictEqual(L.nextLevelIndex(5, true), 5);
  assert.strictEqual(L.START_LEVEL, "A2");
  assert.strictEqual(L.TEST_LENGTH, 12);
});
test("drawing without repeats from the level pool", function () {
  const q = bank(3);
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const p = L.pickQuestion(q, 2, used, Math.random);
    assert.strictEqual(p.level, "B1");
    assert.ok(!used.has(p.id));
    used.add(p.id);
  }
});
test("an exhausted pool → the neighboring level (direction of movement on a tie)", function () {
  const q = bank(1);
  const used = new Set(["B1-0"]);
  assert.strictEqual(L.pickQuestion(q, 2, used, function () { return 0; }, true).level, "B2");
  assert.strictEqual(L.pickQuestion(q, 2, used, function () { return 0; }, false).level, "A2");
  used.add("B2-0"); used.add("A2-0");
  assert.ok(["A1", "C1"].indexOf(L.pickQuestion(q, 2, used, function () { return 0; }, true).level) !== -1);
});
test("no questions → null", function () {
  const q = bank(1);
  assert.strictEqual(L.pickQuestion(q, 0, new Set(q.map(function (x) { return x.id; }))), null);
});
/** A pool with skills: per level 5 grammar, 3 vocabulary, 2 reading (id: <level>-<skill>-<n>). */
function skillBank() {
  const out = [];
  L.LEVELS.forEach(function (lvl) {
    [["grammar", 5], ["vocabulary", 3], ["reading", 2]].forEach(function (s) {
      for (let i = 0; i < s[1]; i++) out.push({ id: lvl + "-" + s[0] + "-" + i, level: lvl, skill: s[0] });
    });
  });
  return out;
}
test("pickQuestion without opts works as before (the same results for the same draw)", function () {
  const q = skillBank();
  for (let s = 1; s < 20; s++) {
    const a = L.pickQuestion(q, 2, new Set(), seeded(s), true);
    const b = L.pickQuestion(q, 2, new Set(), seeded(s), true, undefined);
    assert.strictEqual(a.id, b.id);
  }
});
test("pickQuestion: avoids questions from the previous attempt when the pool allows it", function () {
  const q = skillBank();
  const b1 = q.filter(function (x) { return x.level === "B1"; }).map(function (x) { return x.id; });
  const avoid = b1.slice(0, 8);
  for (let s = 1; s < 50; s++) {
    const p = L.pickQuestion(q, 2, new Set(), seeded(s), false, { avoidIds: avoid });
    assert.ok(avoid.indexOf(p.id) === -1, p.id);
  }
  // all of the level were in the previous attempt → takes from the level anyway (does not move to another)
  const p = L.pickQuestion(q, 2, new Set(), seeded(3), false, { avoidIds: b1 });
  assert.strictEqual(p.level, "B1");
});
test("pickQuestion: balances skills — the rarest in the attempt, a tie at random", function () {
  const q = skillBank();
  for (let s = 1; s < 50; s++) {
    assert.strictEqual(L.pickQuestion(q, 1, new Set(), seeded(s), false, { skillCounts: { grammar: 2, vocabulary: 1, reading: 0 } }).skill, "reading");
    assert.notStrictEqual(L.pickQuestion(q, 1, new Set(), seeded(s), false, { skillCounts: { grammar: 1, vocabulary: 1, reading: 1 } }).skill, undefined);
  }
  const seen = new Set();
  for (let s = 1; s < 60; s++) seen.add(L.pickQuestion(q, 1, new Set(), seeded(s * 104729), false, { skillCounts: { grammar: 1, vocabulary: 0, reading: 0 } }).skill);
  assert.deepStrictEqual(Array.from(seen).sort(), ["reading", "vocabulary"]);
  // a skill missing from the level pool (reading used up) → the rarest of the available ones
  const used = new Set(["A2-reading-0", "A2-reading-1"]);
  assert.strictEqual(L.pickQuestion(q, 1, used, seeded(2), false, { skillCounts: { grammar: 3, vocabulary: 1, reading: 0 } }).skill, "vocabulary");
  // a question without skill = grammar
  assert.strictEqual(L.pickQuestion([{ id: "x", level: "A1" }], 0, new Set(), seeded(1), false, { skillCounts: { grammar: 5 } }).id, "x");
});
test("a 12-question simulation with opts: every skill appears, the next attempt has other questions", function () {
  const q = skillBank();
  function run(avoid, seed) {
    const rnd = seeded(seed);
    const used = new Set(); const counts = {}; const ids = [];
    let idx = 1;
    for (let i = 0; i < L.TEST_LENGTH; i++) {
      const p = L.pickQuestion(q, idx, used, rnd, i % 2 === 0, { avoidIds: avoid, skillCounts: counts });
      used.add(p.id); ids.push(p.id); counts[L.skillOf(p)] = (counts[L.skillOf(p)] || 0) + 1;
      idx = L.nextLevelIndex(idx, i % 2 === 0);
    }
    return { ids: ids, counts: counts };
  }
  const first = run([], 11);
  assert.ok(first.counts.grammar >= 1 && first.counts.vocabulary >= 1 && first.counts.reading >= 1, JSON.stringify(first.counts));
  assert.ok(Math.max(first.counts.grammar, first.counts.vocabulary, first.counts.reading) - Math.min(first.counts.grammar, first.counts.vocabulary, first.counts.reading) <= 1);
  // The second attempt repeats a question only when a level ran out of new ones (10 questions per level)
  const second = run(first.ids, 12);
  L.LEVELS.forEach(function (lvl) {
    const at = function (ids) { return ids.filter(function (id) { return id.indexOf(lvl + "-") === 0; }); };
    const fresh = 10 - at(first.ids).length;
    const repeated = at(second.ids).filter(function (id) { return first.ids.indexOf(id) !== -1; }).length;
    assert.strictEqual(repeated, Math.max(0, at(second.ids).length - fresh), lvl);
  });
});
test("result = the average of the last 6 levels, rounded down", function () {
  // A2 B1 B2 C1 B2 B1 | B2 C1 B2 C1 C2 C1 → ostatnie 6: 3,4,3,4,5,4 = 23/6 = 3,83 → B2
  const asked = [1, 2, 3, 4, 3, 2, 3, 4, 3, 4, 5, 4];
  assert.strictEqual(L.LEVELS[L.resultLevelIndex(asked)], "B2");
  assert.strictEqual(L.resultLevelIndex([0, 0, 0, 0, 0, 1]), 0);
  assert.strictEqual(L.resultLevelIndex([5, 5, 5, 5, 5, 5]), 5);
  assert.strictEqual(L.resultLevelIndex([1, 2]), 1); // fewer than 6 questions: the average of those there are
});
function simulate(answerCorrect, perLevel) {
    const q = bank(perLevel);
    const used = new Set();
    let idx = L.LEVELS.indexOf(L.START_LEVEL);
    const asked = [];
    let prevCorrect = null;
    for (let i = 0; i < L.TEST_LENGTH; i++) {
      const p = L.pickQuestion(q, idx, used, Math.random, !!prevCorrect);
      used.add(p.id);
      // As in js/placement.js: the target level counts (idx), not the level
      // of the drawn question (different only when the level pool is empty)
      asked.push(idx);
      prevCorrect = answerCorrect;
      idx = L.nextLevelIndex(idx, answerCorrect);
    }
    return L.LEVELS[L.resultLevelIndex(asked)];
}
test("simulation (big pool): all right → C2, all wrong → A1", function () {
  assert.strictEqual(simulate(true, 12), "C2");
  assert.strictEqual(simulate(false, 12), "A1");
});
test("simulation (small pool, 2 questions per level): the result does not \"drift\"", function () {
  // 12 questions in the pool = exactly as many as the test takes. When a level pool
  // runs out, questions come from the neighboring levels, but the target level
  // (and the result) stays — the test always reaches the end.
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(simulate(true, 2), "C2");
    assert.strictEqual(simulate(false, 2), "A1");
  }
});

console.log("\nExercise engine (bank: tools/fixtures/lang/exercises.json)");
const fs = require("fs");
const FX_DIR = path.join(__dirname, "fixtures", "lang");
const FX = JSON.parse(fs.readFileSync(path.join(FX_DIR, "lang.json"), "utf8"));
const BANK = JSON.parse(fs.readFileSync(path.join(FX_DIR, "exercises.json"), "utf8"));
const allItems = [].concat.apply([], BANK.sets.map(function (s) { return s.items.map(function (it) { return Object.assign({ topic: s.topic }, it); }); }));
function bankItem(id) { const it = allItems.find(function (x) { return x.id === id; }); assert.ok(it, "no fixture item " + id); return it; }
function seeded(seed) { let x = seed; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }
/** The model answer of an item (every type) in the evaluate format. */
function modelAnswerOf(it) {
  if (it.type === "multiple-choice") return { chosen: it.correct };
  if (it.type === "reorder") return { words: X.answerTokens(it.answers[0]) };
  if (it.type === "find-error") return it.noError ? { noError: true } : { range: it.errorRange.slice(), fix: it.fixes[0] };
  if (it.type === "gap-fill") return { texts: it.gaps.map(function (g) { return g.accepted[0]; }) };
  if (it.type === "match") { const p = {}; it.pairs.forEach(function (x, i) { p[i] = x[1]; }); return { pairs: p }; }
  if (it.type === "transformation") return { text: it.answers[0] };
  if (it.type === "dictation") return { text: it.text };
  if (it.type === "paradigm") return { texts: it.cells.map(function (c) { return c.given ? "" : c.accepted[0]; }) };
  return { text: it.accepted[0] };
}

test("normalize = LM.lang.normalizeAnswer: spaces, apostrophes, final full stop, case; diacritics kept", function () {
  FX.normalizeAnswer.forEach(function (c) { assert.strictEqual(X.normalize(c[0]), c[1], c[0]); });
});
test("prepareChoice: the right answer and the notes follow their option after shuffling", function () {
  const item = allItems.find(function (it) { return it.type === "multiple-choice" && it.optionNotes; });
  for (let s = 1; s < 30; s++) {
    const p = X.prepareChoice(item, seeded(s));
    assert.strictEqual(p.options[p.correct].original, item.correct);
    assert.strictEqual(p.options[p.correct].note, null);
    p.options.forEach(function (o) { assert.strictEqual(o.text, item.options[o.original]); });
  }
  const fixed = X.prepareChoice(Object.assign({}, item, { fixedOrder: true }), seeded(3));
  assert.deepStrictEqual(fixed.options.map(function (o) { return o.original; }), item.options.map(function (_, i) { return i; }));
});
test("reorderTokens: never in the right order at once, the same set of words, no punctuation around the sentence", function () {
  const items = allItems.filter(function (it) { return it.type === "reorder"; });
  assert.ok(items.length >= 2);
  items.forEach(function (it) {
    const words = X.answerTokens(it.answers[0], it.answers.slice(1));
    const name = it.answers.slice(1).some(function (o) { return o.split(" ").slice(1).join(" ").indexOf(words[0]) !== -1; });
    assert.ok((name || /^\p{Ll}/u.test(words[0])) && /\p{L}$/u.test(words[words.length - 1]), it.id + ": " + words.join(" "));
    for (let s = 1; s < 40; s++) {
      const t = X.reorderTokens(it, seeded(s)).map(function (x) { return x.text; });
      assert.ok(!X.evaluate(it, { words: t }).correct, it.id + " given in the right order");
      assert.deepStrictEqual(t.slice().sort(), words.concat(it.extraTokens || []).sort());
    }
  });
});
test("evaluate: the model answer of every fixture item gives full points", function () {
  assert.ok(allItems.length >= 18);
  allItems.forEach(function (it) {
    const r = X.evaluate(it, modelAnswerOf(it));
    assert.ok(r.correct && r.points === r.max && r.max === X.maxPoints(it), it.id + " " + JSON.stringify(r));
  });
});
test("evaluate: the model answer of every item in content/exercises gives full points (types of the engine)", function () {
  const dir = path.join(__dirname, "..", "content", "exercises");
  let n = 0;
  fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).forEach(function (f) {
    const set = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    (set.items || []).filter(function (it) { return X.TYPES.indexOf(it.type) !== -1; }).forEach(function (it) {
      const r = X.evaluate(it, modelAnswerOf(it));
      assert.ok(r.correct && r.points === r.max, f + " " + it.id + " " + JSON.stringify(r));
      n++;
    });
  });
  assert.ok(n > 0);
});
test("every engine type has Spanish test data in content/exercises (stage 4, step 6)", function () {
  const dir = path.join(__dirname, "..", "content", "exercises");
  const seen = {};
  fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).forEach(function (f) {
    (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).items || []).forEach(function (it) { seen[it.type] = true; });
  });
  assert.deepStrictEqual(X.TYPES.filter(function (t) { return !seen[t]; }), []);
});

console.log("\nparadigm: Fill the table (spec 06 E6)");
test("paradigm: a point per cell to fill, a given cell gives none; maxPoints counts only open cells", function () {
  const it = bankItem("fx-ser-estar-1-07");
  assert.strictEqual(X.maxPoints(it), 5);
  assert.deepStrictEqual(X.paradigmCells(it), [1, 2, 3, 4, 5]);
  const full = X.evaluate(it, modelAnswerOf(it));
  assert.ok(full.correct && full.points === 5 && full.max === 5 && full.cells[0] === null, JSON.stringify(full));
  assert.strictEqual(X.sessionScore([{ item: it, res: full }]).total, 5);
});
test("paradigm: every cell is checked with match — case free, accents-only is wrong with the hint; correct = all cells right", function () {
  const c = BANK.cases.paradigm, it = bankItem(c.item);
  const half = X.evaluate(it, { texts: c.half });
  assert.ok(!half.correct && half.points === 2 && half.answered, JSON.stringify(half));
  assert.strictEqual(half.cells[2].near, "accents");
  assert.strictEqual(half.cells[2].closest, c.closest);
  assert.ok(X.evaluate(it, { texts: c.caps }).correct);
  assert.ok(!X.evaluate(it, { texts: [] }).answered);
});
test("paradigm: lenientAccents counts accents-only cells as right and marks the result lenient", function () {
  const c = BANK.cases.paradigm, it = bankItem(c.item);
  const strict = X.evaluate(it, { texts: c.accents });
  assert.ok(!strict.correct && strict.points === 4);
  const lenient = X.evaluate(it, { texts: c.accents }, { lenientAccents: true });
  assert.ok(lenient.correct && lenient.points === 5 && lenient.lenient === true && lenient.cells[5].near === "accents");
});
test("paradigm: S reads nothing before checking, every cell with its form after", function () {
  const c = BANK.cases.paradigm, it = bankItem(c.item);
  assert.strictEqual(X.speechText(it, false), "");
  assert.strictEqual(X.speechText(it, true).indexOf(c.spoken), 0);
});

console.log("\nSpanish in the engine (stage 4, step 1)");
test("reorder: opening and closing marks are never tiles; sentenceFrame gives them back around the line", function () {
  BANK.cases.frames.forEach(function (f) { assert.deepStrictEqual(X.sentenceFrame(f[0]), { open: f[1], close: f[2] }, f[0]); });
  BANK.cases.tokens.forEach(function (c) {
    const words = X.answerTokens(c.sentence, c.others);
    assert.deepStrictEqual(words, c.words);
    if (c.item) assert.ok(X.evaluate(bankItem(c.item), { words: words }).correct);
  });
});
test("reorder: the first word goes to lower case unless another order shows it with a capital inside (a name)", function () {
  const c = BANK.cases.name, it = bankItem(c.item);
  assert.strictEqual(X.answerTokens(it.answers[0], it.answers.slice(1))[0], c.first);
  assert.strictEqual(X.answerTokens(it.answers[1], it.answers.slice(0, 1))[0], c.secondFirst);
  for (let s = 1; s < 10; s++) {
    const toks = X.reorderTokens(it, seeded(s)).map(function (t) { return t.text; });
    assert.ok(toks.indexOf(c.first) !== -1 && toks.indexOf(c.first.toLowerCase()) === -1, toks.join(" "));
  }
});
test("speechText: hints and English glosses in brackets are not read; the gap is the model answer after checking", function () {
  BANK.cases.speech.forEach(function (c) {
    const it = typeof c.item === "string" ? bankItem(c.item) : c.item;
    assert.strictEqual(X.speechText(it, true), c.text);
  });
});
test("transformation: the word count is plain words (a contraction counts once), the key word must stay unchanged", function () {
  const c = BANK.cases.transformationWords;
  assert.ok(X.evaluate(c.item, { text: c.ok }).correct);
  assert.strictEqual(X.evaluate(c.item, { text: c.noKeyword }).msg, "Use the key word without changing it (" + c.item.keyword + ").");
});

console.log("\nTests use syllabus categories (spec 06 E10)");
test("placement skillOf: verbs and cases count as grammar, functions as vocabulary; no skill → grammar", function () {
  assert.strictEqual(L.skillOf({ skill: "grammar" }), "grammar");
  assert.strictEqual(L.skillOf({ skill: "verbs" }), "grammar");
  assert.strictEqual(L.skillOf({ skill: "cases" }), "grammar");
  assert.strictEqual(L.skillOf({ skill: "functions" }), "vocabulary");
  assert.strictEqual(L.skillOf({ skill: "reading" }), "reading");
  assert.strictEqual(L.skillOf({}), "grammar");
});
test("placement skillOf: without a skill, the category of the question's topic (LM.syl)", function () {
  const before = global.LM.syl;
  global.LM.syl = { topic: function (id) { return id === "a1-vocabulary-food" ? { category: "vocabulary" } : id === "a1-verbs-ser" ? { category: "verbs" } : null; } };
  try {
    assert.strictEqual(L.skillOf({ topicId: "a1-vocabulary-food" }), "vocabulary");
    assert.strictEqual(L.skillOf({ topicId: "a1-verbs-ser" }), "grammar");
    assert.strictEqual(L.skillOf({ topicId: "a1-unknown" }), "grammar");
  } finally { global.LM.syl = before; }
});
test("final test draw: every syllabus category of the pool is represented in proportion; at most two paradigm items in a valid pool", function () {
  const F = global.LM.finalLogic;
  const cats = { verbs: 10, grammar: 9, functions: 5, vocabulary: 6 };
  const pool = [];
  Object.keys(cats).forEach(function (c) {
    for (let i = 0; i < cats[c]; i++) pool.push({ id: c + i, topic: c + "-t" + (i % 4), type: i === 0 && c === "verbs" ? "paradigm" : "multiple-choice", category: c });
  });
  for (let s = 1; s < 20; s++) {
    const got = F.drawItems(pool, 20, function (it) { return it.category; }, seeded(s));
    const per = {};
    got.forEach(function (it) { per[it.category] = (per[it.category] || 0) + 1; });
    assert.strictEqual(got.length, 20);
    Object.keys(cats).forEach(function (c) { assert.ok(Math.abs(per[c] - 20 * cats[c] / 30) <= 1, c + ": " + per[c]); });
  }
});

test("evaluate: find-error tells a wrong fragment from a wrong fix; the fix uses match", function () {

  const it = bankItem("fx-ser-estar-1-05");
  assert.strictEqual(X.evaluate(it, { range: [0, 0], fix: it.fixes[0] }).rangeOk, false);
  const r = X.evaluate(it, { range: it.errorRange.slice(), fix: "zzz" });
  assert.ok(r.rangeOk && !r.fixOk && !r.correct);
  assert.ok(X.evaluate(it, { range: it.errorRange.slice(), fix: it.fixes[0].toUpperCase() }).correct);
  assert.ok(!X.evaluate(it, { noError: true }).correct);
  assert.ok(X.evaluate(bankItem("fx-gustar-1-06"), { noError: true }).correct);
});
test("evaluate: short-answer — case does not matter, an accents-only answer is not correct but gets the hint", function () {
  const it = bankItem("fx-ser-estar-1-02");
  assert.ok(X.evaluate(it, { text: " " + it.accepted[0].toUpperCase() + " " }).correct);
  const acc = X.evaluate(it, { text: global.LM.lang.stripMarks(it.accepted[0]) });
  assert.ok(!acc.correct && acc.near === "accents" && acc.closest === it.accepted[0], JSON.stringify(acc));
  assert.ok(!X.evaluate(it, { text: "" }).answered);
});
test("reorder: pointing to the first difference", function () {
  const c = BANK.cases.reorderDiff;
  assert.strictEqual(X.firstDifference(bankItem(c.item), c.words), c.at);
});
test("points: the score of every set of one-point types equals the number of right items", function () {
  const ONE = ["multiple-choice", "reorder", "find-error", "short-answer", "translate"];
  const sets = BANK.sets.map(function (s) { return s.items.filter(function (it) { return ONE.indexOf(it.type) !== -1; }); });
  /** A right or a wrong answer to a one-point item. */
  function answer(it, ok) {
    if (it.type === "multiple-choice") return { chosen: ok ? it.correct : (it.correct + 1) % it.options.length };
    if (it.type === "reorder") return { words: ok ? X.answerTokens(it.answers[0]) : X.answerTokens(it.answers[0]).reverse() };
    if (it.type === "find-error") return ok ? (it.noError ? { noError: true } : { range: it.errorRange.slice(), fix: it.fixes[0] }) : (it.noError ? { range: [0, 0], fix: "x" } : { noError: true });
    return { text: ok ? it.accepted[0] : "zzz" };
  }
  sets.forEach(function (items, k) {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = seeded(seed);
      const results = items.map(function (it) {
        const ok = seed === 1 ? true : seed === 2 ? false : rng() < 0.5;
        return { item: it, res: X.evaluate(it, answer(it, ok)) };
      });
      const before = { score: results.filter(function (r) { return r.res.correct; }).length, total: items.length };
      assert.deepStrictEqual(X.sessionScore(results), before, "set " + k + " (seed " + seed + ")");
      results.forEach(function (r) {
        assert.strictEqual(X.maxPoints(r.item), 1);
        assert.strictEqual(r.res.points, r.res.correct ? 1 : 0, r.item.id);
      });
    }
  });
});
test("points: sessionScore adds up points and maximums, skips items with max = 0", function () {
  const r = X.sessionScore([
    { item: { type: "short-answer" }, res: { correct: true, points: 1, max: 1 } },
    { item: { type: "x" }, res: { correct: false, points: 1, max: 2 } },
    { item: { type: "x" }, res: { correct: false, points: 0, max: 0, skipped: true } },
    { item: { type: "multiple-choice" }, res: null }
  ]);
  assert.deepStrictEqual(r, { score: 2, total: 4 });
});
test("maxPoints: gaps and pairs one point each, transformation with parts 2, the rest 1", function () {
  assert.strictEqual(X.maxPoints(bankItem("fx-ser-estar-1-03")), 2);
  assert.strictEqual(X.maxPoints(bankItem("fx-gustar-1-01")), 3);
  assert.strictEqual(X.maxPoints(bankItem("fx-preterito-1-02")), 1);
  assert.strictEqual(X.maxPoints(bankItem("fx-preterito-1-03")), 2);
  assert.strictEqual(X.maxPoints(bankItem("fx-preterito-1-05")), 1);
  assert.strictEqual(X.maxPoints(bankItem("fx-preterito-1-04")), 1);
});
test("gap-fill: a point for each gap, near hints per gap, lenient accents, case does not matter", function () {
  const c = BANK.cases.gapFill, it = bankItem(c.item);
  const half = X.evaluate(it, { texts: c.half });
  assert.deepStrictEqual([half.points, half.max, half.correct], [1, 2, false]);
  assert.deepStrictEqual(half.gaps.map(function (g) { return g.correct; }), [true, false]);
  assert.strictEqual(half.gaps[1].near, "typo");
  const acc = X.evaluate(it, { texts: c.accents });
  assert.ok(!acc.correct && acc.gaps[1].near === "accents" && acc.gaps[1].closest === it.gaps[1].accepted[0]);
  const len = X.evaluate(it, { texts: c.accents }, { lenientAccents: true });
  assert.ok(len.correct && len.lenient && len.points === 2 && len.gaps[1].near === "accents" && len.gaps[1].lenient);
  assert.ok(!X.evaluate(it, { texts: ["", " "] }).answered);
});
test("match: a point for each pair, extraRight is never right", function () {
  const it = bankItem(BANK.cases.match.item);
  const r = X.evaluate(it, { pairs: { 0: it.pairs[0][1], 1: it.pairs[2][1], 2: it.extraRight[0] } });
  assert.deepStrictEqual([r.points, r.max, r.correct], [1, 3, false]);
  assert.deepStrictEqual(r.pairs, [true, false, false]);
  assert.ok(!X.evaluate(it, { pairs: {} }).answered);
});
test("prepareMatch: the right column always shuffled, with extraRight, nothing lost", function () {
  allItems.filter(function (it) { return it.type === "match"; }).forEach(function (it) {
    for (let s = 1; s < 60; s++) {
      const right = X.prepareMatch(it, seeded(s));
      assert.ok(!it.pairs.every(function (p, i) { return right[i].text === p[1]; }), it.id + " in the right order");
      assert.deepStrictEqual(right.map(function (r) { return r.text; }).sort(), it.pairs.map(function (p) { return p[1]; }).concat(it.extraRight || []).sort());
    }
  });
});
test("transformation: answers, case, word limit, key word, accents hint; with parts — partial points", function () {
  const c = BANK.cases.transformation, it = bankItem(c.plain);
  c.plainOk.forEach(function (a) { assert.ok(X.evaluate(it, { text: a }).correct, a); });
  const long = X.evaluate(it, { text: c.tooLong });
  assert.ok(!long.correct && new RegExp("you have " + c.tooLongWords + " words").test(long.msg), long.msg);
  const kw = X.evaluate(it, { text: c.noKeyword });
  assert.ok(!kw.correct && kw.msg.indexOf("(" + it.keyword + ")") !== -1, kw.msg);
  const acc = X.evaluate(it, { text: c.plainAccents });
  assert.ok(!acc.correct && acc.near === "accents", JSON.stringify(acc));
  assert.ok(X.evaluate(it, { text: c.plainAccents }, { lenientAccents: true }).lenient);
  const p = bankItem(c.parts);
  const one = X.evaluate(p, { text: c.partial });
  assert.deepStrictEqual([one.points, one.max, one.correct], [1, 2, false]);
  assert.deepStrictEqual(one.parts, [true, false]);
  assert.strictEqual(X.evaluate(p, { text: c.full }).points, 2);
  assert.deepStrictEqual(X.trTokens("  a-b,  c ' d - e "), ["A-B", "C", "'", "D", "E"]);
});
test("normalizeSentence = LM.lang.normalizeSentence: the punctuation of the language goes, diacritics stay", function () {
  FX.normalizeSentence.forEach(function (c) { assert.strictEqual(X.normalizeSentence(c[0]), c[1], c[0]); });
});
test("translate: match after normalizing (case, opening and final marks), alternatives; accents → hint, lenient → correct", function () {
  const c = BANK.cases.translate, it = bankItem(c.item);
  c.ok.forEach(function (a) { assert.ok(X.evaluate(it, { text: a }).correct, a); });
  const acc = X.evaluate(it, { text: c.accents });
  assert.ok(!acc.correct && acc.near === "accents" && acc.closest === 0, JSON.stringify(acc));
  const len = X.evaluate(it, { text: c.accents }, { lenientAccents: true });
  assert.ok(len.correct && len.lenient && len.near === "accents");
  assert.ok(!X.evaluate(it, { text: "" }).answered);
});
test("word-by-word comparison: missing, extra, replaced on a 6-word sentence; the nearest variant; a typo", function () {
  const w = FX.wordDiff;
  const d = X.wordDiff(w.model.split(" "), w.got.split(" "));
  assert.deepStrictEqual(d.ops.filter(function (o) { return o.op !== "same"; }), w.changes);
  const low = X.wordDiff(w.model.toLowerCase().split(" "), w.got.split(" "));
  assert.deepStrictEqual(low.ops.filter(function (o) { return o.op !== "same"; }), w.lowerChanges);
  const c = BANK.cases.translate, it = bankItem(c.item);
  const miss = X.evaluate(it, { text: c.missing.text });
  assert.ok(!miss.correct && !miss.near && miss.closest === c.missing.closest && miss.diff.some(function (o) { return o.op === "missing" && o.word === c.missing.word; }), JSON.stringify(miss));
  const typo = X.evaluate(it, { text: c.typo.text });
  assert.ok(!typo.correct && typo.near === "typo" && typo.closest === c.typo.closest, JSON.stringify(typo));
});
test("dictation: text and variants from accepted; skipped (no voice) — 0 of 0, not counted", function () {
  const c = BANK.cases.dictation, it = bankItem(c.item);
  assert.ok(X.evaluate(it, { text: c.ok }).correct);
  assert.ok(!X.evaluate(it, { text: c.wrong }).correct);
  const s = X.evaluate(it, { skipped: true });
  assert.deepStrictEqual([s.points, s.max, s.skipped, s.correct], [0, 0, true, false]);
  const m = bankItem("fx-gustar-1-01");
  assert.deepStrictEqual(X.sessionScore([{ item: it, res: s }, { item: m, res: X.evaluate(m, modelAnswerOf(m)) }]), { score: 3, total: 3 });
});
test("pickMix: even across topics, no repeats, a limit, a type filter, ≤ 2 of the same type in a row", function () {
  for (let s = 1; s < 30; s++) {
    const m = X.pickMix(allItems, { count: 9 }, seeded(s));
    assert.strictEqual(m.items.length, 9);
    assert.strictEqual(new Set(m.items.map(function (x) { return x.id; })).size, 9);
    const per = {};
    m.items.forEach(function (x) { per[x.topic] = (per[x.topic] || 0) + 1; });
    const counts = Object.keys(per).map(function (k) { return per[k]; });
    assert.ok(Math.max.apply(null, counts) - Math.min.apply(null, counts) <= 1, "uneven: " + JSON.stringify(per));
    for (let i = 2; i < m.items.length; i++) {
      const same = m.items[i].type === m.items[i - 1].type && m.items[i].type === m.items[i - 2].type;
      if (same) assert.ok(m.items.slice(i + 1).every(function (x) { return x.type === m.items[i].type; }), "3 in a row");
    }
  }
  const fe = X.pickMix(allItems, { count: 50, types: ["find-error"] }, seeded(5));
  assert.ok(fe.items.every(function (x) { return x.type === "find-error"; }));
  assert.strictEqual(fe.items.length, fe.available);
});
test("pickMix: leaves out the items of the last session when the pool is big enough", function () {
  const first = X.pickMix(allItems, { count: 6 }, seeded(7));
  const ids = first.items.map(function (x) { return x.id; });
  const second = X.pickMix(allItems, { count: 6, exclude: ids }, seeded(8));
  assert.ok(second.items.every(function (x) { return ids.indexOf(x.id) === -1; }));
});

console.log("\nLanguage layer: LM.lang and LM.exLogic.match (spec 05 §6, fixtures in tools/fixtures/lang/lang.json)");
const LG = global.LM.lang;
test("stripMarks and fold keep the length of the input", function () {
  FX.stripMarks.forEach(function (c) { assert.strictEqual(LG.stripMarks(c[0]), c[1]); assert.strictEqual(LG.stripMarks(c[0]).length, c[0].length); });
  FX.fold.forEach(function (c) { assert.strictEqual(LG.fold(c[0]), c[1]); assert.strictEqual(LG.fold(c[0]).length, c[0].length); });
  assert.strictEqual(LG.stripMarks(null), "");
});
test("normalizeAnswer keeps diacritics; normalizeSentence strips the punctuation of the language", function () {
  FX.normalizeAnswer.forEach(function (c) { assert.strictEqual(LG.normalizeAnswer(c[0]), c[1], c[0]); });
  FX.normalizeSentence.forEach(function (c) { assert.strictEqual(LG.normalizeSentence(c[0]), c[1], c[0]); });
  assert.deepStrictEqual(LG.variants("x"), ["x"]);
});
test("countWords", function () {
  FX.countWords.forEach(function (c) { assert.strictEqual(LG.countWords(c[0]), c[1], c[0]); });
});
test("wordPattern matches whole words with diacritics and inner hyphens", function () {
  const re = new RegExp("^" + LG.wordPattern + "$", "u");
  FX.cloze.forEach(function (c) { assert.ok(re.test(c[1]), c[1]); });
});
test("match: exact, accents only, ending only, typo, nothing; sentences; closest and index", function () {
  FX.match.forEach(function (c) {
    const r = X.match(c.answer, c.accepted, { sentence: !!c.sentence });
    const tag = JSON.stringify(c) + " → " + JSON.stringify(r);
    assert.strictEqual(r.ok, !!c.ok, tag);
    if (!c.ok) assert.strictEqual(r.near, c.near, tag);
    if (c.closest) assert.strictEqual(r.closest, c.closest, tag);
    if (c.index !== undefined) assert.strictEqual(r.index, c.index, tag);
    if (c.answered === false) assert.strictEqual(r.answered, false, tag);
  });
  ["accents", "ending", "typo"].forEach(function (n) { assert.ok(X.nearText(n).length > 5, n); });
  assert.strictEqual(X.nearText(null), "");
});
test("match: lenient mode — an accents-only answer counts, the reminder stays; other near misses never count", function () {
  const c = FX.lenient;
  const strict = X.evaluate(c.item, { text: c.answer });
  assert.ok(!strict.correct && strict.near === "accents" && !strict.lenient);
  const len = X.evaluate(c.item, { text: c.answer }, { lenientAccents: true });
  assert.ok(len.correct && len.lenient && len.near === "accents" && len.points === 1);
  FX.match.filter(function (m) { return !m.sentence && (m.near === "typo" || m.near === "ending"); }).forEach(function (m) {
    assert.ok(!X.evaluate({ type: "short-answer", accepted: m.accepted }, { text: m.answer }, { lenientAccents: true }).correct, m.answer);
  });
});
test("isTarget: 10 target-language sentences yes, 10 English sentences no", function () {
  assert.strictEqual(FX.isTarget.target.length, 10);
  assert.strictEqual(FX.isTarget.native.length, 10);
  FX.isTarget.target.forEach(function (s) { assert.ok(LG.isTarget(s), s); });
  FX.isTarget.native.forEach(function (s) { assert.ok(!LG.isTarget(s), s); });
  assert.ok(!LG.isTarget("") && !LG.isTarget(null));
});
test("abbreviations and sentence openers come from LM.lang", function () {
  assert.ok(LG.abbreviations.length >= 8 && LG.abbreviations.every(function (a) { return /\.$/.test(a); }));
  assert.ok(typeof LG.sentenceOpeners === "string");
});

console.log("\nLevel final tests");
const F = global.LM.finalLogic;
/** A 30-item pool like A1: tenses 4, grammar 14, functions 8, vocabulary 4 (2 topics per category, some items worth several points). */
function finalPool() {
  const plan = [["tenses", 6], ["grammar", 14], ["functions", 8], ["vocabulary", 2]];
  const out = [];
  plan.forEach(function (p) {
    for (let i = 0; i < p[1]; i++) {
      const multi = i % 5 === 4;
      out.push(multi
        ? { id: p[0] + "-" + i, type: "gap-fill", topic: p[0] + "-t" + (i % 4), text: "{{1}} {{2}} {{3}}", gaps: [{ accepted: ["a"] }, { accepted: ["b"] }, { accepted: ["c"] }] }
        : { id: p[0] + "-" + i, type: i % 2 ? "short-answer" : "multiple-choice", topic: p[0] + "-t" + (i % 4), prompt: "x ___", accepted: ["a"], options: ["a", "b"], correct: 0 });
    }
  });
  return out;
}
const catOf = function (it) { return it.id.split("-")[0]; };
test("isPassed: the threshold in points (16/20 at 80%), limits and empty", function () {
  assert.ok(F.isPassed(16, 20, 80) && !F.isPassed(15, 20, 80));
  assert.ok(F.isPassed(24, 29, 80) && !F.isPassed(23, 29, 80)); // with multi-point items total ≠ 20
  assert.ok(F.isPassed(20, 20, 100) && !F.isPassed(0, 0, 80));
});
test("allocate: proportional, sum = draw, each category ≥ 1, never more than in the pool", function () {
  const main = F.allocate({ a: 6, b: 14, c: 8, d: 2 }, 20); // kwoty: 4; 9,33; 5,33; 1,33
  assert.strictEqual(main.a + main.b + main.c + main.d, 20);
  assert.ok(main.a === 4 && main.c === 5 && main.b >= 9 && main.b <= 10 && main.d >= 1 && main.d <= 2);
  assert.deepStrictEqual(F.allocate({ a: 3, b: 3 }, 20), { a: 3, b: 3 }); // never more than in the pool
  const a = F.allocate({ a: 1, b: 20, c: 9 }, 20);
  assert.strictEqual(a.a + a.b + a.c, 20);
  assert.ok(a.a === 1 && a.b <= 20 && a.c >= 1);
  const small = F.allocate({ a: 2, b: 2, c: 26 }, 20);
  assert.strictEqual(small.a + small.b + small.c, 20);
  assert.ok(small.a >= 1 && small.b >= 1 && small.a <= 2 && small.b <= 2);
});
test("drawItems: 20 of 30, no duplicates, each category represented proportionally (±1)", function () {
  const pool = finalPool();
  const counts = {};
  pool.forEach(function (it) { counts[catOf(it)] = (counts[catOf(it)] || 0) + 1; });
  for (let s = 1; s < 60; s++) {
    const d = F.drawItems(pool, 20, catOf, seeded(s));
    assert.strictEqual(d.length, 20);
    assert.strictEqual(new Set(d.map(function (x) { return x.id; })).size, 20);
    const got = {};
    d.forEach(function (it) { got[catOf(it)] = (got[catOf(it)] || 0) + 1; });
    Object.keys(counts).forEach(function (c) {
      assert.ok(got[c] >= 1, "brak kategorii " + c);
      assert.ok(Math.abs(got[c] - 20 * counts[c] / 30) <= 1, c + ": " + got[c] + " zamiast ok. " + (20 * counts[c] / 30).toFixed(1));
    });
    // a multi-point item is one item of the 20, not several
    assert.ok(d.every(function (it) { return pool.indexOf(it) !== -1; }));
  }
});
test("drawItems: different draws give different sets; a type never repeats more than 2 times in a row; different topics in a category", function () {
  const pool = finalPool();
  const a = F.drawItems(pool, 20, catOf, seeded(1)).map(function (x) { return x.id; }).join();
  const b = F.drawItems(pool, 20, catOf, seeded(2)).map(function (x) { return x.id; }).join();
  assert.notStrictEqual(a, b);
  for (let s = 1; s < 40; s++) {
    const d = F.drawItems(pool, 20, catOf, seeded(s));
    const bad = d.some(function (it, i) { return i >= 2 && d[i - 1].type === it.type && d[i - 2].type === it.type; });
    // limitRuns works "when it can": in this pool (3 types) it always can
    assert.ok(!bad, "3 in a row (seed " + s + ")");
    const gr = d.filter(function (it) { return catOf(it) === "grammar"; });
    assert.strictEqual(new Set(gr.map(function (it) { return it.topic; })).size, 4); // 9 items from 4 topics → all 4 topics
  }
});
test("drawItems: a pool no bigger than draw → all items", function () {
  const pool = finalPool().slice(0, 12);
  assert.strictEqual(F.drawItems(pool, 20, catOf, seeded(5)).length, 12);
});
test("breakdown: points by category, topics with lost points, skipped ones do not count", function () {
  const pool = finalPool();
  const results = pool.slice(0, 8).map(function (it, i) {
    return { item: it, res: X.evaluate(it, it.type === "gap-fill" ? { texts: i % 2 ? ["a", "x", "x"] : ["a", "b", "c"] } : it.type === "multiple-choice" ? { chosen: i % 2 ? 1 : 0 } : { text: i % 2 ? "zzz" : "a" }) };
  });
  results.push({ item: { id: "dictation-1", type: "dictation", topic: "t-x" }, res: { correct: false, points: 0, max: 0, skipped: true } });
  const b = F.breakdown(results, catOf);
  const total = b.categories.reduce(function (s, c) { return s + c.total; }, 0);
  assert.strictEqual(total, results.slice(0, 8).reduce(function (s, r) { return s + r.res.max; }, 0));
  assert.ok(b.categories.every(function (c) { return c.score <= c.total; }));
  assert.ok(b.topics.every(function (t) { return t.lost > 0 && t.topic !== "t-x"; }));
  for (let i = 1; i < b.topics.length; i++) assert.ok(b.topics[i - 1].lost >= b.topics[i].lost);
  assert.deepStrictEqual(F.breakdown([], catOf), { categories: [], topics: [] });
});

// ---------- Profile data: slm.finals (level stamps) ----------
global.localStorage = { _d: {}, getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; }, setItem: function (k, v) { this._d[k] = String(v); }, removeItem: function (k) { delete this._d[k]; } };
require(path.join(__dirname, "..", "js", "utils.js"));
require(path.join(__dirname, "..", "js", "config.js"));
let activeProfile = "p1";
global.LM.app = { getActiveProfile: function () { return activeProfile ? { id: activeProfile } : null; }, reportSaveError: function () { throw new Error("save error"); } };
require(path.join(__dirname, "..", "js", "profile-data.js"));
const PD = global.LM.profileData;
// Learning data through the handlers of the storage key registry (LM.storage in js/profile-data.js), keyed by kind
const LEARN = (function () {
  const byKind = {};
  global.LM.storage.REGISTRY.filter(function (e) { return e.scope === "profiles"; }).forEach(function (e) { byKind[e.kind] = e.handler(); });
  const each = function (fn) { Object.keys(byKind).forEach(function (k) { fn(k, byKind[k]); }); };
  return {
    exportData: function () { const o = {}; each(function (k, h) { o[k] = h.exportData(); }); return o; },
    parseImport: function (raw) { if (raw == null) return null; const o = {}; each(function (k, h) { o[k] = h.parseImport(raw[k]); }); return o; },
    applyImport: function (parsed, ids) { each(function (k, h) { h.applyImport(parsed ? parsed[k] : null, ids); }); },
    removeProfile: function (pid) { each(function (k, h) { h.removeProfile(pid); }); },
    clearAll: function () { each(function (k, h) { h.clearAll(); }); }
  };
})();
function freshPD() { LEARN.clearAll(); activeProfile = "p1"; }

test("slm.finals: the key is in KEYS next to the others, the placement test has its own (slm.placement)", function () {
  assert.strictEqual(PD.KEYS.levelTests, "slm.finals");
  assert.strictEqual(PD.KEYS.levelTest, "slm.placement");
});
test("saveFinalResult: the first pass, the best result by percent, the stamp stays after a failed attempt", function () {
  freshPD();
  assert.strictEqual(PD.finalResult("A1"), null);
  const fail = PD.saveFinalResult("A1", { score: 12, total: 20, passed: false });
  assert.deepStrictEqual([fail.passed, fail.firstPass, fail.passedAt], [false, false, null]);
  const pass = PD.saveFinalResult("A1", { score: 17, total: 20, passed: true });
  assert.deepStrictEqual([pass.passed, pass.firstPass, pass.best.score], [true, true, 17]);
  const again = PD.saveFinalResult("A1", { score: 18, total: 22, passed: true }); // 81,8% < 85%
  assert.deepStrictEqual([again.firstPass, again.best.score, again.last.score], [false, 17, 18]);
  const worse = PD.saveFinalResult("A1", { score: 9, total: 20, passed: false });
  assert.strictEqual(worse.passedAt, pass.passedAt); // the stamp does not disappear
  assert.deepStrictEqual(PD.passedLevels(), { A1: pass.passedAt });
  assert.strictEqual(PD.saveFinalResult("Z9", { score: 1, total: 2, passed: true }), null);
  assert.strictEqual(PD.saveFinalResult("A2", { score: 5, total: 0, passed: true }), null);
});
test("slm.finals: data per profile, nothing is saved without a profile", function () {
  freshPD();
  PD.saveFinalResult("B1", { score: 20, total: 20, passed: true });
  activeProfile = "p2";
  assert.strictEqual(PD.finalResult("B1"), null);
  assert.deepStrictEqual(PD.passedLevels(), {});
  activeProfile = null;
  assert.strictEqual(PD.saveFinalResult("B1", { score: 20, total: 20, passed: true }), null);
  assert.strictEqual(PD.finalResult("B1"), null);
});
test("slm.finals: export contains the key, import restores the data, deleting the profile and reset clear it", function () {
  freshPD();
  PD.saveFinalResult("C1", { score: 18, total: 20, passed: true });
  const exported = JSON.parse(JSON.stringify(LEARN.exportData()));
  assert.ok(exported.levelTests && exported.levelTests.profiles.p1.levels.C1.passedAt);
  LEARN.clearAll();
  assert.strictEqual(PD.finalResult("C1"), null);
  assert.strictEqual(global.localStorage.getItem("slm.finals"), null);
  LEARN.applyImport(LEARN.parseImport(exported), ["p1"]);
  assert.strictEqual(PD.finalResult("C1").best.score, 18);
  assert.ok(global.localStorage.getItem("slm.finals"));
  LEARN.removeProfile("p1");
  assert.strictEqual(PD.finalResult("C1"), null);
  assert.strictEqual(JSON.parse(global.localStorage.getItem("slm.finals")).profiles.p1, undefined);
});
test("importing an old file without the slm.finals key: the part is skipped, the data of this browser stays", function () {
  freshPD();
  PD.saveFinalResult("A2", { score: 16, total: 20, passed: true });
  const old = JSON.parse(JSON.stringify(LEARN.exportData()));
  delete old.levelTests; // a file from a version before pack v6
  const parsed = LEARN.parseImport(old);
  assert.strictEqual(parsed.levelTests, null);
  assert.ok(parsed.journal && parsed.exercises);
  LEARN.applyImport(parsed, ["p1"]);
  assert.strictEqual(PD.finalResult("A2").passedAt !== null, true);
  // a profile that is not in the file is removed from the new key too
  LEARN.applyImport(parsed, ["inny"]);
  assert.strictEqual(PD.finalResult("A2"), null);
  // a very old file without the "learning" part
  assert.strictEqual(LEARN.parseImport(undefined), null);
});
test("import: a damaged or too new slm.finals key → error, junk in the data filtered out", function () {
  freshPD();
  assert.throws(function () { LEARN.parseImport({ levelTests: { version: 99, profiles: {} } }); }, /Unsupported data version/);
  assert.throws(function () { LEARN.parseImport({ levelTests: { version: 1 } }); }, /Wrong data format/);
  const parsed = LEARN.parseImport({ levelTests: { version: 1, profiles: { p1: { levels: {
    A1: { passedAt: "some day", best: { score: 30, total: 20, date: "2026-01-01" }, last: { score: 15, total: 20, date: "2026-01-02" } }, // bad day, bad best
    A2: { passedAt: "2026-02-03", best: { score: 16, total: 20, date: "2026-02-03" } },                                               // no last
    Z9: { passedAt: "2026-02-03", best: { score: 1, total: 2, date: "2026-02-03" } },                                                 // unknown level
    B1: "text"
  } } } } });
  const lv = parsed.levelTests.profiles.p1.levels;
  assert.deepStrictEqual(Object.keys(lv).sort(), ["A1", "A2"]);
  assert.deepStrictEqual([lv.A1.passedAt, lv.A1.best.score, lv.A1.last.score], [null, 15, 15]);
  assert.deepStrictEqual([lv.A2.passedAt, lv.A2.last.score], ["2026-02-03", 16]);
});
test("slm.finals: a damaged record in localStorage → an empty state and a _corrupt_backup copy", function () {
  // A new module instance (the profileData cache fills only on the first read)
  const file = path.join(__dirname, "..", "js", "profile-data.js");
  const keep = global.LM.profileData;
  delete require.cache[require.resolve(file)];
  global.localStorage.setItem("slm.finals", "{niepoprawny json");
  require(file);
  assert.deepStrictEqual(global.LM.profileData.passedLevels(), {});
  assert.strictEqual(global.localStorage.getItem("slm.finals.corrupt"), "{niepoprawny json");
  global.localStorage.removeItem("slm.finals");
  global.localStorage.removeItem("slm.finals.corrupt");
  global.LM.profileData = keep;
});

console.log("\nAttempts log and stats");
const T = global.LM.stats;
function att(itemId, topic, type, level, correct, day) {
  return { t: day + "T10:00:00.000Z", day: day, itemId: itemId, setId: null, topic: topic, level: level, type: type, tags: [], correct: correct, mode: "learn", answer: "" };
}
function recWith(list) { const r = { items: [], aggregates: {} }; list.forEach(function (a) { T.pushAttempt(r, a); }); return r; }
test("summary: answers accepted without accents (lenient) are a separate number, also after compacting (spec 06 E4)", function () {
  const a = att("a", "t", "short-answer", "A1", true, "2026-10-20"); a.lenient = true;
  const b = att("b", "t", "short-answer", "A1", true, "2026-10-19"); b.lenient = true;
  const r = recWith([b, a, att("c", "t", "short-answer", "A1", true, "2026-10-20")]);
  assert.strictEqual(T.summary(r, "2026-10-20").lenient, 2);
  const small = { items: [], aggregates: {} };
  [b, a].forEach(function (x) { T.pushAttempt(small, x, 1); }); // the older one goes into the aggregates
  assert.strictEqual(small.aggregates.b.lenient, 1);
  assert.strictEqual(T.summary(small, "2026-10-20").lenient, 2);
  assert.strictEqual(T.summary(recWith([att("d", "t", "reorder", "A1", true, "2026-10-20")]), "2026-10-20").lenient, 0);
});

test("ring buffer: a limit, the oldest go to aggregates, stats without loss", function () {
  const r = { items: [], aggregates: {} };
  for (let i = 0; i < 10; i++) T.pushAttempt(r, att("x-" + (i % 3), "t1", "reorder", "A1", i % 2 === 0, "2026-10-0" + (1 + (i % 9))), 6);
  assert.strictEqual(r.items.length, 6);
  const compacted = Object.keys(r.aggregates).reduce(function (s, k) { return s + r.aggregates[k].n; }, 0);
  assert.strictEqual(compacted, 4);
  const all = T.aggregate(r, "topic").t1;
  assert.deepStrictEqual(all, { n: 10, ok: 5 }); // attempts + aggregates = all answers
  assert.strictEqual(r.items[0].itemId, "x-" + (4 % 3)); // the newest stayed
  // Default limit 3000
  const big = { items: [], aggregates: {} };
  for (let i = 0; i < 3005; i++) T.pushAttempt(big, att("y", "t", "reorder", "A1", true, "2026-10-01"));
  assert.strictEqual(big.items.length, T.MAX_ATTEMPTS);
  assert.strictEqual(big.aggregates.y.n, 5);
});

test("accuracy aggregation by topic, type and level; a small sample = no rating", function () {
  const r = recWith([
    att("a", "t1", "reorder", "A1", true, "2026-10-01"), att("b", "t1", "reorder", "A1", false, "2026-10-01"),
    att("c", "t1", "find-error", "A1", true, "2026-10-02"), att("d", "t1", "find-error", "A1", true, "2026-10-02"),
    att("e", "t1", "multiple-choice", "A1", true, "2026-10-03"),
    att("f", "t2", "multiple-choice", "B1", false, "2026-10-03"), att("g", "t2", "multiple-choice", "B1", false, "2026-10-03")
  ]);
  assert.deepStrictEqual(T.aggregate(r, "topic"), { t1: { n: 5, ok: 4 }, t2: { n: 2, ok: 0 } });
  assert.deepStrictEqual(T.aggregate(r, "type")["multiple-choice"], { n: 3, ok: 1 });
  assert.deepStrictEqual(T.aggregate(r, "level"), { A1: { n: 5, ok: 4 }, B1: { n: 2, ok: 0 } });
  assert.strictEqual(T.accuracy({ n: 4, ok: 4 }), null);
  assert.strictEqual(T.accuracy({ n: 5, ok: 4 }), 0.8);
  const ranked = T.ranked(r, "topic");
  assert.deepStrictEqual(ranked.map(function (x) { return x.key; }), ["t1"]); // t2 has < 5 attempts
});

test("topics for weak-spot practice: ≥ 5 attempts, < 70%, ascending, at most 3", function () {
  const list = [];
  const make = function (topic, n, ok) { for (let i = 0; i < n; i++) list.push(att(topic + "-" + i, topic, "reorder", "A2", i < ok, "2026-10-05")); };
  make("good", 10, 9); make("weak", 10, 3); make("medium", 10, 6); make("small-sample", 4, 0); make("worst", 6, 1); make("borderline", 10, 7);
  const weak = T.weakTopics(recWith(list));
  assert.deepStrictEqual(weak.map(function (x) { return x.key; }), ["worst", "weak", "medium"]);
  assert.deepStrictEqual(T.weakTopics(recWith([att("a", "t", "reorder", "A1", true, "2026-10-01")])), []);
});

test("summary and weekly trend (today injected)", function () {
  const r = recWith([
    att("a", "t", "reorder", "A1", true, "2026-10-20"), att("b", "t", "reorder", "A1", false, "2026-10-14"),
    att("c", "t", "reorder", "A1", true, "2026-09-25"), att("d", "t", "reorder", "A1", true, "2026-07-01")
  ]);
  const s = T.summary(r, "2026-10-20");
  assert.deepStrictEqual([s.n7, s.n30, s.n], [2, 3, 4]); // Oct 14 fits in the 7 days (14–20)
  const w = T.weekly(r, "2026-10-20", 12);
  assert.strictEqual(w.length, 12);
  assert.strictEqual(w[11].start, "2026-10-19"); // Monday
  assert.strictEqual(w[11].n, 1);
  assert.strictEqual(w[10].n, 1);
  assert.strictEqual(w.reduce(function (x, y) { return x + y.n; }, 0), 3); // July is outside the 12 weeks
  const g = T.activityGrid(["2026-10-19", "2026-10-21"], "2026-10-20", 12);
  assert.strictEqual(g.length, 12);
  assert.ok(g[11][0].active && g[11][0].day === "2026-10-19");
  assert.ok(g[11][2].future && g[11][2].active);
});

test("log dedup: a new entry, an active one without a duplicate (back to stage 1), a mastered one comes back, a daily limit", function () {
  const today = "2026-10-20";
  assert.deepStrictEqual(T.planWrong(null, { today: today, autoToday: 0 }), { action: "create" });
  assert.deepStrictEqual(T.planWrong(null, { today: today, autoToday: 30 }), { action: "limit" });
  const stage0 = { review: { stage: 0, due: "2026-10-21", mastered: false } };
  assert.deepStrictEqual(T.planWrong(stage0, { today: today, autoToday: 99 }), { action: "update", review: stage0.review }); // existing: the limit does not apply
  const stage2 = { review: { stage: 2, due: "2026-10-27", mastered: false } };
  assert.deepStrictEqual(T.planWrong(stage2, { today: today, autoToday: 0 }), { action: "update", review: { stage: 0, due: "2026-10-21", mastered: false } });
  const mastered = { review: { stage: 2, due: "2026-10-01", mastered: true } };
  assert.deepStrictEqual(T.planWrong(mastered, { today: today, autoToday: 0 }), { action: "reopen", review: { stage: 0, due: "2026-10-21", mastered: false } });
});

test("a right answer completes a review only when it is due (today or overdue)", function () {
  const today = "2026-10-20";
  assert.strictEqual(T.planCorrect(null, today), null);
  assert.strictEqual(T.planCorrect({ review: { stage: 0, due: "2026-10-21", mastered: false } }, today), null); // not yet
  assert.strictEqual(T.planCorrect({ review: { stage: 2, due: "2026-10-10", mastered: true } }, today), null);  // opanowany
  assert.deepStrictEqual(T.planCorrect({ review: { stage: 0, due: "2026-10-20", mastered: false } }, today), { action: "review", review: { stage: 1, due: "2026-10-23", mastered: false } });
  assert.deepStrictEqual(T.planCorrect({ review: { stage: 2, due: "2026-10-15", mastered: false } }, today).review.mastered, true); // ostatni etap → opanowany
});

test("\"I know this\" suggestion: the last two ≥ 80%, not when already known, a 14-day pause after a refusal", function () {
  const o = { isKnown: false, dismissedDay: null, today: "2026-10-20" };
  assert.strictEqual(T.suggestKnown([0.9], o), false);
  assert.strictEqual(T.suggestKnown([0.8, 0.9], o), true);
  assert.strictEqual(T.suggestKnown([1, 0.7, 0.9], o), false);
  assert.strictEqual(T.suggestKnown([0.5, 0.8, 1], o), true);
  assert.strictEqual(T.suggestKnown([0.9, 0.9], Object.assign({}, o, { isKnown: true })), false);
  assert.strictEqual(T.suggestKnown([0.9, 0.9], Object.assign({}, o, { dismissedDay: "2026-10-10" })), false);
  assert.strictEqual(T.suggestKnown([0.9, 0.9], Object.assign({}, o, { dismissedDay: "2026-10-06" })), true);
});

test("weights: generator (accuracy < 60% × 2, new × 1.5) and practice (no right answer in 14 days × 2)", function () {
  const r = recWith([
    att("weak", "t", "reorder", "A1", false, "2026-10-01"), att("weak", "t", "reorder", "A1", false, "2026-10-02"), att("weak", "t", "reorder", "A1", true, "2026-10-03"),
    att("good", "t", "reorder", "A1", true, "2026-10-19"),
    att("long-ago", "t", "reorder", "A1", true, "2026-09-01")
  ]);
  const mw = T.mixWeight(r);
  assert.deepStrictEqual([mw({ id: "weak" }), mw({ id: "good" }), mw({ id: "new" })], [2, 1, 1.5]);
  const ww = T.weakWeight(r, "2026-10-20");
  // "weak" answered right 17 days ago — outside the 14-day window, so weight 2
  assert.deepStrictEqual([ww({ id: "good" }), ww({ id: "weak" }), ww({ id: "long-ago" }), ww({ id: "new" })], [1, 2, 2, 2]);
});

test("weighted draw: an item with weight 2 gets into the set more often", function () {
  const pool = [];
  for (let i = 0; i < 20; i++) pool.push({ id: "z" + i, topic: "t", type: "reorder" });
  let heavy = 0, light = 0;
  for (let s = 1; s <= 400; s++) {
    const m = X.pickMix(pool, { count: 5, weight: function (it) { return it.id === "z0" ? 2 : 1; } }, seeded(s * 104729 + 7)); // a big seed: the first number is not close to 0
    if (m.items.some(function (x) { return x.id === "z0"; })) heavy++;
    if (m.items.some(function (x) { return x.id === "z1"; })) light++;
  }
  assert.ok(heavy > light * 1.4, "waga 2: " + heavy + ", waga 1: " + light);
});

console.log("\nSearch (fold from LM.lang, records in tools/fixtures/lang/lang.json)");
const SR = global.LM.searchLogic;
const SFX = FX.search;
const recs = SR.prepare(SFX.records);
const searchIds = function (q, opts) { return [].concat.apply([], SR.search(recs, q, opts).groups.map(function (g) { return g.results.map(function (r) { return r.record.id; }); })); };

test("fold = LM.lang.fold: accents, case, quotes, the same length", function () {
  FX.fold.forEach(function (c) { assert.strictEqual(SR.fold(c[0]), c[1]); assert.strictEqual(SR.fold(c[0]).length, c[0].length); });
  assert.deepStrictEqual(SR.tokenize("Don’t stop, I'm here!"), ["don't", "stop", "i'm", "here"]);
});
test("search: prefix, accents with and without, all words must match, field weights", function () {
  assert.deepStrictEqual(searchIds(SFX.prefix[0]).slice(0, 2).sort(), SFX.prefix[1]);
  SFX.queries.forEach(function (q) { assert.deepStrictEqual(searchIds(q[0]), q[1], q[0]); });
  assert.strictEqual(SR.search(recs, SFX.titleFirst[0]).groups[0].results[0].record.id, SFX.titleFirst[1]); // title > text
});
test("search: typos only from 5 characters, swapped letters = one typo", function () {
  assert.ok(SR.search(recs, SFX.typo).total > 0);
  assert.strictEqual(SR.search(recs, "pert").total, 0); // short: no tolerance
  assert.strictEqual(SR.distance(SFX.typo, SFX.typoTarget), 1);
});
test("search: anchor to a heading, groups in the given order, a limit and \"show more\"", function () {
  const r = SR.search(recs, "mistakes", { groups: ["lab", "pages"] });
  assert.strictEqual(r.groups[0].results[0].anchor, "Common mistakes");
  const g = SR.search(recs, SFX.typoTarget, { groups: ["lab", "pages"], limit: 1 });
  assert.deepStrictEqual(g.groups.map(function (x) { return x.group; }), ["lab", "pages"]);
  assert.strictEqual(g.groups[1].results.length, 1);
  assert.strictEqual(g.groups[1].total, 2);
  assert.strictEqual(SR.search(recs, SFX.typoTarget, { limit: 1, expanded: { pages: true } }).groups.find(function (x) { return x.group === "pages"; }).results.length, 2);
});
test("snippet and highlight: parts with a hit flag, no HTML; highlighting keeps the accented original", function () {
  const s = SR.snippet(SFX.snippet.text, SFX.snippet.query);
  assert.ok(s.some(function (p) { return p.hit && p.text === SFX.snippet.hit; }));
  assert.ok(s.map(function (p) { return p.text; }).join("").indexOf("<b>") !== -1); // text unchanged, for textContent
  [SFX.highlight, SFX.accentedHighlight].forEach(function (h) {
    const parts = SR.highlight(h.text, h.query);
    assert.deepStrictEqual(parts.filter(function (p) { return p.hit; }).map(function (p) { return p.text; }), h.hits);
    assert.strictEqual(parts.map(function (p) { return p.text; }).join(""), h.text);
  });
  assert.deepStrictEqual(SR.highlight("Present Perfect", "perf").filter(function (p) { return p.hit; }).map(function (p) { return p.text; }), ["Perfect"]);
});


console.log("\nExams: counter zones");
const EL = global.LM.examLogic;
test("writingZone: limits 100–150, warning below 80 (<80, 80–99, 100–150, >150)", function () {
  const T = { wordRange: [100, 150], warnBelow: 80 };
  assert.deepStrictEqual([79, 80, 99, 100, 150, 151].map(function (n) { return EL.writingZone(n, T); }), ["low", "warn", "warn", "ok", "ok", "over"]);
});
test("writingZone: limits 200–250, warning below 160 (<160, 160–199, 200–250, >250)", function () {
  const T = { wordRange: [200, 250], warnBelow: 160 };
  assert.deepStrictEqual([159, 160, 199, 200, 250, 251].map(function (n) { return EL.writingZone(n, T); }), ["low", "warn", "warn", "ok", "ok", "over"]);
});

console.log("\nFlashcards: scheduler (vectors in tools/fixtures/scheduler-vectors.json)");
const FH = global.LM.cardsSchedule;
const VEC = JSON.parse(require("fs").readFileSync(path.join(__dirname, "fixtures", "scheduler-vectors.json"), "utf8"));
const CARD_FIELDS = ["state", "step", "ease", "interval", "pendingInterval", "lapses", "reps", "due"];
test("vectors: the config matches the default", function () {
  Object.keys(VEC.config).forEach(function (k) { assert.deepStrictEqual(FH.DEFAULT_CONFIG[k], VEC.config[k], k); });
});
VEC.scenarios.forEach(function (sc) {
  test("schedule: scenario “" + sc.name + "” (" + sc.steps.length + " steps)", function () {
    let card = FH.newCard();
    sc.steps.forEach(function (st, i) {
      const before = JSON.stringify(card);
      const next = FH.schedule(card, st.grade, st.now);
      assert.strictEqual(JSON.stringify(card), before, "step " + (i + 1) + ": the input card was changed");
      CARD_FIELDS.forEach(function (f) { assert.strictEqual(next[f], st.card[f], "krok " + (i + 1) + " (" + st.grade + "): " + f); });
      card = next;
    });
  });
});
test("schedule: numeric ratings 1–4 = again/hard/good/easy, an unknown rating → error", function () {
  const c = FH.newCard();
  ["again", "hard", "good", "easy"].forEach(function (g, i) { assert.deepStrictEqual(FH.schedule(c, i + 1, 1000), FH.schedule(c, g, 1000)); });
  assert.throws(function () { FH.schedule(c, "super", 1000); });
});
test("schedule: ±5% spread only for intervals ≥ 3 d, randomness from outside", function () {
  const rev = { state: "review", step: 0, ease: 2.5, interval: 40, pendingInterval: 0, lapses: 0, reps: 5, due: 0 };
  const base = FH.schedule(rev, "good", 0).interval; // 100
  assert.strictEqual(FH.schedule(rev, "good", 0, null, { fuzz: true, random: function () { return 1; } }).interval, base + 5);
  assert.strictEqual(FH.schedule(rev, "good", 0, null, { fuzz: true, random: function () { return 0; } }).interval, base - 5);
  const grad = FH.schedule(Object.assign(FH.newCard(), { state: "learning", step: 1 }), "good", 0, null, { fuzz: true, random: function () { return 1; } });
  assert.strictEqual(grad.interval, 1); // 1 d < 3 d — no spread
});
test("preview and formatDelay: preview of the dates of the four ratings", function () {
  const pv = FH.preview(FH.newCard(), 0);
  assert.deepStrictEqual(["again", "hard", "good", "easy"].map(function (g) { return FH.formatDelay(pv[g].delay); }), ["1 min", "1 min", "10 min", "4 d"]);
  assert.strictEqual(FH.formatDelay(3 * FH.DAY), "3 d");
  assert.strictEqual(FH.formatDelay(90 * FH.DAY), "3 mo");
});

console.log("\nFlashcards: answer checking, cloze, queue, TSV/CSV, state");
const FL = global.LM.cardsLogic;
test("normalize: lower case, spaces, apostrophes, punctuation at the edges", function () {
  assert.strictEqual(FL.normalize("  Don’t   Give Up!  "), "don't give up");
  assert.strictEqual(FL.normalize("“Come up with”."), "come up with");
  assert.strictEqual(FL.normalize("well-known"), "well-known"); // a hyphen inside stays
});
test("checkAnswer uses LM.exLogic.match: exact / accents / ending / typo / wrong / empty, with suggested ratings", function () {
  const C = FX.cards;
  const t = FL.checkAnswer(C.typo.answer, C.typo.accepted);
  assert.deepStrictEqual([t.result, t.suggested, t.near, t.expected], ["typo", "hard", "typo", C.typo.accepted[0]]);
  const a = FL.checkAnswer(C.accents.answer, C.accents.accepted);
  assert.deepStrictEqual([a.result, a.suggested, a.near, a.lenient], ["accents", "hard", "accents", false]);
  assert.strictEqual(a.expected, C.accents.accepted[1], "the closest accepted answer, as written");
  const l = FL.checkAnswer(C.accents.answer, C.accents.accepted, { lenientAccents: true });
  assert.deepStrictEqual([l.result, l.suggested, l.near, l.lenient], ["exact", "good", "accents", true]);
  assert.deepStrictEqual([FL.checkAnswer(C.ending.answer, C.ending.accepted).result, FL.checkAnswer(C.ending.answer, C.ending.accepted).suggested], ["ending", "again"]);
  assert.strictEqual(FL.checkAnswer(C.wrong.answer, C.wrong.accepted).result, "wrong"); // short: no tolerance
  assert.strictEqual(FL.checkAnswer(C.typo.accepted[0].toUpperCase(), C.typo.accepted).result, "exact");
  assert.strictEqual(FL.checkAnswer("   ", C.wrong.accepted).result, "empty");
});
test("checkAnswer: alternatives a|b, case and apostrophes", function () {
  const alts = FL.parseCloze(FX.cards.alternatives.text).answers;
  assert.strictEqual(FL.checkAnswer(FX.cards.alternatives.answer, alts).result, "exact");
  assert.strictEqual(FL.checkAnswer(alts[0], alts).expected, alts[0]);
  assert.strictEqual(FL.checkAnswer("can't", ["can’t"]).result, "exact");
  assert.strictEqual(FL.levenshtein("kitten", "sitting"), 3);
});
test("cardSpeech: only target-language text is read; a cloze gap is a pause until the answer shows", function () {
  FX.cards.speech.forEach(function (c) {
    assert.strictEqual(FL.cardSpeech(c.card, false), c.front, JSON.stringify(c.card) + " (front)");
    assert.strictEqual(FL.cardSpeech(c.card, true), c.back, JSON.stringify(c.card) + " (back)");
  });
});
test("parseCloze: one gap, alternatives, bad input", function () {
  const c = FL.parseCloze("She {{came up with}} a plan.");
  assert.deepStrictEqual([c.ok, c.before, c.answers, c.after], [true, "She ", ["came up with"], " a plan."]);
  assert.strictEqual(FL.parseCloze("No gap").ok, false);
  assert.strictEqual(FL.parseCloze("{{a}} i {{b}}").ok, false);
  assert.strictEqual(FL.parseCloze("Empty {{a|}} alternative").ok, false);
  assert.strictEqual(FL.parseCloze("Empty {{ }} gap").ok, false);
  assert.strictEqual(FL.parseCloze("Bad {{brace} text").ok, false);
  assert.strictEqual(FL.frontText({ type: "cloze", text: "We've {{run out of}} milk." }), "We've _____ milk.");
});
test("Anki: {{c1::…}} ↔ {{…}}", function () {
  assert.strictEqual(FL.fromAnki("I {{c1::gave up::stop}} it."), "I {{gave up}} it.");
  assert.strictEqual(FL.toAnki("I {{gave up|quit}} it.", "stop"), "I {{c1::gave up::stop}} it.");
});
test("studyDay: the day boundary at 04:00 (local time)", function () {
  assert.strictEqual(FL.studyDay(new Date(2026, 10, 2, 3, 59).getTime()), "2026-11-01");
  assert.strictEqual(FL.studyDay(new Date(2026, 10, 2, 4, 0).getTime()), "2026-11-02");
  assert.strictEqual(FL.dayStart("2026-11-02"), new Date(2026, 10, 2, 4, 0).getTime());
  assert.strictEqual(FL.dayEnd(new Date(2026, 10, 2, 23, 0).getTime()), new Date(2026, 10, 3, 4, 0).getTime());
});
test("buildQueue: order learning → reviews (most overdue first) → new, limits, suspended and buried", function () {
  const now = new Date(2026, 10, 2, 12, 0).getTime(), H = 3600000;
  const cards = [];
  for (let i = 1; i <= 15; i++) cards.push({ id: "t-" + String(i).padStart(3, "0"), deck: "t" });
  const st = {
    "t-001": { state: "review", due: now - 48 * H, interval: 3 }, "t-002": { state: "review", due: now - 2 * H, interval: 3 },
    "t-003": { state: "review", due: now + 10 * H, interval: 3 },            // still today (before 04:00 tomorrow)
    "t-004": { state: "review", due: now + 30 * H, interval: 3 },            // tomorrow — skipped
    "t-005": { state: "learning", due: now - 60000, step: 1 }, "t-006": { state: "relearning", due: now + 5 * 60000 },
    "t-007": { state: "review", due: now - H, suspended: true }, "t-008": { state: "review", due: now - H, buriedUntil: now + H }
  };
  const q = FL.buildQueue({ cards: cards, state: st, now: now, settings: { newPerDay: 3, reviewsPerDay: 100 } });
  assert.deepStrictEqual(q.learning, ["t-005", "t-006"]);
  assert.deepStrictEqual(q.review, ["t-001", "t-002", "t-003"]);
  assert.deepStrictEqual(q.fresh, ["t-009", "t-010", "t-011"]);
  const lim = FL.buildQueue({ cards: cards, state: st, now: now, settings: { newPerDay: 10, reviewsPerDay: 2 }, today: { new: 8, reviews: 1 } });
  assert.deepStrictEqual([lim.review, lim.fresh], [["t-001"], ["t-009", "t-010"]]);
  assert.strictEqual(FL.buildQueue({ cards: cards, state: st, now: now, settings: { newPerDay: 3 }, today: { new: 3 }, extraNew: 5 }).fresh.length, 5);
  const def = FL.buildQueue({ cards: cards, state: {}, now: now });
  assert.strictEqual(def.fresh.length, 10); // 10 new by default
});
test("buildQueue: a \"random\" deck shuffles new cards only within itself", function () {
  const cards = ["a-001", "a-002", "a-003", "b-001", "b-002"].map(function (id) { return { id: id, deck: id.slice(0, 1) }; });
  const q = FL.buildQueue({ cards: cards, state: {}, now: 0, settings: { newPerDay: 10, randomDecks: ["a"] }, random: function () { return 0; } });
  assert.deepStrictEqual(q.fresh, ["a-002", "a-003", "a-001", "b-001", "b-002"]);
});
test("pickNext: learning due now → queue → learning within 20 min", function () {
  const now = 1000000000;
  const st = { L1: { due: now + 5 * 60000 }, L2: { due: now - 1 } };
  assert.deepStrictEqual(FL.pickNext(["L1", "L2"], ["Q1"], st, now), { id: "L2", from: "learning" });
  assert.deepStrictEqual(FL.pickNext(["L1"], ["Q1"], st, now), { id: "Q1", from: "queue" });
  assert.deepStrictEqual(FL.pickNext(["L1"], [], st, now), { id: "L1", from: "ahead" });
  assert.strictEqual(FL.pickNext([], [], st, now), null);
});
test("deckStats: new / learning / mastered (≥ 21 d) / suspended", function () {
  const s = FL.deckStats([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
    { b: { state: "learning", due: 0 }, c: { state: "review", interval: 30, due: 9e15 }, d: { state: "review", interval: 5, due: 0 }, e: { state: "review", suspended: true } }, 1);
  assert.deepStrictEqual([s.new, s.learning, s.mastered, s.review, s.suspended, s.due], [1, 1, 1, 1, 1, 2]);
});
test("parseDelimited: tab / semicolon, RFC 4180 quotes, new lines in a field, accented letters", function () {
  const p = FL.parseDelimited('type;front;back\nbasic;"She is ""20"" now";"I am 20;\nyears"\nbasic;Smörgåsbord;buffet\n');
  assert.strictEqual(p.separator, ";");
  assert.deepStrictEqual(p.rows[1].cells, ["basic", 'She is "20" now', "I am 20;\nyears"]);
  assert.deepStrictEqual(p.rows[2], { line: 4, cells: ["basic", "Smörgåsbord", "buffet"] });
  assert.strictEqual(FL.parseDelimited("a\tb\n").separator, "\t");
});
test("importCards: spec columns, Anki format ({{c1::…}}), rejections with a reason, a limit", function () {
  const r = FL.importCards("type\tfront\tback\thint\texample\tnote\ttags\n" +
    "cloze\tShe {{c1::came up with}} it.\t\tthink of\t\t\tphrasal c1\n" +
    "typed\tthe fridge\tfridge|refrigerator\n" +
    "cloze\tNo gap\n" +
    "cosmos\ta\tb\n" +
    "basic\tAgreed.\tI agree.\n");
  assert.strictEqual(r.cards.length, 3);
  assert.deepStrictEqual(r.cards[0], { type: "cloze", tags: ["phrasal", "c1"], text: "She {{came up with}} it.", hint: "think of" });
  assert.deepStrictEqual(r.cards[1].accepted, ["fridge", "refrigerator"]);
  assert.deepStrictEqual(r.rejected.map(function (x) { return x.line; }), [4, 5]);
  const anki = FL.importCards("I {{c1::gave up}} smoking.\tstop\tphrasal\nAgreed.\tI agree.\t\n");
  assert.deepStrictEqual(anki.cards.map(function (c) { return c.type; }), ["cloze", "basic"]);
  assert.strictEqual(FL.importCards("basic\t" + "x".repeat(501) + "\ty\n").rejected[0].reason.indexOf("500") !== -1, true);
  assert.strictEqual(FL.importCards("basic\ta\tb\nbasic\tc\td\nbasic\te\tf\n", { limit: 2 }).cards.length, 2);
});
test("exportTsv: Anki (front, back, tags), cloze as {{c1::…}}, export → import", function () {
  const cards = [{ type: "cloze", text: "I {{gave up|quit}} it.", hint: "stop", tags: ["a"] }, { type: "basic", front: "She is 20.", back: "I am 20.", note: "Not: I have", tags: [] }];
  const tsv = FL.exportTsv(cards);
  assert.strictEqual(tsv.split("\n")[0], "I {{c1::gave up::stop}} it.\t\ta");
  const back = FL.importCards(tsv);
  assert.deepStrictEqual([back.cards[0].type, back.cards[0].text, back.cards[1].front], ["cloze", "I {{gave up}} it.", "She is 20."]);
});
test("sanitizeState: damaged data, an unknown version, too long fields, trimming daily", function () {
  assert.throws(function () { FL.sanitizeState(null); });
  assert.throws(function () { FL.sanitizeState({ version: 2 }); });
  const daily = {};
  for (let i = 0; i < 410; i++) daily[new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)] = { new: 1, reviews: 2, again: 0, minutes: 3 };
  const s = FL.sanitizeState({
    version: 1,
    cards: { "kolokacje-001": { state: "review", ease: 9, interval: 5, due: 5 }, "bad id!": { state: "review" }, "x-001": { state: "weird" } },
    userDecks: [{ id: "u-1", title: "Mine" }, { id: "bad id", title: "x" }],
    userCards: [{ id: "u-c1", deck: "u-1", type: "basic", front: "a".repeat(800), back: "b" }, { id: "u-c2", deck: "u-1", type: "magia", front: "a", back: "b" }, { id: "u-c3", deck: "u-9", type: "basic", front: "a", back: "b" }],
    settings: { newPerDay: 5, enabledDecks: ["kolokacje", 7], typeAnswerFirst: "yes" },
    daily: daily
  });
  assert.deepStrictEqual(Object.keys(s.cards), ["kolokacje-001"]);
  assert.strictEqual(s.cards["kolokacje-001"].ease, 2.5);
  assert.deepStrictEqual(s.userDecks.map(function (d) { return d.id; }), ["u-1"]);
  assert.deepStrictEqual([s.userCards.length, s.userCards[0].front.length], [1, 500]);
  assert.deepStrictEqual([s.settings.newPerDay, s.settings.enabledDecks, s.settings.typeAnswerFirst], [5, ["kolokacje"], false]);
  assert.strictEqual(Object.keys(s.daily).length, 400);
  assert.strictEqual(Object.keys(s.daily)[0], "2025-01-11");
});

console.log("\nOne-time enabling of exam decks");

console.log("\nTrail: logic");
{
  const SL = global.LM.trailLogic;
  const data = { levels: [
    { level: "A1", land: "Meadow", units: [
      { id: "a1-u1", title: "First sentences", stops: [
        { id: "a1-01", type: "lesson", title: "Introductions", items: ["e_a1_f01"], page: "a1/x", quiz: "quiz-a1-01" },
        { id: "a1-02", type: "lesson", title: "To be", items: ["e_a1_g05", "e_a1_g06"], page: "a1/y", quiz: "quiz-a1-02" },
        { id: "a1-03", type: "lesson", title: "Tenses", items: ["e_a1_g07"], page: "a1/z", set: "a1-set-1" },
        { id: "a1-u1-review", type: "review", title: "Review", from: ["a1-01", "a1-02", "a1-03"], size: 6 }
      ] }
    ] },
    { level: "A2", land: "Forest", units: [
      { id: "a2-u1", title: "Home", stops: [
        { id: "a2-01", type: "lesson", title: "Home", items: ["e_a2_v01"], page: "a2/x", quiz: "quiz-a2-01" },
        { id: "a2-u1-review", type: "review", title: "Review", from: ["a2-01"], size: 6 }
      ] }
    ] },
    { level: "C1", land: "Mountains", units: [
      { id: "c1-u1", title: "Style", stops: [
        { id: "c1-01", type: "lesson", title: "Style", items: ["e_c1_g01"], page: "c1/x" },
        { id: "c1-02", type: "lesson", title: "Register", items: ["e_c1_f01"], page: "c1/y" },
        { id: "c1-u1-review", type: "review", title: "Review", from: ["c1-01", "c1-02"], size: 6 }
      ] }
    ] }
  ] };
  const knownIds = {}, setPct = {};
  const env = { isKnown: function (id) { return knownIds[id] === true; }, setPercent: function (id) { return id in setPct ? setPct[id] : null; } };
  const reset = function () { Object.keys(knownIds).forEach(function (k) { delete knownIds[k]; }); Object.keys(setPct).forEach(function (k) { delete setPct[k]; }); };
  const stopOf = function (id) { let f = null; data.levels.forEach(function (l) { l.units.forEach(function (u) { u.stops.forEach(function (s) { if (s.id === id) f = s; }); }); }); return f; };

  test("trail stopStatus: quiz ≥ 3/4 passes (also after unticking \"I know this\"), 2/4 does not", function () {
    reset();
    const st = SL.emptyState();
    st.stops["a1-01"] = { done: true, via: "quiz", best: 3, at: "2026-11-12" };
    assert.deepStrictEqual(SL.statusOf(stopOf("a1-01"), st, env), { status: "done", via: "quiz" });
    knownIds.e_a1_f01 = true; knownIds.e_a1_f01 = false;                 // "I know this" unticked: the quiz stays
    assert.strictEqual(SL.statusOf(stopOf("a1-01"), st, env).status, "done");
    st.stops["a1-01"].best = 2;
    assert.strictEqual(SL.statusOf(stopOf("a1-01"), st, env).status, "open", "2/4 is too little");
  });
  test("trail stopStatus: all points \"I know this\" pass, unticking takes it back (no quiz)", function () {
    reset();
    const st = SL.emptyState();
    knownIds.e_a1_g05 = true;
    assert.strictEqual(SL.statusOf(stopOf("a1-02"), st, env).status, "open", "only some points");
    knownIds.e_a1_g06 = true;
    assert.deepStrictEqual(SL.statusOf(stopOf("a1-02"), st, env), { status: "done", via: "known" });
    knownIds.e_a1_g06 = false;
    assert.strictEqual(SL.statusOf(stopOf("a1-02"), st, env).status, "open", "unticking takes the pass back");
  });
  test("trail stopStatus: a set ≥ 80% passes only a stop without a quiz; skip = skipped, not passed", function () {
    reset();
    const st = SL.emptyState();
    setPct["a1-set-1"] = 79;
    assert.strictEqual(SL.statusOf(stopOf("a1-03"), st, env).status, "open");
    setPct["a1-set-1"] = 80;
    assert.deepStrictEqual(SL.statusOf(stopOf("a1-03"), st, env), { status: "done", via: "set" });
    const withQuiz = { id: "x", type: "lesson", items: ["e_x"], quiz: "q", set: "a1-set-1" };
    assert.strictEqual(SL.statusOf(withQuiz, st, env).status, "open", "a stop with a quiz does not pass by a set");
    st.stops["a1-02"] = { done: false, via: "skip", at: "2026-11-12" };
    assert.deepStrictEqual(SL.statusOf(stopOf("a1-02"), st, env), { status: "skipped", via: "skip" });
    knownIds.e_a1_g05 = true; knownIds.e_a1_g06 = true;
    assert.strictEqual(SL.statusOf(stopOf("a1-02"), st, env).status, "done", "full \"I know this\" beats skipping");
  });
  test("trail stopStatus: a review passes after an attempt, the score does not block", function () {
    const st = SL.emptyState();
    assert.strictEqual(SL.statusOf(stopOf("a1-u1-review"), st, env).status, "open");
    st.reviews["a1-u1-review"] = { best: 1, of: 6, at: "2026-11-12" };
    assert.strictEqual(SL.statusOf(stopOf("a1-u1-review"), st, env).status, "done");
  });
  test("trail buildTrail: the current stop from the starting point, lands before the start \"skipped\"", function () {
    reset();
    let st = SL.emptyState();
    let tr = SL.buildTrail(data, st, env);
    assert.strictEqual(tr.current.id, "a1-01", "start A1: the first stop");
    knownIds.e_a1_f01 = true;
    tr = SL.buildTrail(data, st, env);
    assert.strictEqual(tr.current.id, "a1-02");
    st = SL.sanitizeState({ version: 1, start: { level: "C1", source: "test", at: "2026-11-12" } });
    tr = SL.buildTrail(data, st, env);
    assert.strictEqual(tr.current.id, "c1-01", "after the C1 test: the first stop of C1 not passed yet");
    const byId = function (id) { return tr.nodes.find(function (n) { return n.id === id; }); };
    assert.deepStrictEqual([byId("a1-02").status, byId("a1-02").via], ["skipped", "start"], "A1 before the start: skipped by the test");
    assert.strictEqual(byId("a1-01").status, "done", "passed before the start stays passed");
    assert.strictEqual(byId("a2-01").status, "skipped");
    assert.strictEqual(byId("c1-02").status, "open");
    assert.strictEqual(byId("a1-u1-review").status, "skipped");
    knownIds.e_c1_g01 = true;
    assert.strictEqual(SL.buildTrail(data, st, env).current.id, "c1-02");
    knownIds.e_c1_f01 = true;
    assert.strictEqual(SL.buildTrail(data, st, env).current, null, "all passed: no current stop");
  });
  test("trail: a skipped stop is not current; land and unit progress count only passed stops", function () {
    reset();
    const st = SL.emptyState();
    st.stops["a1-01"] = { done: false, via: "skip", at: "2026-11-12" };
    knownIds.e_a1_g05 = true; knownIds.e_a1_g06 = true;                  // a1-02 passed
    const tr = SL.buildTrail(data, st, env);
    assert.strictEqual(tr.current.id, "a1-03");
    assert.deepStrictEqual(SL.levelProgress(tr, "A1"), { done: 1, total: 3, percent: 33 });
    assert.deepStrictEqual(SL.levelProgress(tr, "C2"), { done: 0, total: 0, percent: 0 });
    const u = SL.unitProgress(tr, "a1-u1");
    assert.deepStrictEqual([u.done, u.total, u.index, u.count], [1, 3, 1, 1]);
    assert.strictEqual(tr.nodes.find(function (n) { return n.id === "a1-02"; }).number, 2, "stop number within the land");
  });
  test("trail pickReview: questions from the unit quizzes evenly; fallback: sets → final test → no sources", function () {
    const rng = (function () { let x = 7; return function () { x = (x * 16807) % 2147483647; return x / 2147483647; }; })();
    const mk = function (p, n) { return Array.from({ length: n }, function (_, i) { return { id: p + i }; }); };
    const stops = { "a1-01": stopOf("a1-01"), "a1-02": stopOf("a1-02"), "a1-03": stopOf("a1-03") };
    const rev = stopOf("a1-u1-review");
    const quiz = { "a1-01": mk("q1-", 4), "a1-02": mk("q2-", 4), "a1-03": [] };
    let r = SL.pickReview(rev, { stops: stops, quizItems: function (id) { return quiz[id]; }, setItems: function () { return []; }, finalItems: function () { return []; } }, rng);
    assert.strictEqual(r.source, "quiz");
    assert.strictEqual(r.items.length, 6);
    assert.strictEqual(new Set(r.items.map(function (x) { return x.id; })).size, 6, "no repeats");
    assert.strictEqual(r.items.filter(function (x) { return /^q1-/.test(x.id); }).length, 3, "evenly from the stops");
    r = SL.pickReview(rev, { stops: stops, quizItems: function () { return []; }, setItems: function (id) { return mk(id + ":", 10); }, finalItems: function () { return []; } }, rng);
    assert.deepStrictEqual([r.source, r.items.length], ["set", 6], "only the stop with a set gives questions from the set");
    r = SL.pickReview(rev, { stops: {}, quizItems: function () { return []; }, setItems: function () { return []; }, finalItems: function (lvl) { return lvl === "A1" ? mk("f", 30) : []; } }, rng);
    assert.deepStrictEqual([r.source, r.items.length], ["final", 6]);
    r = SL.pickReview(rev, { stops: {}, quizItems: function () { return []; }, setItems: function () { return []; }, finalItems: function () { return []; } }, rng);
    assert.deepStrictEqual([r.source, r.items.length], [null, 0], "no sources: the node is skipped");
    const small = SL.pickReview({ id: "r", type: "review", from: ["a1-01"], size: 6 }, { stops: stops, quizItems: function () { return mk("s", 4); }, setItems: function () { return []; }, finalItems: function () { return []; } }, rng);
    assert.strictEqual(small.items.length, 4, "fewer questions than size: all of them");
  });
  test("trail effectiveStart: manual and test starts win, without a test A1", function () {
    const none = SL.emptyState();
    assert.deepStrictEqual([SL.effectiveStart(none, null).level, SL.effectiveStart(none, null).source], ["A1", "default"]);
    assert.deepStrictEqual([SL.effectiveStart(none, "C1").level, SL.effectiveStart(none, "C1").source], ["C1", "test"]);
    const manual = SL.sanitizeState({ version: 1, start: { level: "B1", source: "manual", at: "2026-11-12" } });
    assert.strictEqual(SL.effectiveStart(manual, "C1").level, "B1");
    const def = SL.sanitizeState({ version: 1, start: { level: "A1", source: "default" } });
    assert.strictEqual(SL.effectiveStart(def, "B2").level, "B2", "the default start gives way to the test result");
  });
  test("trail sanitizeState: bad format and version → exception, junk filtered out, export → import unchanged", function () {
    assert.throws(function () { SL.sanitizeState(null); });
    assert.throws(function () { SL.sanitizeState([]); });
    assert.throws(function () { SL.sanitizeState({ version: 2 }); });
    const s = SL.sanitizeState({
      version: 1,
      start: { level: "Z9", source: "test" },
      stops: { "a1-05": { done: true, via: "quiz", best: 4, at: "2026-11-12T10:00:00Z" }, "BAD ID": { via: "quiz" }, "a1-06": { via: "magic" }, "a1-07": { done: true, via: "skip", best: 99 }, "a1-08": "x" },
      reviews: { "a1-u1-review": { best: 5, of: 6, at: "2026-11-12" }, "a1-u2-review": { best: 9, of: 6 }, "a1-u3-review": {} }
    });
    assert.strictEqual(s.start, null, "unknown start level");
    assert.deepStrictEqual(Object.keys(s.stops).sort(), ["a1-05", "a1-07"]);
    assert.strictEqual(s.stops["a1-05"].best, 4);
    assert.strictEqual(s.stops["a1-07"].done, false, "skip is never \"done\"");
    assert.strictEqual(s.stops["a1-07"].best, undefined, "best out of range rejected");
    assert.deepStrictEqual(Object.keys(s.reviews), ["a1-u1-review"]);
    assert.deepStrictEqual(SL.sanitizeState(JSON.parse(JSON.stringify(s))), s, "export → import unchanged");
    assert.strictEqual(SL.quizAverage(s), 100);
    assert.strictEqual(SL.quizAverage(SL.emptyState()), null);
  });
}

console.log("\nTrail: store slm.trail.<id>, export, import, reset");
{
  require(path.join(__dirname, "..", "js", "trail-store.js"));
  const SS = global.LM.trailStore, SL = global.LM.trailLogic;
  const key = function (pid) { return "slm.trail." + pid; };
  const clean = function () { SS.clearAll(); ["pa", "pb"].forEach(function (p) { global.localStorage.removeItem(key(p)); }); };

  test("trailStore: saved under slm.trail.<id> with version, a quiz keeps the best score, skipping does not overwrite a passed quiz", function () {
    clean();
    activeProfile = "pa";
    assert.strictEqual(SS.recordQuiz("a1-01", 2).done, false);
    assert.strictEqual(SS.recordQuiz("a1-01", 4).done, true);
    assert.strictEqual(SS.recordQuiz("a1-01", 1).best, 4, "a worse attempt does not lower the best");
    assert.strictEqual(SS.skipStop("a1-01"), false, "a stop passed by a quiz cannot be skipped");
    assert.strictEqual(SS.skipStop("a1-02"), true);
    assert.strictEqual(SS.unskipStop("a1-02"), true);
    SS.recordReview("a1-u1-review", 5, 6);
    assert.strictEqual(SS.recordReview("a1-u1-review", 3, 6).best, 5);
    assert.strictEqual(SS.setStart("C1", "test"), true);
    assert.strictEqual(SS.setStart("B1", "manual"), true);
    assert.strictEqual(SS.setStart("C2", "test"), false, "a manual start is not overwritten by the test");
    assert.strictEqual(SS.setStart("C2", "test", true), true, "the \"Start the trail at X\" button forces the start");
    const raw = JSON.parse(global.localStorage.getItem(key("pa")));
    assert.strictEqual(raw.version, 1);
    assert.deepStrictEqual([raw.start.level, raw.stops["a1-01"].best, raw.reviews["a1-u1-review"].of], ["C2", 4, 6]);
    assert.strictEqual(raw.stops["a1-02"], undefined);
    assert.strictEqual(SS.setStart("Z9", "manual"), false);
    activeProfile = "p1";
  });
  test("trailStore: nothing is saved without a profile (temporary state)", function () {
    clean();
    activeProfile = null;
    assert.strictEqual(SS.recordQuiz("a1-01", 4), null);
    assert.strictEqual(SS.skipStop("a1-01"), false);
    assert.strictEqual(SS.recordReview("r", 1, 6), null);
    assert.deepStrictEqual(SS.exportData(), {});
    activeProfile = "p1";
  });
  test("trailStore: export → reset → import restores the data; an old file without the \"trail\" part does not clear the state", function () {
    clean();
    activeProfile = "pa"; SS.recordQuiz("a1-03", 3); SS.setStart("B2", "manual");
    activeProfile = "pb"; SS.recordQuiz("a1-04", 4);
    const exported = JSON.parse(JSON.stringify(SS.exportData()));
    assert.deepStrictEqual(Object.keys(exported).sort(), ["pa", "pb"]);
    // an old export (without the trail part) → parseImport = null, applyImport(null) keeps the data
    assert.strictEqual(SS.parseImport(undefined), null);
    assert.strictEqual(SS.parseImport(null), null);
    SS.applyImport(null, ["pa", "pb"]);
    assert.ok(global.localStorage.getItem(key("pa")), "an old file does not remove the Trail");
    // reset
    SS.clearAll();
    assert.strictEqual(global.localStorage.getItem(key("pa")), null);
    assert.strictEqual(global.localStorage.getItem(key("pb")), null);
    // import from a file: only the profiles from the list
    SS.applyImport(SS.parseImport(exported), ["pa"]);
    assert.ok(global.localStorage.getItem(key("pa")));
    assert.strictEqual(global.localStorage.getItem(key("pb")), null, "a profile not on the list is removed");
    activeProfile = "pa";
    assert.strictEqual(SS.data().stops["a1-03"].best, 3);
    assert.strictEqual(SS.data().start.level, "B2");
    activeProfile = "p1";
  });
  test("trailStore: validation on import (a bad part → exception), a damaged record → a _corrupt_backup copy and an empty state", function () {
    assert.throws(function () { SS.parseImport("text"); });
    assert.throws(function () { SS.parseImport([]); });
    assert.throws(function () { SS.parseImport({ pa: { version: 9 } }); });
    assert.deepStrictEqual(SS.parseImport({}), {});
    clean();
    global.localStorage.setItem(key("pb"), "{niepoprawny json");
    activeProfile = "pb";
    assert.deepStrictEqual(SS.data(), SL.emptyState());
    assert.strictEqual(global.localStorage.getItem(key("pb") + ".corrupt"), "{niepoprawny json");
    global.localStorage.removeItem(key("pb") + ".corrupt");
    activeProfile = "p1";
    clean();
  });
}

console.log("\nFavorite phrases: slm.phrases");
test("slm.phrases: the key in KEYS, the star toggles per profile and saves in localStorage", function () {
  assert.strictEqual(PD.KEYS.phrases, "slm.phrases");
  freshPD();
  assert.deepStrictEqual(PD.starredPhrases(), []);
  assert.strictEqual(PD.togglePhraseStar("opinia-05"), true);
  assert.strictEqual(PD.togglePhraseStar("kontrargument-01"), true);
  assert.deepStrictEqual(PD.starredPhrases(), ["opinia-05", "kontrargument-01"]);
  assert.strictEqual(PD.togglePhraseStar("opinia-05"), false);
  assert.deepStrictEqual(PD.starredPhrases(), ["kontrargument-01"]);
  assert.strictEqual(PD.togglePhraseStar("Bad ID!"), false); // an invalid id is rejected
  assert.deepStrictEqual(JSON.parse(global.localStorage.getItem("slm.phrases")).profiles.p1.starred, ["kontrargument-01"]);
  activeProfile = "p2";
  assert.deepStrictEqual(PD.starredPhrases(), []); // another profile has its own favorites
  activeProfile = "p1";
});
test("slm.phrases: export, import (filtering junk and duplicates), deleting a profile and reset", function () {
  freshPD();
  PD.togglePhraseStar("opinia-01");
  const exp = JSON.parse(JSON.stringify(LEARN.exportData()));
  assert.deepStrictEqual(exp.phrases.profiles.p1.starred, ["opinia-01"]);
  const parsed = LEARN.parseImport({ phrases: { version: 1, profiles: { p1: { starred: ["a-01", "a-01", "BAD ID", 5, "b-02"] } } } });
  assert.deepStrictEqual(parsed.phrases.profiles.p1.starred, ["a-01", "b-02"]);
  assert.throws(function () { LEARN.parseImport({ phrases: { version: 99, profiles: {} } }); }, /Unsupported data version/);
  LEARN.applyImport(parsed, ["p1"]);
  assert.deepStrictEqual(PD.starredPhrases(), ["a-01", "b-02"]);
  // an old file without the key: the data of this browser stays
  const old = JSON.parse(JSON.stringify(LEARN.exportData()));
  delete old.phrases;
  LEARN.applyImport(LEARN.parseImport(old), ["p1"]);
  assert.deepStrictEqual(PD.starredPhrases(), ["a-01", "b-02"]);
  LEARN.applyImport(LEARN.parseImport(old), ["inny"]);
  assert.deepStrictEqual(PD.starredPhrases(), []);
  PD.togglePhraseStar("c-03");
  LEARN.clearAll();
  assert.deepStrictEqual(PD.starredPhrases(), []);
  assert.strictEqual(global.localStorage.getItem("slm.phrases"), null);
});

console.log("\nSpeaking trainer: seen in slm.speaking");
test("slm.speaking: an old record without seen works, seen is optional, tolerant and in export/import/reset", function () {
  freshPD();
  // an old record (sessions only) normalizes as before, without the seen field
  const old = LEARN.parseImport({ speaking: { version: 1, profiles: { p1: { sessions: [{ day: "2026-01-02", exam: "exam-b2", part: 1, scores: { gv: 4 } }] } } } });
  assert.deepStrictEqual(old.speaking.profiles.p1, { sessions: [{ day: "2026-01-02", exam: "exam-b2", part: 1, scores: { gv: 4 } }] });
  LEARN.applyImport(old, ["p1"]);
  assert.deepStrictEqual(PD.speakingSeen("exam-b2:1"), []);
  assert.strictEqual(PD.markSpeakingSeen("exam-b2:1", "p1-dom"), true);
  assert.strictEqual(PD.markSpeakingSeen("exam-b2:1", "p1-dom"), true); // no duplicates
  assert.strictEqual(PD.markSpeakingSeen("exam-b2:1", "p1-praca"), true);
  assert.strictEqual(PD.markSpeakingSeen("bad key", "x"), false);
  assert.strictEqual(PD.markSpeakingSeen("exam-b2:1", "Bad ID"), false);
  assert.deepStrictEqual(PD.speakingSeen("exam-b2:1"), ["p1-dom", "p1-praca"]);
  assert.strictEqual(PD.speakingSessions("exam-b2").length, 1); // sessions untouched
  const exp = JSON.parse(JSON.stringify(LEARN.exportData()));
  assert.deepStrictEqual(exp.speaking.profiles.p1.seen, { "exam-b2:1": ["p1-dom", "p1-praca"] });
  // import filters out junk
  const parsed = LEARN.parseImport({ speaking: { version: 1, profiles: { p1: { sessions: [], seen: { "a:1": ["x-1", "x-1", "BAD ID", 5], "bad": ["x"], "b:2": "not a list" } } } } });
  assert.deepStrictEqual(parsed.speaking.profiles.p1.seen, { "a:1": ["x-1"] });
  // a session of the "Full exam" mode keeps full
  const full = PD.addSpeakingSession({ exam: "exam-demo", part: 1, scores: { communication: 4 }, full: true });
  assert.strictEqual(full.full, true);
  assert.strictEqual(PD.addSpeakingSession({ exam: "exam-demo", part: 2, scores: { range: 3 } }).full, undefined);
  // clearing the cycle
  assert.strictEqual(PD.markSpeakingSeen("exam-b2:1", null), true);
  assert.deepStrictEqual(PD.speakingSeen("exam-b2:1"), []);
  PD.markSpeakingSeen("exam-b2:2", "p2-x");
  LEARN.clearAll();
  assert.strictEqual(global.localStorage.getItem("slm.speaking"), null);
});

console.log("\nExams from card tags");
test("examsOf: codes from the exam registry (no hard-coded exams), registry order, no repeats, any case", function () {
  const saved = global.LM.EXAM_REGISTRY;
  global.LM.EXAM_REGISTRY = { exams: [{ id: "x-dele", code: "DELE", label: "DELE B1" }, { id: "x-siele", code: "SIELE", label: "SIELE" }] };
  const codes = function (tags) { return FL.examsOf({ tags: tags }).map(function (e) { return e.code; }); };
  assert.deepStrictEqual(codes(["vocabulary", "siele", "DELE", "dele"]), ["dele", "siele"]);
  assert.deepStrictEqual(FL.examList()[0], { code: "dele", short: "DELE", name: "DELE B1" });
  assert.deepStrictEqual(codes(["e8", "matura"]), [], "the reference app's Polish exam codes are gone");
  assert.deepStrictEqual(FL.examsOf({}), []);
  assert.deepStrictEqual(FL.examsOf(null), []);
  global.LM.EXAM_REGISTRY = { exams: [] };
  assert.deepStrictEqual(codes(["dele"]), [], "empty registry: no exam chips");
  global.LM.EXAM_REGISTRY = saved;
});

console.log("\nMy words");
test("wordFromSelection: 1–6 words and up to 60 characters, punctuation at the edges and {}| removed, no letters → empty", function () {
  assert.strictEqual(FL.wordFromSelection("  commute, "), "commute");
  assert.strictEqual(FL.wordFromSelection("“come up with”."), "come up with");
  assert.strictEqual(FL.wordFromSelection("a b c d e f"), "a b c d e f");
  assert.strictEqual(FL.wordFromSelection("a b c d e f g"), "");
  assert.strictEqual(FL.wordFromSelection("x".repeat(61)), "");
  assert.strictEqual(FL.wordFromSelection("x".repeat(60)), "x".repeat(60));
  assert.strictEqual(FL.wordFromSelection("{{up}}|down"), "up down");
  assert.strictEqual(FL.wordFromSelection("123 ... 45"), "");
  assert.strictEqual(FL.wordFromSelection("don’t"), "don’t");
  assert.strictEqual(FL.wordFromSelection(""), "");
});
test("isTarget (LM.lang) decides where \"Add to My words\" is offered when there is no lang attribute", function () {
  FX.isTarget.target.forEach(function (s) { assert.ok(FL.isTarget(s), s); });
  FX.isTarget.native.concat(["", null]).forEach(function (s) { assert.ok(!FL.isTarget(s), String(s)); });
});
test("splitSentences / extractSentence: abbreviations of the language, opening marks of the language, numbers 3.5, quotes, initials", function () {
  const S = FX.sentences;
  assert.strictEqual(FL.splitSentences(S.text).length, S.count);
  S.cases.forEach(function (c) { assert.strictEqual(FL.extractSentence(S.text, c[0]), c[1], c[0]); });
  const t = "Brown works hard on Sundays. He earns 3.5 thousand pounds. “Really?” she asked. J. K. Rowling wrote it.";
  assert.strictEqual(FL.extractSentence(t, "thousand"), "He earns 3.5 thousand pounds.");
  assert.strictEqual(FL.extractSentence(t, "asked"), "“Really?” she asked.");
  assert.strictEqual(FL.extractSentence(t, "Rowling"), "J. K. Rowling wrote it.");
});
test("makeCloze and wordFromSelection around diacritics and inner hyphens", function () {
  FX.cloze.forEach(function (c) { assert.strictEqual(FL.makeCloze(c[0], c[1]), c[2], c[0] + " / " + c[1]); });
  FX.selection.forEach(function (c) { assert.strictEqual(FL.wordFromSelection(c[0]), c[1], c[0]); });
});
test("extractSentence: a table cell and a single sentence, case and spaces, no selection in the text", function () {
  assert.strictEqual(FL.extractSentence("  Commute   to work.  ", "COMMUTE"), "Commute to work.");
  assert.strictEqual(FL.extractSentence("I'm waiting for a bus", "bus"), "I'm waiting for a bus");
  assert.strictEqual(FL.extractSentence("First one. Second one.", "nic"), "First one.");
  assert.strictEqual(FL.extractSentence("", "x"), "");
  assert.strictEqual(FL.extractSentence("She said it’s fine. It is not.", "it's fine"), "She said it’s fine."); // typographic apostrophes
});
test("extractSentence: a sentence longer than 220 characters → a window around the word with “…” on both sides (≤ 220)", function () {
  const mid = ("Many people think that this long sentence goes on and on " .repeat(6)) + "but the commute to work takes ages " + ("and it never seems to end for anybody " .repeat(6)) + "really.";
  const s = FL.extractSentence(mid, "commute");
  assert.ok(s.length <= 220, "length " + s.length);
  assert.ok(/^…/.test(s) && /…$/.test(s), s);
  assert.ok(s.indexOf("commute") !== -1);
  assert.ok(!/…\S/.test(s.slice(1)) && !/\S…/.test(s.slice(0, -1)), "does not cut words: " + s);
  // a word at the start and at the end of a long sentence — "…" on one side only
  const head = "Commute " + "word ".repeat(60) + "end.";
  const hs = FL.extractSentence(head, "Commute");
  assert.ok(hs.length <= 220 && !/^…/.test(hs) && /…$/.test(hs), hs);
  const tail = "word ".repeat(60) + "commute end.";
  const ts = FL.extractSentence(tail, "commute");
  assert.ok(ts.length <= 220 && /^…/.test(ts) && !/…$/.test(ts), ts);
});
test("makeCloze: the first occurrence, case from the text, word boundaries, no occurrence → null", function () {
  assert.strictEqual(FL.makeCloze("Most people commute to work. Some commute far.", "commute"), "Most people {{commute}} to work. Some commute far.");
  assert.strictEqual(FL.makeCloze("Commuting is tiring, but Commute is a word.", "commute"), "Commuting is tiring, but {{Commute}} is a word."); // "Commuting" is not "commute"
  assert.strictEqual(FL.makeCloze("She came up with a plan.", "come up with"), null);
  assert.strictEqual(FL.makeCloze("She came up   with a plan.", "came up with"), "She {{came up   with}} a plan.");
  assert.strictEqual(FL.makeCloze("It’s a deal.", "it's"), "{{It’s}} a deal.");
  assert.strictEqual(FL.makeCloze("The cat sat.", "dog"), null);
  assert.strictEqual(FL.makeCloze("Use {{braces}} here.", "braces"), "Use {{braces}} here."); // braces from the sentence removed and the gap put in
  assert.strictEqual(FL.parseCloze(FL.makeCloze("Most people commute to work.", "commute")).ok, true);
  assert.strictEqual(FL.makeCloze("Cost: 5% (really)", "(really)"), "Cost: 5% {{(really)}}"); // regex special characters are escaped
});
test("wordKey: dedup by normalize (case, spaces, apostrophes)", function () {
  assert.strictEqual(FL.wordKey(" Commute. "), FL.wordKey("commute"));
  assert.strictEqual(FL.wordKey("Don’t"), FL.wordKey("don't"));
  assert.notStrictEqual(FL.wordKey("commute"), FL.wordKey("commuter"));
});
test("makeWordCard: cloze from the sentence; basic without an occurrence; without a sentence; too many words → error; fields word/source/addedAt", function () {
  const a = FL.makeWordCard({ selection: "commute", sentence: "Most people commute to work by train.", source: { route: "#/b1/vocabulary", title: "Vocabulary B1" }, day: "2026-11-03" });
  assert.deepStrictEqual([a.card.type, a.card.text, a.card.word, a.card.addedAt, a.card.source.route], ["cloze", "Most people {{commute}} to work by train.", "commute", "2026-11-03", "#/b1/vocabulary"]);
  const withHint = FL.makeWordCard({ selection: "commute", sentence: "Most people commute to work.", hint: "travel to work" });
  assert.strictEqual(withHint.card.hint, "travel to work");
  const basic = FL.makeWordCard({ selection: "came up with", sentence: "She thought of a plan." });
  assert.deepStrictEqual([basic.card.type, basic.card.front, basic.card.back], ["basic", "came up with", "She thought of a plan."]);
  const none = FL.makeWordCard({ selection: "ephemeral", sentence: "" });
  assert.deepStrictEqual([none.card.type, none.card.front, none.card.back], ["basic", "ephemeral", "—"]);
  assert.ok(FL.makeWordCard({ selection: "a b c d e f g", sentence: "x" }).error);
  assert.ok(FL.makeWordCard({ selection: "", sentence: "x" }).error);
  const bad = FL.makeWordCard({ selection: "x", sentence: "x y", source: { route: "javascript:alert(1)", title: "T" }, day: "tomorrow" });
  assert.deepStrictEqual([bad.card.source, bad.card.addedAt], [{ title: "T" }, undefined]);
});
test("sanitizeState: new card fields (word, source, addedAt, examples) on save and import, the system deck \"words\", an old file without the fields", function () {
  const s = FL.sanitizeState({ version: 1, cards: {}, userDecks: [{ id: "u-moje-slowa", title: "My words", system: "words" }, { id: "u-moje-bledy", title: "My mistakes", system: "mistakes" }, { id: "u-x", title: "X", system: "other" }], userCards: [
    { id: "u-w1", deck: "u-moje-slowa", type: "cloze", text: "Most people {{commute}} to work.", hint: "travel", word: "commute".padEnd(80, "x"), source: { route: "#/b1/vocabulary", title: "T".repeat(200) }, addedAt: "2026-11-03", examples: ["a", "  b  ", "", 7, "c", "d", "e".repeat(300)] },
    { id: "u-w2", deck: "u-moje-slowa", type: "basic", front: "x", back: "y", word: 5, source: { route: "http://bad.example", title: "" }, addedAt: "2026-13-40", examples: "not an array" },
    { id: "u-w3", deck: "u-x", type: "basic", front: "old", back: "card" }
  ], settings: {}, daily: {} });
  assert.deepStrictEqual(s.userDecks.map(function (d) { return d.system || null; }), ["words", "mistakes", null]);
  const [w1, w2, w3] = s.userCards;
  assert.strictEqual(w1.word.length, 60);
  assert.deepStrictEqual([w1.source.route, w1.source.title.length, w1.addedAt], ["#/b1/vocabulary", 120, "2026-11-03"]);
  assert.deepStrictEqual(w1.examples, ["a", "b", "c"]); // at most 3, empty and non-text ones rejected
  assert.deepStrictEqual([w2.word, w2.source, w2.addedAt, w2.examples], [undefined, undefined, undefined, undefined]);
  assert.deepStrictEqual(Object.keys(w3).sort(), ["back", "deck", "front", "id", "tags", "type"]); // an old card without the new fields
  assert.strictEqual(FL.sanitizeWordFields({ examples: ["e".repeat(300)] }).examples[0].length, 220);
  // save → read → the same fields (round trip through JSON)
  assert.deepStrictEqual(FL.sanitizeState(JSON.parse(JSON.stringify(s))).userCards[0], w1);
});
test("exportWordsCsv: word; meaning; sentence; source, quotes and semicolons in fields", function () {
  const csv = FL.exportWordsCsv([
    { type: "cloze", text: "Most people {{commute}} to work; by train.", hint: "travel", word: "commute", source: { route: "#/b1/vocabulary", title: "Vocabulary B1" } },
    { type: "basic", front: "ephemeral", back: "He said \"hi\"." }
  ]).split("\n");
  assert.strictEqual(csv[0], "word;meaning;sentence;source");
  assert.strictEqual(csv[1], 'commute;travel;"Most people commute to work; by train.";Vocabulary B1 (#/b1/vocabulary)');
  assert.strictEqual(csv[2], 'ephemeral;;"He said ""hi"".";');
});

test("examBoxAnchor: exam boxes before \"Common mistakes\" on the example topic page, and edge cases", function () {
  const fs = require("fs");
  const EL = global.LM.examLogic;
  const t = fs.readFileSync(path.join(__dirname, "..", "content", "pages", "a1", "verbs-gustar.md"), "utf8").split(/\r?\n/)
    .filter(function (l) { return /^## /.test(l); }).map(function (l) { return l.slice(3).trim(); });
  const i = EL.examBoxAnchorIndex(t);
  assert.strictEqual(t[i], "Common mistakes");
  assert.ok(i > 0, "boxes after the explanation, not at the start");
  assert.strictEqual(EL.examBoxAnchorIndex(["How it works", "Real life vs exam", "Common mistakes"]), 1);
  assert.strictEqual(EL.examBoxAnchorIndex(["How it works", "Examples", "Answers"]), 2);
  assert.strictEqual(EL.examBoxAnchorIndex(["How it works", "Examples"]), -1);
});

test("countWords: white space, symbols, opening and placeholder words", function () {
  const EL = global.LM.examLogic;
  FX.examCountWords.forEach(function (c) { assert.strictEqual(EL.countWords(c.text, c.opening || "", c.placeholders), c.n, c.text); });
  assert.strictEqual(EL.countWords("  "), 0);
});

test("myExams: date, set, unpinned, pinned, a date in the past", function () {
  const EL = global.LM.examLogic;
  const registry = { exams: [
    { id: "e8", status: "active", setIds: ["e8-1", "e8-2"] },
    { id: "mp", status: "active", setIds: ["mp-1"] },
    { id: "mr", status: "active", setIds: [] },
    { id: "soon", status: "soon", setIds: [] },
    { id: "c1", status: "active", setIds: ["c1-a", "c1-b"] }
  ] };
  const today = "2026-10-30";
  function run(input) { return EL.myExams(EL.examMyState(Object.assign({ registry: registry, examsRecord: { exams: {} }, isSetDone: function () { return false; } }, input)), registry, today); }
  assert.deepStrictEqual(run({}), [], "without data nothing is mine");
  // data
  assert.deepStrictEqual(run({ examsRecord: { exams: { mp: { examDate: "2027-05-06" } } } }), [{ id: "mp", reason: "date", days: 188 }]);
  // set
  assert.deepStrictEqual(run({ isSetDone: function (id) { return id === "e8-2"; } }), [{ id: "e8", reason: "sets", days: null }]);
  // unpinned by hand (a date and a set are not enough)
  assert.deepStrictEqual(run({ examsRecord: { exams: { mp: { examDate: "2027-05-06" } }, my: { mp: "hidden" } } }), []);
  // pinned without a date and sets; a "soon" exam never
  assert.deepStrictEqual(run({ examsRecord: { exams: {}, my: { mr: "pinned", soon: "pinned" } } }), [{ id: "mr", reason: "pinned", days: null }]);
  // a date in the past: still mine, after the future ones, before exams without a date
  const mixed = run({
    examsRecord: { exams: { e8: { examDate: "2026-10-27" }, mp: { examDate: "2027-05-06" }, c1: { examDate: "2027-01-10" } }, my: { mr: "pinned" } }
  });
  assert.deepStrictEqual(mixed.map(function (x) { return x.id; }), ["c1", "mp", "e8", "mr"]);
  assert.strictEqual(mixed[2].days, -3);
  // every exam the same way: date in slm.exams or a done set
  assert.deepStrictEqual(run({ examsRecord: { exams: { c1: { examDate: "2026-10-31" } } } }), [{ id: "c1", reason: "date", days: 1 }]);
  assert.deepStrictEqual(run({ isSetDone: function (id) { return id === "c1-b"; } }), [{ id: "c1", reason: "sets", days: null }]);
});

test("formatDateLong and daysBetween", function () {
  const EL = global.LM.examLogic;
  assert.strictEqual(EL.formatDateLong("2027-05-06"), "Thursday, May 6, 2027");
  assert.strictEqual(EL.formatDateLong("2027-05-12"), "Wednesday, May 12, 2027");
  assert.strictEqual(EL.formatDateLong("bad"), "");
  assert.strictEqual(EL.daysBetween("2026-11-01", "2026-10-30"), 2);
  assert.strictEqual(EL.daysBetween("2026-10-29", "2026-10-30"), -1);
});

test("navSplit: only mine + the rest in \"+N\", the current exam stays, none mine = all", function () {
  const EL = global.LM.examLogic;
  const reg = { exams: [{ id: "e8" }, { id: "mp" }, { id: "mr" }, { id: "b2" }, { id: "c1" }] };
  assert.deepStrictEqual(EL.navSplit(reg, ["c1", "mp"]), { shown: ["c1", "mp"], hidden: ["e8", "mr", "b2"] });
  assert.deepStrictEqual(EL.navSplit(reg, ["c1"], "b2"), { shown: ["c1", "b2"], hidden: ["e8", "mp", "mr"] });
  assert.deepStrictEqual(EL.navSplit(reg, ["c1"], "c1").shown, ["c1"]);
  assert.deepStrictEqual(EL.navSplit(reg, []), { shown: ["e8", "mp", "mr", "b2", "c1"], hidden: [] });
  assert.strictEqual(EL.navSplit(reg, ["x"]).hidden.length, 5);
});

console.log("\nReview: migration of the Mistake log to \"My mistakes\" cards");
(function () {
  const FLg = global.LM.cardsLogic;
  const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime(); // Nov 10, 2026, noon
  const entry = function (id, review, extra) { return Object.assign({ id: id, createdAt: "2026-11-01", context: "She ___ to school.", myAnswer: "go", correct: "goes", rule: "3rd person: -s", source: "", category: "Grammar", itemId: "", ref: "", review: review }, extra || {}); };
  const entries = [
    entry("err-s0", { stage: 0, due: "2026-11-11", mastered: false }),
    entry("err-s1", { stage: 1, due: "2026-11-12", mastered: false }),
    entry("err-s2", { stage: 2, due: "2026-11-17", mastered: false }, { context: "Which tense?\nA sentence without a gap" }),
    entry("err-m", { stage: 2, due: "2026-10-01", mastered: true }),
    entry("err-late", { stage: 1, due: "2026-11-05", mastered: false })
  ];
  const fresh = function () { return FLg.sanitizeState(FLg.emptyState()); };

  test("sanitizeState: a bad ex: key is rejected", function () {
    const st = fresh();
    st.cards["ex:../bad"] = FLg.newJournalState(NOW);
    st.cards["ex:"] = FLg.newJournalState(NOW);
    assert.deepStrictEqual(Object.keys(FLg.sanitizeState(JSON.parse(JSON.stringify(st))).cards), []);
  });
  test("a new entry: a card at once, the first review tomorrow", function () {
    const s = FLg.newJournalState(NOW);
    assert.strictEqual(s.state, "review");
    assert.strictEqual(s.interval, 1);
    assert.strictEqual(s.due, FLg.dayEnd(NOW));
  });
})();

console.log("\nReview: the Flashcards and mistakes queue");
require(path.join(__dirname, "..", "js", "review-queue.js"));
(function () {
  const R = global.LM.reviewQueue;
  const FLg = global.LM.cardsLogic;
  const HM = global.LM.cardsSchedule;
  const DAYMS = 86400000;
  const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime(); // 10.11.2026, 12:00
  const at = function (d, h, m) { return new Date(2026, 10, d, h, m || 0, 0).getTime(); };
  const rev = function (due, interval) { return Object.assign(HM.newCard(), { state: "review", interval: interval || 3, due: due, reps: 2 }); };

  // decks: d1 (4 cards), d2 (3 cards), "My mistakes" (3 user cards)
  function makeCtx(over) {
    const st = FLg.sanitizeState(FLg.emptyState());
    st.settings.enabledDecks = ["d1", "d2"];
    const userCards = ["u-mb-1", "u-mb-2", "u-mb-3"].map(function (id) { return { id: id, deck: "u-moje-bledy", type: "basic", front: "a", back: "b", tags: [] }; });
    st.userDecks.push({ id: "u-moje-bledy", title: "My mistakes", system: "mistakes" });
    st.userCards = userCards;
    const decks = [{ id: "d1", count: 4 }, { id: "d2", count: 3 }, { id: "u-moje-bledy", count: 3 }];
    const cards = { d1: [1, 2, 3, 4].map(function (i) { return { id: "d1-00" + i, deck: "d1" }; }), d2: [1, 2, 3].map(function (i) { return { id: "d2-00" + i, deck: "d2" }; }), "u-moje-bledy": userCards };
    const ctx = Object.assign({
      state: st, decks: decks, weak: [],
      cardsOf: function (id) { return cards[id] || []; },
      deckOf: function (id) { return /^u-mb/.test(id) ? "u-moje-bledy" : id.replace(/-\d{3}$/, ""); }
    }, over || {});
    return ctx;
  }
  const ids = function (q) { return q.map(function (x) { return x.id; }); };

  test("queue: empty when there are no cards to do (new limit 0)", function () {
    const ctx = makeCtx();
    ctx.state.settings.newPerDay = 0;
    assert.deepStrictEqual(R.queueFrom(ctx, NOW), []);
    const zero = R.summaryFrom(ctx, NOW);
    assert.deepStrictEqual([zero.card, zero.mistake, zero.exercise, zero.total, zero.due.total, zero.fresh.total], [0, 0, 0, 0, 0, 0]);
  });
  test("queue: the oldest overdue first, new at the end, kinds: card / mistake / exercise", function () {
    const ctx = makeCtx({ weak: [{ id: "a1-x-1", topic: "t1" }] });
    ctx.state.settings.newPerDay = 2;
    ctx.state.cards["d1-001"] = rev(at(9, 5));            // a day overdue
    ctx.state.cards["u-mb-1"] = rev(at(5, 5));            // the oldest
    ctx.state.cards["ex:a1-x-2"] = rev(at(8, 5));         // exercise
    ctx.state.cards["d2-001"] = rev(at(10, 5));           // this morning
    ctx.state.cards["d2-002"] = rev(at(12, 5));           // the day after tomorrow: outside the day
    const q = R.queueFrom(ctx, NOW);
    assert.strictEqual(q[0].id, "u-mb-1", "the oldest overdue first");
    assert.strictEqual(ids(q).indexOf("d2-002"), -1);
    assert.deepStrictEqual(q.slice(0, 4).map(function (x) { return x.kind; }).sort(), ["card", "card", "exercise", "mistake"]);
    assert.ok(q.slice(4).every(function (x) { return x.due === 0; }), "new at the end");
    assert.strictEqual(q.length, 6, "4 overdue + 2 new (limit)");
  });
  test("queue: interleaving — at most 2 of the same kind and not the same topic in a row", function () {
    const items = [];
    for (let i = 0; i < 4; i++) items.push({ kind: "card", id: "c" + i, due: i, topic: "d1" });
    for (let i = 0; i < 3; i++) items.push({ kind: "mistake", id: "m" + i, due: 10 + i, topic: "u-moje-bledy" });
    items.push({ kind: "exercise", id: "e0", due: 20, topic: "t1" }, { kind: "card", id: "c9", due: 21, topic: "d2" });
    const out = R.interleave(items);
    assert.strictEqual(out.length, items.length);
    for (let i = 1; i < out.length; i++) assert.notStrictEqual(out[i].topic, out[i - 1].topic, "same topic in a row at " + i);
    for (let i = 2; i < out.length; i++) assert.ok(!(out[i].kind === out[i - 1].kind && out[i].kind === out[i - 2].kind), "a third of a kind in a row at " + i);
  });
  test("queue: the daily review limit is shared by cards, mistakes and exercises (the oldest stay)", function () {
    const ctx = makeCtx();
    ctx.state.settings.reviewsPerDay = 3;
    ctx.state.settings.newPerDay = 0;
    ctx.state.cards["d1-001"] = rev(at(9, 5));
    ctx.state.cards["d1-002"] = rev(at(8, 5));
    ctx.state.cards["u-mb-1"] = rev(at(7, 5));
    ctx.state.cards["ex:a1-x-9"] = rev(at(6, 5));
    ctx.state.cards["d2-001"] = rev(at(5, 5));
    const q = R.queueFrom(ctx, NOW);
    assert.deepStrictEqual(ids(q).sort(), ["d2-001", "ex:a1-x-9", "u-mb-1"].sort());
    ctx.state.daily["2026-11-10"] = { new: 0, reviews: 2, again: 0, good: 0, answers: 2, minutes: 0 };
    assert.strictEqual(R.queueFrom(ctx, NOW).length, 1);
  });
  test("queue: a limit of 10 new a day, of them at most 3 new weak-spot exercises", function () {
    const weak = [1, 2, 3, 4, 5].map(function (i) { return { id: "w-" + i, topic: "t" + i }; });
    const ctx = makeCtx({ weak: weak });
    let q = R.queueFrom(ctx, NOW);
    assert.strictEqual(q.filter(function (x) { return x.kind === "exercise"; }).length, 3);
    assert.strictEqual(q.length, 10, "10 new: 7 cards and 3 exercises");
    assert.strictEqual(q[q.length - 1].kind === "exercise" || q[q.length - 2].kind === "exercise", true);
    ctx.state.daily["2026-11-10"] = { new: 2, reviews: 0, again: 0, good: 0, answers: 2, minutes: 0, exNew: 2 };
    q = R.queueFrom(ctx, NOW);
    assert.strictEqual(q.filter(function (x) { return x.kind === "exercise"; }).length, 1, "3 − 2 = 1 left");
    assert.strictEqual(q.length, 8, "new limit 10 − 2 done");
  });
  test("queue: the 04:00 day boundary — a card due after midnight but before 04:00 belongs to today's study day", function () {
    const ctx = makeCtx();
    ctx.state.settings.newPerDay = 0;
    ctx.state.cards["d1-001"] = rev(at(11, 2, 0));   // tomorrow 02:00
    ctx.state.cards["d1-002"] = rev(at(11, 5, 0));   // tomorrow 05:00
    assert.deepStrictEqual(ids(R.queueFrom(ctx, at(10, 23, 0))), ["d1-001"]);
    assert.deepStrictEqual(ids(R.queueFrom(ctx, at(11, 1, 0))), ["d1-001"], "01:00 is still the study day of Nov 10");
    assert.deepStrictEqual(ids(R.queueFrom(ctx, at(11, 6, 0))).sort(), ["d1-001", "d1-002"], "after 04:00 both are for today (end of the study day Nov 12, 04:00)");
  });
  test("queue: a disabled deck is skipped, \"My mistakes\" always in the queue, suspended and buried skipped", function () {
    const ctx = makeCtx();
    ctx.state.settings.newPerDay = 0;
    ctx.state.settings.enabledDecks = ["d1"];
    ctx.state.cards["d2-001"] = rev(at(9, 5));
    ctx.state.cards["u-mb-2"] = rev(at(9, 5));
    ctx.state.cards["d1-001"] = Object.assign(rev(at(9, 5)), { suspended: true });
    ctx.state.cards["d1-002"] = Object.assign(rev(at(9, 5)), { buriedUntil: NOW + 3600000 });
    assert.deepStrictEqual(ids(R.queueFrom(ctx, NOW)), ["u-mb-2"]);
  });
  test("count / breakdown (summaryFrom) agree with the length and kinds of the queue", function () {
    const ctx = makeCtx({ weak: [{ id: "w1", topic: "t1" }, { id: "w2", topic: "t2" }] });
    ctx.state.settings.newPerDay = 5;
    ctx.state.cards["d1-001"] = rev(at(9, 5));
    ctx.state.cards["d2-001"] = Object.assign(HM.newCard(), { state: "learning", due: NOW - 1000 });
    ctx.state.cards["u-mb-1"] = rev(at(8, 5));
    ctx.state.cards["ex:old-1"] = rev(at(7, 5));
    const q = R.queueFrom(ctx, NOW), s = R.summaryFrom(ctx, NOW);
    assert.strictEqual(s.total, q.length);
    ["card", "mistake", "exercise"].forEach(function (k) { assert.strictEqual(s[k], q.filter(function (x) { return x.kind === k; }).length, k); });
  });
  test("P3: new cards are not \"due\" — a fresh profile: 0 due, 10 new; overdue apart", function () {
    const ctx = makeCtx();
    ctx.state.settings.newPerDay = 10;
    const fresh = R.summaryFrom(ctx, NOW);
    assert.deepStrictEqual([fresh.due.total, fresh.fresh.total, fresh.total], [0, 10, 10], "fresh profile");
    ctx.state.cards["d1-001"] = rev(at(9, 5));                                                    // review, due yesterday
    ctx.state.cards["d2-001"] = Object.assign(HM.newCard(), { state: "learning", due: NOW - 1000 }); // learning, the due time has passed
    ctx.state.cards["u-mb-1"] = rev(at(8, 5));                                                    // an overdue mistake
    ctx.state.cards["d1-002"] = rev(at(20, 5), 8);                                                // review in 10 days: neither overdue nor new
    const s = R.summaryFrom(ctx, NOW);
    assert.deepStrictEqual([s.due.card, s.due.mistake, s.due.exercise, s.due.total], [2, 1, 0, 3]);
    assert.strictEqual(s.fresh.total, 6, "new: 10 cards in the decks minus 4 with a saved state");
    assert.strictEqual(s.total, s.due.total + s.fresh.total, "total = the whole queue of the day");
    assert.strictEqual(R.queueFrom(ctx, NOW).length, s.total);
    ctx.state.settings.newPerDay = 0;
    assert.deepStrictEqual([R.summaryFrom(ctx, NOW).due.total, R.summaryFrom(ctx, NOW).fresh.total], [3, 0]);
  });
  test("P3 regression: a card rated \"Good\" with an 8 d interval does not come back to the queue for 7 days (04:00 day boundary)", function () {
    const ctx = makeCtx();
    ctx.state.settings.newPerDay = 0;
    const base = Object.assign(HM.newCard(), { state: "review", interval: 3, due: NOW, reps: 3 });
    const pv = HM.preview(base, NOW).good;
    assert.strictEqual(pv.card.interval, 8, "preview: Good = 8 d");
    const rated = HM.schedule(base, "good", NOW, null, { fuzz: true, random: function () { return 0; } }); // also with the spread
    assert.strictEqual(rated.interval, 8);
    ctx.state.cards["d1-001"] = rated;
    for (let day = 0; day <= 7; day++) {
      [at(10 + day, 5), at(10 + day, 12), at(10 + day, 23, 59)].forEach(function (t) {
        if (t < NOW) return;
        assert.deepStrictEqual(ids(R.queueFrom(ctx, t)), [], "day +" + day + " (" + new Date(t).toISOString() + "): the card should not come back");
        assert.strictEqual(R.summaryFrom(ctx, t).due.total, 0);
      });
    }
    assert.deepStrictEqual(ids(R.queueFrom(ctx, at(18, 10))), ["d1-001"], "w 8. dniu wraca");
  });
  test("estimateMinutes: card 0.3, mistake 0.5, exercise 0.7 min (rounded, at least 1 when there is something)", function () {
    assert.strictEqual(R.estimateMinutes({ card: 10, mistake: 0, exercise: 0 }), 3);
    assert.strictEqual(R.estimateMinutes({ card: 11, mistake: 4, exercise: 3 }), 7);
    assert.strictEqual(R.estimateMinutes({ card: 1, mistake: 0, exercise: 0 }), 1);
    assert.strictEqual(R.estimateMinutes({ card: 0, mistake: 0, exercise: 0 }), 0);
  });
  test("weakTasks: wrong items from weak topics without a right answer in 14 days; dictations skipped without a voice", function () {
    const row = function (id, topic, ok, day, type) { return { itemId: id, topic: topic, correct: ok, day: day, type: type || "gap-fill" }; };
    const items = [];
    for (let i = 0; i < 6; i++) items.push(row("t-" + i, "weak", false, "2026-11-0" + (i % 5 + 1)));
    items.push(row("solved", "weak", false, "2026-11-01"), row("solved", "weak", true, "2026-11-09"));
    items.push(row("dyk", "weak", false, "2026-11-08", "dictation"));
    for (let i = 0; i < 6; i++) items.push(row("ok-" + i, "good", i < 5, "2026-11-05"));
    const rec = { items: items, aggregates: {} };
    global.LM.learn.today = function () { return "2026-11-10"; };
    const all = R.weakTasks(rec, "2026-11-10");
    assert.ok(all.every(function (w) { return w.topic === "weak"; }));
    assert.ok(all.some(function (w) { return w.id === "dyk"; }));
    assert.ok(!all.some(function (w) { return w.id === "solved"; }), "answered right within 14 days");
    assert.ok(!R.weakTasks(rec, "2026-11-10", { noVoice: true }).some(function (w) { return w.id === "dyk"; }));
    assert.deepStrictEqual(R.weakTasks({ items: [], aggregates: {} }, "2026-11-10"), []);
  });
})();

console.log("\nToday: the map covered and the next review dates");
(function () {
  const L2 = global.LM.learn;
  const R = global.LM.reviewQueue;
  const FLg = global.LM.cardsLogic;
  const HM = global.LM.cardsSchedule;
  const lv = function (arr) { return arr.map(function (p, i) { return { id: ["A1", "A2", "B1", "B2", "C1", "C2"][i], percent: p }; }); };

  test("mapProgress: the average percent of 6 levels (rounded) and the bar segments", function () {
    const m = L2.mapProgress(lv([100, 100, 46, 0, 0, 0]));
    assert.strictEqual(m.percent, 41);
    assert.deepStrictEqual(m.segments.map(function (s) { return s.percent; }), [100, 100, 46, 0, 0, 0]);
    assert.strictEqual(m.segments.length, 6);
    assert.strictEqual(m.segments[2].id, "B1");
  });
  test("mapProgress: a new profile 0%, the whole map 100%, rounding", function () {
    assert.strictEqual(L2.mapProgress(lv([0, 0, 0, 0, 0, 0])).percent, 0);
    assert.strictEqual(L2.mapProgress(lv([100, 100, 100, 100, 100, 100])).percent, 100);
    assert.strictEqual(L2.mapProgress(lv([1, 0, 0, 0, 0, 0])).percent, 0, "1/6 = 0,17 → 0");
    assert.strictEqual(L2.mapProgress(lv([50, 0, 0, 0, 0, 0])).percent, 8, "50/6 = 8,3 → 8");
    assert.strictEqual(L2.mapProgress(lv([100, 0, 0, 0, 0, 0])).percent, 17, "100/6 = 16,7 → 17");
  });
  test("mapProgress: values out of range clipped, an empty list and NaN are 0", function () {
    const m = L2.mapProgress(lv([150, -20, NaN, 0, 0, 0]));
    assert.deepStrictEqual(m.segments.map(function (s) { return s.percent; }), [100, 0, 0, 0, 0, 0]);
    assert.strictEqual(m.percent, 17);
    assert.deepStrictEqual(L2.mapProgress([]), { percent: 0, segments: [] });
    assert.strictEqual(L2.mapProgress(undefined).percent, 0);
  });

  test("upcomingFrom: the next date and the number of items for tomorrow (04:00 day boundary)", function () {
    const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
    const at = function (d, h) { return new Date(2026, 10, d, h, 0, 0).getTime(); };
    const st = FLg.sanitizeState(FLg.emptyState());
    st.settings.enabledDecks = ["d1"];
    const rev = function (due) { return Object.assign(HM.newCard(), { state: "review", interval: 3, due: due, reps: 2 }); };
    st.cards["d1-001"] = rev(at(11, 9));          // tomorrow
    st.cards["d1-002"] = rev(at(11, 20));         // tomorrow
    st.cards["ex:a-1"] = rev(at(11, 6));          // tomorrow (exercise)
    st.cards["d1-003"] = rev(at(13, 9));          // za 3 dni
    st.cards["d2-001"] = rev(at(11, 9));          // disabled deck: skipped
    st.cards["d1-004"] = rev(at(10, 9));          // this morning (already past): not "next"
    const ctx = { state: st, decks: [{ id: "d1", count: 4 }, { id: "d2", count: 1 }], deckOf: function (id) { return id.replace(/-\d{3}$/, ""); } };
    const u = R.upcomingFrom(ctx, NOW);
    assert.strictEqual(u.next, at(11, 6));
    assert.strictEqual(u.tomorrow, 3);
    assert.deepStrictEqual(R.upcomingFrom({ state: FLg.sanitizeState(FLg.emptyState()), decks: [], deckOf: function () { return null; } }, NOW), { next: null, tomorrow: 0 });
  });
})();

console.log("\nContent: topic neighbors (S2)");
test("topicNeighbors: previous and next in level order, edges and an unknown topic", function () {
  const ids = ["a", "b", "c"];
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(ids, "b"), { prev: "a", next: "c" });
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(ids, "a"), { prev: null, next: "b" });
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(ids, "c"), { prev: "b", next: null });
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(ids, "x"), { prev: null, next: null });
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(["a"], "a"), { prev: null, next: null });
  assert.deepStrictEqual(global.LM.learn.topicNeighbors(undefined, "a"), { prev: null, next: null });
});

console.log("\nContent: set label on the level list (S4)");
test("bestSetLabel: the best set of a topic, the 80% threshold (dot), no results = null", function () {
  const f = global.LM.exLogic.bestSetLabel;
  assert.deepStrictEqual(f([{ score: 8, total: 10 }]), { score: 8, total: 10, high: true, text: "set 8/10" });
  assert.strictEqual(f([{ score: 7, total: 10 }]).high, false);
  assert.strictEqual(f([{ score: 7, total: 10 }, { score: 5, total: 5 }]).text, "set 5/5", "the higher percent wins");
  assert.strictEqual(f([{ score: 5, total: 5 }, { score: 10, total: 10 }]).text, "set 10/10", "a tie: more points");
  assert.strictEqual(f([null, undefined, { score: 3, total: 0 }]), null);
  assert.strictEqual(f([]), null);
  assert.strictEqual(f(undefined), null);
  assert.strictEqual(f([{ score: 0, total: 6 }]).text, "set 0/6");
});

console.log("\nContent: reading the sentence aloud with the S key (S5)");
test("speechText: a gap as a pause before checking, the answer after checking (choice, gap fill, transformation)", function () {
  const f = global.LM.exLogic.speechText;
  const mc = { type: "multiple-choice", prompt: "My brother ___ football every Saturday.", options: ["play", "plays", "playing"], correct: 1 };
  assert.strictEqual(f(mc, false), "My brother … football every Saturday.");
  assert.strictEqual(f(mc, true), "My brother plays football every Saturday.");
  const gf = { type: "gap-fill", text: "She {{1}} to school and {{2}} home.", gaps: [{ accepted: ["goes"] }, { accepted: ["comes", "walks"] }] };
  assert.strictEqual(f(gf, false), "She … to school and … home.");
  assert.strictEqual(f(gf, true), "She goes to school and comes home.");
  const tr = { type: "transformation", before: "I wish I", after: "more time.", answers: ["had"] };
  assert.strictEqual(f(tr, false), "I wish I … more time.");
  assert.strictEqual(f(tr, true), "I wish I had more time.");
  const sa = { type: "short-answer", prompt: "A: Where is Tom?\nB: He ___ at home.", accepted: ["is"] };
  assert.strictEqual(f(sa, false), "Where is Tom? He … at home.", "speaker labels are not read");
});
test("speechText: speaker labels with any capital letter (also with diacritics) are not read", function () {
  FX.speech.forEach(function (c) {
    assert.strictEqual(global.LM.exLogic.speechText(c.item, false), c.before);
    assert.strictEqual(global.LM.exLogic.speechText(c.item, true), c.after);
  });
});
test("speechText: put in order and translate only after checking, match and dictation without a sentence, find the mistake: the whole sentence", function () {
  const f = global.LM.exLogic.speechText;
  assert.strictEqual(f({ type: "reorder", answers: ["She likes tea."] }, false), "");
  assert.strictEqual(f({ type: "reorder", answers: ["She likes tea."] }, true), "She likes tea.");
  assert.strictEqual(f({ type: "translate", accepted: ["I am tired."] }, false), "");
  assert.strictEqual(f({ type: "translate", accepted: ["I am tired."] }, true), "I am tired.");
  assert.strictEqual(f({ type: "find-error", tokens: ["He", "go", "home", "."] }, false), "He go home.");
  assert.strictEqual(f({ type: "match", pairs: [["a", "b"]] }, true), "");
  assert.strictEqual(f({ type: "dictation", text: "x" }, false), "");
  assert.strictEqual(f(null, false), "");
  assert.strictEqual(f({ type: "multiple-choice", prompt: "Which is correct?", options: ["a", "b"], correct: 0 }, false), "Which is correct?", "a question without a gap is read in full");
});

console.log("\nCheck: queue interleaving");
test("interleave: when kinds cannot be separated, still never the same topic twice in a row", function () {
  const R = global.LM.reviewQueue;
  const items = [];
  for (let i = 0; i < 6; i++) items.push({ kind: "card", id: "a" + i, due: i, topic: "d1" });
  for (let i = 0; i < 6; i++) items.push({ kind: "card", id: "b" + i, due: 10 + i, topic: "d2" });
  const out = R.interleave(items);
  assert.strictEqual(out.length, 12);
  for (let i = 1; i < out.length; i++) assert.notStrictEqual(out[i].topic, out[i - 1].topic, "same topic in a row at " + i);
});
test("queueFrom: four overdue mistakes in a row are split by new cards and exercises (≤ 2 of the same kind)", function () {
  const R = global.LM.reviewQueue, FLg = global.LM.cardsLogic, HM = global.LM.cardsSchedule;
  const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
  const st = FLg.sanitizeState(FLg.emptyState());
  st.settings.enabledDecks = ["d1", "d2"];
  const mist = [1, 2, 3, 4].map(function (i) { return { id: "u-mb-" + i, deck: "u-moje-bledy", type: "basic", front: "a", back: "b", tags: [] }; });
  st.userDecks.push({ id: "u-moje-bledy", title: "My mistakes", system: "mistakes" });
  st.userCards = mist;
  mist.forEach(function (m, i) { st.cards[m.id] = Object.assign(HM.newCard(), { state: "review", interval: 3, due: new Date(2026, 10, 5 + i, 5).getTime(), reps: 2 }); });
  const cards = { d1: [1, 2, 3, 4, 5].map(function (i) { return { id: "d1-00" + i, deck: "d1" }; }), d2: [1, 2, 3, 4, 5].map(function (i) { return { id: "d2-00" + i, deck: "d2" }; }), "u-moje-bledy": mist };
  const ctx = { state: st, decks: [{ id: "d1", count: 5 }, { id: "d2", count: 5 }, { id: "u-moje-bledy", count: 4 }], weak: [],
    cardsOf: function (id) { return cards[id] || []; }, deckOf: function (id) { return /^u-mb/.test(id) ? "u-moje-bledy" : id.replace(/-\d{3}$/, ""); } };
  const q = R.queueFrom(ctx, NOW);
  assert.strictEqual(q.length, 14, "4 overdue + 10 new");
  for (let i = 2; i < q.length; i++) assert.ok(!(q[i].kind === q[i - 1].kind && q[i].kind === q[i - 2].kind && q[i].kind === "mistake"), "a third mistake in a row at " + i);
  for (let i = 1; i < q.length; i++) assert.notStrictEqual(q[i].topic, q[i - 1].topic, "same topic in a row at " + i);
  assert.strictEqual(q[0].id, "u-mb-1", "the oldest overdue still first");
  assert.strictEqual(R.summaryFrom(ctx, NOW).total, q.length);
});

test("interleave: random lists — when topics can be separated (no topic > half), never the same topic in a row", function () {
  const R = global.LM.reviewQueue;
  let seed = 12345;
  const rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let trial = 0; trial < 300; trial++) {
    const n = 2 + Math.floor(rnd() * 40), topics = 1 + Math.floor(rnd() * 4);
    const items = [];
    for (let i = 0; i < n; i++) items.push({ kind: ["card", "mistake", "exercise"][Math.floor(rnd() * 3)], id: "x" + i, due: i, topic: "t" + Math.floor(rnd() * topics) });
    const counts = {};
    items.forEach(function (it) { counts[it.topic] = (counts[it.topic] || 0) + 1; });
    const feasible = Object.keys(counts).every(function (t) { return counts[t] <= Math.ceil(n / 2); });
    const out = R.interleave(items);
    assert.strictEqual(out.length, n);
    if (!feasible) continue;
    for (let i = 1; i < out.length; i++) assert.notStrictEqual(out[i].topic, out[i - 1].topic, "trial " + trial + ", position " + i);
  }
});

console.log("\nSpread of correct letters in A–D sets (tools/build/answer-spread.js)");
test("answer-spread: ≤ 50% for one letter and ≤ 2 in a row; the content in the repository follows the rule", function () {
  const R = require(path.join(__dirname, "build", "answer-spread.js"));
  const mk = function (seq) { return { gaps: seq.split("").map(function (a, i) { return { n: i + 1, options: { A: "a", B: "b", C: "c", D: "d" }, answer: a }; }) }; };
  assert.strictEqual(R.check(mk("BDAADCCB")), null);
  assert.ok(/8 of 8/.test(R.check(mk("AAAAAAAA"))));
  assert.ok(/5 of 8/.test(R.check(mk("AABBBAAA")) || ""), "A 5 of 8 is over 50%");
  assert.ok(/in a row/.test(R.check(mk("AAABCDBC"))));
  assert.strictEqual(R.check(mk("AA")), null, "too few gaps for the rule to make sense");
  assert.strictEqual(R.check({ items: [] }), null);
  assert.deepStrictEqual(R.checkAll(path.join(__dirname, "..", "content")), []);
});

console.log("\n\"My mistakes\" cards: the full context and the item hint");
require(path.join(__dirname, "..", "js", "mistake-task.js"));
(function () {
  const FLg = global.LM.cardsLogic, MT = global.LM.mistakeTask, HM = global.LM.cardsSchedule;
  const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
  const entry = function (id, over) { return Object.assign({ id: id, createdAt: "2026-11-01", context: "", myAnswer: "x", correct: "", rule: "rule", source: "", category: "Use of English", itemId: "", ref: "", review: { stage: 1, due: "2026-11-12", mastered: false } }, over || {}); };
  const wf = entry("err-wf", { ref: "c1:uoe-p3-1:2", context: "Many teachers also welcome the _____ in time spent marking homework.\nBase word: REDUCE", correct: "reduction" });
  const abcd = entry("err-abcd", { ref: "c1:uoe-p1-4:1", context: "Few people would have predicted that vinyl records would _____ a comeback.\nA – make, B – take, C – pull, D – reach", correct: "A – make" });
  const tr = entry("err-tr", { ref: "ex:a2-transf-1-03", context: "Wish for more time\nWISH\nI wish I ___ more time.", correct: "I wish I had more time." });
  const bracket = entry("err-br", { ref: "ex:a1-tenses-present-simple-1-05", context: "She ___ (go) to school every day.", correct: "goes" });
  const manual = entry("err-man", { context: "How do you say “long ago”?\nHint: ago", correct: "a long time ago" });

  test("journalCard: word formation — the front has the base word next to the gap (the whole context, the gap on its own line)", function () {
    const c = FLg.journalCard(wf);
    assert.strictEqual(c.type, "cloze");
    assert.ok(/Many teachers also welcome the \{\{reduction\}\} in time/.test(c.text));
    assert.ok(/\nBase word: REDUCE$/.test(c.text), "the base word on its own line: " + JSON.stringify(c.text));
    const p = FLg.parseCloze(c.text);
    assert.ok(p.ok && p.answers[0] === "reduction" && /Base word: REDUCE/.test(p.after));
  });
  test("journalCard: choice A–D — options on the front, the answer accepted as \"A – make\", \"make\" and \"A\"", function () {
    const c = FLg.journalCard(abcd);
    assert.strictEqual(c.type, "cloze");
    assert.ok(/A – make, B – take, C – pull, D – reach/.test(c.text));
    const p = FLg.parseCloze(c.text);
    assert.deepStrictEqual(p.answers, ["A – make", "make", "A"]);
    assert.ok(/^Few people would have predicted that vinyl records would \{\{/.test(c.text));
  });
  test("journalCard: transformation — the key word on the front, the answer is the gap alone (no repeated part of the sentence)", function () {
    const c = FLg.journalCard(tr);
    assert.strictEqual(c.type, "cloze");
    assert.ok(/^Wish for more time\nWISH\nI wish I \{\{had\}\} more time\.$/.test(c.text), JSON.stringify(c.text));
  });
  test("journalCard: a verb in brackets stays on the line with the gap", function () {
    const c = FLg.journalCard(bracket);
    assert.strictEqual(c.text, "She {{goes}} (go) to school every day.");
  });
  test("journalCard: a manual entry without ref and gap — a plain card with the whole context (split into lines), back = the right answer", function () {
    const c = FLg.journalCard(manual);
    assert.strictEqual(c.type, "basic");
    assert.strictEqual(c.front, "How do you say “long ago”?\nHint: ago");
    assert.strictEqual(c.back, "a long time ago");
    assert.strictEqual(c.note, "rule");
  });


  test("mistakeTask.parseRef / viewFor: an entry with a ref to an item → item view, without a ref or an unknown ref → card", function () {
    assert.deepStrictEqual(MT.parseRef("ex:a1-tenses-present-simple-1-05"), { kind: "ex", itemId: "a1-tenses-present-simple-1-05" });
    assert.strictEqual(MT.parseRef("c1:uoe-p1-4:3"), null, "C1 cloze refs are dropped with js/c1-*.js");
    assert.strictEqual(MT.parseRef("journal:err-1"), null);
    assert.strictEqual(MT.parseRef(""), null);
    assert.strictEqual(MT.viewFor(wf), "card", "an old C1 ref falls back to the card");
    assert.strictEqual(MT.viewFor(tr), "task");
    assert.strictEqual(MT.viewFor(manual), "card");
    assert.strictEqual(MT.viewFor(entry("x", { ref: "something-manual" })), "card");
    assert.strictEqual(MT.viewFor(null), "card");
  });
})();

console.log("\nFlashcards: scheduler and saving");
(function () {
  const FLg = global.LM.cardsLogic, HM = global.LM.cardsSchedule;
  const DAYMS = 86400000;
  const NOW = new Date(2026, 10, 10, 18, 0, 0).getTime();
  const rev = function (iv, due, reps) { return Object.assign(HM.newCard(), { state: "review", interval: iv, due: due, reps: reps == null ? 3 : reps }); };

  test("spread: intervals < 20 d are saved exactly as in the preview (\"Good: 8 d\" = 8 d, \"Easy: 4 d\" = 4 d)", function () {
    for (let iv = 1; iv <= 9; iv++) {
      ["hard", "good", "easy"].forEach(function (g) {
        const base = rev(iv, NOW, 3);
        const pv = HM.preview(base, NOW)[g];
        if (pv.card.interval >= 20) return; // from 20 d the ±5% spread is intended (a separate test)
        [0, 0.25, 0.5, 0.75, 1].forEach(function (r) {
          const real = HM.schedule(base, g, NOW, null, { fuzz: true, random: function () { return r; } });
          assert.strictEqual(real.due, pv.card.due, "iv " + iv + " " + g + " random " + r + ": " + real.interval + " d instead of " + pv.card.interval + " d");
        });
      });
    }
    const graduating = HM.schedule(Object.assign(HM.newCard(), { state: "new" }), "easy", NOW, null, { fuzz: true, random: function () { return 0; } });
    assert.strictEqual(graduating.interval, 4, "a new card + Easy = 4 d, not 3 d");
  });
  test("spread: from 20 d still ±5% (20 d → 19–21 d), randomness from outside", function () {
    const base = rev(8, NOW, 3); // Good: 20 d
    const lo = HM.schedule(base, "good", NOW, null, { fuzz: true, random: function () { return 0; } }).interval;
    const hi = HM.schedule(base, "good", NOW, null, { fuzz: true, random: function () { return 1; } }).interval;
    assert.strictEqual(HM.schedule(base, "good", NOW).interval, 20);
    assert.deepStrictEqual([lo, hi], [19, 21]);
  });
  test("several study days: Good ×4 and Easy ×4 raise the interval with each rating (the state survives saving and reading)", function () {
    let t = NOW, st = {};
    const seq = [];
    ["good", "good", "good", "good", "good", "good"].forEach(function (g) {
      const base = st.state && st.state !== "new" ? st : HM.newCard();
      st = FLg.sanitizeState({ version: 1, cards: { "k-001": HM.schedule(base, g, t, null, { fuzz: true, random: function () { return 0.5; } }) } }).cards["k-001"];
      seq.push(st.state === "review" ? st.interval : 0);
      t = st.due;
    });
    assert.deepStrictEqual(seq, [0, 1, 3, 8, 20, 50]);
    let e = FLg.sanitizeState({ version: 1, cards: { "k-002": HM.schedule(HM.newCard(), "easy", NOW) } }).cards["k-002"];
    const ivs = [e.interval];
    for (let i = 0; i < 3; i++) { e = HM.schedule(e, "easy", e.due); ivs.push(e.interval); }
    assert.ok(ivs[1] > ivs[0] && ivs[2] > ivs[1] && ivs[3] > ivs[2], "Easy raises the interval every time: " + ivs.join(","));
  });

  test("saving from two browser tabs: an outdated tab does not undo ratings (mergeStates)", function () {
    const stored = FLg.sanitizeState(FLg.emptyState());     // saved after rating in tab A
    stored.cards["kolokacje-001"] = rev(8, NOW + 8 * DAYMS, 2);
    stored.daily["2026-11-10"] = { new: 1, reviews: 3, again: 0, good: 3, answers: 4, minutes: 2 };
    const stale = FLg.sanitizeState(FLg.emptyState());      // the memory of tab B before rating (the card still new)
    stale.daily["2026-11-10"] = { new: 0, reviews: 1, again: 1, good: 0, answers: 1, minutes: 0 };
    assert.strictEqual(FLg.mergeStates(stale, stored), true);
    assert.strictEqual(stale.cards["kolokacje-001"].interval, 8, "the rating from tab A taken over");
    assert.strictEqual(stale.daily["2026-11-10"].reviews, 3, "daily counter: the maximum");
    assert.strictEqual(stale.daily["2026-11-10"].again, 1);
    // memory newer than the saved state: it stays
    const fresh = FLg.sanitizeState(FLg.emptyState());
    fresh.cards["kolokacje-001"] = rev(20, NOW + 20 * DAYMS, 5);
    fresh.daily["2026-11-10"] = Object.assign({}, stored.daily["2026-11-10"]);
    assert.strictEqual(FLg.mergeStates(fresh, stored), false);
    assert.strictEqual(fresh.cards["kolokacje-001"].interval, 20);
    // a card without reviews (e.g. a suspended new one) in the saved state is not "newer" than no state
    const s2 = FLg.sanitizeState(FLg.emptyState()); s2.cards["kolokacje-009"] = Object.assign(HM.newCard(), { suspended: true });
    const m2 = FLg.sanitizeState(FLg.emptyState());
    assert.strictEqual(FLg.mergeStates(m2, s2), false);
    assert.strictEqual(m2.cards["kolokacje-009"], undefined);
  });
  test("deckStats: \"for today\" and \"for later\" (after the 04:00 study-day boundary)", function () {
    const cards = ["a", "b", "c", "d", "e"].map(function (x) { return { id: x }; });
    const state = {
      a: rev(3, NOW - 3600000),                                  // for today (overdue)
      b: rev(8, NOW + 8 * DAYMS),                                // for later
      c: rev(1, new Date(2026, 10, 11, 2, 0, 0).getTime()),      // tomorrow 02:00 = still today's study day
      d: rev(1, new Date(2026, 10, 11, 9, 0, 0).getTime())       // tomorrow 09:00 = for later
    };
    const s = FLg.deckStats(cards, state, NOW);
    assert.strictEqual(s.due, 2);
    assert.strictEqual(s.later, 2);
    assert.strictEqual(s.new, 1);
  });
  test("\"Add more new cards\" (extraNew) does not touch cards in review: the queue has no cards that are not due, the state is unchanged", function () {
    const cards = [1, 2, 3, 4, 5, 6, 7].map(function (i) { return { id: "k-00" + i, deck: "k" }; });
    const state = { "k-001": rev(8, NOW + 8 * DAYMS), "k-002": rev(3, NOW + 2 * DAYMS) };
    const before = JSON.stringify(state);
    const q = FLg.buildQueue({ cards: cards, state: state, now: NOW, settings: { newPerDay: 2, reviewsPerDay: 100 }, today: { new: 2 }, extraNew: 5 });
    assert.deepStrictEqual(q.review, [], "cards due after today do not come back");
    assert.strictEqual(q.fresh.length, 5, "only new: 5 extra");
    assert.ok(q.fresh.every(function (id) { return !state[id]; }));
    assert.strictEqual(JSON.stringify(state), before, "buildQueue changes nothing");
  });
})();

// ---------- Storage key registry (spec 02 §5): every key under slm., export / import / reset / delete driven by it ----------
console.log("\nStorage key registry: slm. keys, backup file, reset, profile deletion (spec 02 §5)");
(function () {
  const fsR = require("fs");
  global.addEventListener = global.addEventListener || function () {};
  global.LM.state = global.LM.state || {};
  require(path.join(__dirname, "..", "js", "store.js"));
  require(path.join(__dirname, "..", "js", "cards-store.js"));
  if (!global.LM.trailStore) require(path.join(__dirname, "..", "js", "trail-store.js"));
  const ST = global.LM.storage;
  const app = global.LM.app;
  app.replaceProfiles = function (data, opts) {
    global.LM.state.profiles = data;
    if (!(opts && opts.save === false)) global.LM.store.saveProfiles(data);
  };
  const ls = global.localStorage;
  const keys = function () { return Object.keys(ls._d); };
  /** Does the registry cover this localStorage key (key, per-profile prefix, or its ".corrupt" copy)? */
  function covered(k) {
    const base = k.replace(/\.corrupt$/, "");
    return ST.REGISTRY.some(function (e) { return e.key === base || (e.prefix && base.indexOf(e.prefix) === 0); });
  }
  /** A backup with data for profiles p1 and p2 in every exported entry. */
  function sampleBackup() {
    const data = {};
    ST.REGISTRY.forEach(function (e) {
      if (e.scope === "app") data[e.id] = { version: 1, activeId: "p1", profiles: [{ id: "p1", name: "Ana", progress: { "a1-verbs-gustar": true } }, { id: "p2", name: "Leo", progress: {} }] };
      if (e.scope === "profiles") data[e.id] = { version: 1, profiles: { p1: {}, p2: {} } };
      if (e.id === "cards") data[e.id] = { p1: global.LM.cardsLogic.emptyState(), p2: global.LM.cardsLogic.emptyState() };
      if (e.id === "trail") data[e.id] = { p1: global.LM.trailLogic.emptyState(), p2: global.LM.trailLogic.emptyState() };
    });
    return { app: global.LM.APP.exportName, kind: "backup", version: 1, exportedAt: "2026-11-22T10:00:00.000Z", data: data };
  }
  function hasProfile(entryId, exportedPart, pid) {
    const e = ST.REGISTRY.find(function (x) { return x.id === entryId; });
    if (e.scope === "app") return exportedPart.profiles.some(function (p) { return p.id === pid; });
    if (e.scope === "profiles") return Object.prototype.hasOwnProperty.call(exportedPart.profiles, pid);
    return Object.prototype.hasOwnProperty.call(exportedPart, pid);
  }

  test("registry: every key is the prefix slm. + id, ids are unique, keys from LM.APP.storagePrefix", function () {
    assert.strictEqual(global.LM.APP.storagePrefix, "slm.");
    const ids = ST.REGISTRY.map(function (e) { return e.id; });
    assert.strictEqual(new Set(ids).size, ids.length);
    ST.REGISTRY.forEach(function (e) {
      if (e.scope === "profile") assert.strictEqual(e.prefix, "slm." + e.id + ".");
      else assert.strictEqual(e.key, "slm." + e.id);
    });
    // The keys spec 02 §5 lists, all present
    ["theme", "sidebar", "profiles", "ui", "celebrated", "journal", "activity", "placement", "finals", "speaking", "phrases", "exercises",
      "attempts", "autojournal", "prefs", "notes", "exams", "cards", "trail", "search-recent"].forEach(function (id) {
      assert.ok(ids.indexOf(id) !== -1, "missing registry entry " + id);
    });
  });

  test("registry: every exported entry has export, import, reset and (per profile) delete handlers", function () {
    ST.REGISTRY.forEach(function (e) {
      if (e.scope === "device") { assert.strictEqual(e.handler, undefined, e.id + ": device keys are not exported"); return; }
      const h = e.handler();
      assert.ok(h, e.id + ": no handler");
      ["exportData", "parseImport", "applyImport", "clearAll"].forEach(function (fn) { assert.strictEqual(typeof h[fn], "function", e.id + "." + fn); });
      if (e.scope !== "app") assert.strictEqual(typeof h.removeProfile, "function", e.id + ".removeProfile");
    });
  });

  test("backup: export → import round trip covers every per-profile entry; the file name and envelope follow spec 02 §5", function () {
    ST.resetAll();
    ST.applyBackup(ST.parseBackup(sampleBackup()));
    const file = ST.exportBackup();
    assert.deepStrictEqual([file.app, file.kind, file.version], ["spanish-levels-map", "backup", 1]);
    assert.ok(/^spanish-levels-map-\d{4}-\d{2}-\d{2}\.json$/.test(ST.backupFileName()));
    ST.REGISTRY.forEach(function (e) {
      if (e.scope === "device") { assert.ok(!(e.id in file.data), e.id + " must not be exported"); return; }
      assert.ok(file.data[e.id], "export lacks " + e.id);
      assert.ok(hasProfile(e.id, file.data[e.id], "p1") && hasProfile(e.id, file.data[e.id], "p2"), e.id + ": both profiles exported");
    });
    ST.resetAll();
    ST.applyBackup(ST.parseBackup(JSON.parse(JSON.stringify(file))));
    const again = ST.exportBackup();
    ST.REGISTRY.forEach(function (e) {
      if (e.scope !== "device") assert.ok(hasProfile(e.id, again.data[e.id], "p1"), e.id + ": restored by import");
    });
  });

  test("backup: a file of another app, an old-format file or a newer version is refused with a clear message", function () {
    const other = sampleBackup(); other.app = "english-levels-map";
    assert.throws(function () { ST.parseBackup(other); }, /not a Spanish Levels Map backup \(it comes from "english-levels-map"\)/);
    assert.throws(function () { ST.parseBackup({ app: "spanish-levels-map", kind: "progress", data: {} }); }, /incomplete/);
    const newer = sampleBackup(); newer.version = 2;
    assert.throws(function () { ST.parseBackup(newer); }, /newer version/);
    const noProfiles = sampleBackup(); delete noProfiles.data.profiles;
    assert.throws(function () { ST.parseBackup(noProfiles); }, /no profile list/);
    assert.throws(function () { ST.parseBackup("x"); }, /does not contain data/);
  });

  test("delete profile: removes the profile's data from every per-profile entry, the other profile keeps its data", function () {
    ST.resetAll();
    ST.applyBackup(ST.parseBackup(sampleBackup()));
    ST.deleteProfile("p1");
    const file = ST.exportBackup();
    ST.REGISTRY.forEach(function (e) {
      if (e.scope === "device" || e.scope === "app") return;
      assert.ok(!hasProfile(e.id, file.data[e.id], "p1"), e.id + ": p1 data left after delete");
      assert.ok(hasProfile(e.id, file.data[e.id], "p2"), e.id + ": p2 data lost");
    });
    assert.strictEqual(ls.getItem("slm.cards.p1"), null);
    assert.strictEqual(ls.getItem("slm.trail.p1"), null);
  });

  test("reset: removes every slm. key except the device's theme and sidebar", function () {
    ST.resetAll();
    ST.applyBackup(ST.parseBackup(sampleBackup()));
    ls.setItem("slm.theme", "dark");
    ls.setItem("slm.sidebar", JSON.stringify({ version: 1, pinned: true }));
    ls.setItem("slm.ui", JSON.stringify({ levelId: "A1" }));
    ls.setItem("slm.search-recent", JSON.stringify({ version: 1, items: ["ser"] }));
    ls.setItem("slm.journal.corrupt", "{broken");
    assert.ok(keys().length > 10);
    ST.resetAll();
    assert.deepStrictEqual(keys().filter(function (k) { return k.indexOf("slm.") === 0; }).sort(), ["slm.sidebar", "slm.theme"]);
    ls.removeItem("slm.theme"); ls.removeItem("slm.sidebar");
  });

  test("keys in use: every key written during these tests is under slm. and covered by the registry; no elm_ keys", function () {
    ST.applyBackup(ST.parseBackup(sampleBackup()));
    keys().forEach(function (k) {
      assert.ok(k.indexOf("slm.") === 0, "key outside the prefix: " + k);
      assert.ok(covered(k), "key not in the registry: " + k);
    });
    ST.resetAll();
  });

  test("keys in code: no hard-coded storage key outside the registry (js/, index.html)", function () {
    const root = path.join(__dirname, "..");
    const files = fsR.readdirSync(path.join(root, "js")).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return path.join("js", f); }).concat(["index.html"]);
    files.forEach(function (rel) {
      const src = fsR.readFileSync(path.join(root, rel), "utf8");
      const old = src.match(/["'`]elm[_.][\w.]*["'`]/g);
      assert.strictEqual(old, null, rel + ": legacy key " + (old || []).join(", "));
      (src.match(/["'`]slm\.[\w.-]*["'`]/g) || []).forEach(function (lit) {
        const k = lit.slice(1, -1);
        if (rel === path.join("js", "config.js") && k === "slm.") return; // the prefix itself
        if (rel === path.join("js", "profile-data.js") && k === "slm.") return; // fallback prefix
        assert.ok(covered(k), rel + ": key literal " + k + " is not a registry key");
      });
    });
  });
})();

console.log("\nSyllabus: the only list of levels, units, categories and topics (spec 06 E1, E2)");
(function () {
  const fsS = require("fs");
  const root = path.join(__dirname, "..");
  require(path.join(root, "data", "syllabus.js"));
  require(path.join(root, "js", "syllabus.js"));
  const S = global.LM.syl;
  const src = JSON.parse(fsS.readFileSync(path.join(root, "content", "syllabus.json"), "utf8"));
  const status = JSON.parse(fsS.readFileSync(path.join(root, "content", "levels.json"), "utf8")).levels;

  test("LEVEL_IDS come from the syllabus (A1 … C2, in order)", function () {
    assert.deepStrictEqual(global.LM.LEVEL_IDS, src.levels.map(function (l) { return l.id; }));
    assert.deepStrictEqual(global.LM.LEVEL_IDS, ["A1", "A2", "B1", "B2", "C1", "C2"]);
  });
  test("topic ids are frozen: content/syllabus.json has the same ids as docs/plan/syllabus.json", function () {
    const plan = JSON.parse(fsS.readFileSync(path.join(root, "docs", "plan", "syllabus.json"), "utf8"));
    const ids = function (s) { const out = []; s.levels.forEach(function (l) { l.units.forEach(function (u) { u.topics.forEach(function (t) { out.push(t.id); }); }); }); return out; };
    assert.deepStrictEqual(ids(src), ids(plan));
  });
  test("every topic: unique id, route #/<level>/<category>-<slug>, path round trip", function () {
    const seen = {};
    S.topics().forEach(function (t) {
      assert.ok(!seen[t.id], "duplicate " + t.id);
      seen[t.id] = true;
      assert.strictEqual(S.routeOf(t.id), "#/" + t.level.toLowerCase() + "/" + t.id.slice(3));
      assert.ok(new RegExp("^" + t.level.toLowerCase() + "-" + t.category + "-").test(t.id), t.id + " does not start with level and category");
      assert.strictEqual(S.topicFromPath(t.path), t);
      assert.strictEqual(S.topic(t.id), t);
    });
    assert.strictEqual(S.topicFromPath("a1/no-such-topic"), null);
    assert.strictEqual(S.topic("e_a1_g01"), null, "checklist ids of the reference app are gone");
  });
  test("groups(level): categories in order of first appearance, every topic once, unit order inside", function () {
    S.levels().forEach(function (l) {
      const flat = S.topics(l.id);
      const firstSeen = [];
      flat.forEach(function (t) { if (firstSeen.indexOf(t.category) === -1) firstSeen.push(t.category); });
      const g = S.groups(l.id);
      assert.deepStrictEqual(g.map(function (x) { return x.id; }), firstSeen, l.id);
      const all = [].concat.apply([], g.map(function (x) { return x.topics; }));
      assert.strictEqual(all.length, flat.length, l.id);
      g.forEach(function (x) {
        assert.strictEqual(x.name, src.categories[x.id]);
        for (let i = 1; i < x.topics.length; i++) assert.ok(x.topics[i].order > x.topics[i - 1].order, "unit order in " + x.id);
      });
    });
  });
  test("stats and countDone count syllabus topics only (progress[<topic id>] = true)", function () {
    const a1 = S.topics("A1");
    const progress = { "e_a1_g01": true, "x": true };
    progress[a1[0].id] = true;
    progress[a1[1].id] = true;
    progress[a1[2].id] = false;
    const s = S.stats("A1", progress);
    assert.strictEqual(s.done, 2);
    assert.strictEqual(s.total, a1.length);
    assert.strictEqual(s.percent, Math.round(200 / a1.length));
    assert.strictEqual(S.countDone(progress), 2);
    assert.deepStrictEqual(S.stats("A2", {}), { done: 0, total: S.topics("A2").length, percent: 0 });
  });
  test("level status from content/levels.json; unknown or missing → soon", function () {
    S.levels().forEach(function (l) { assert.strictEqual(S.status(l.id), status[l.id] || "soon", l.id); });
    assert.strictEqual(S.status("Z9"), "soon");
    assert.deepStrictEqual(S.availableLevels(), global.LM.LEVEL_IDS.filter(function (id) { return status[id] === "available"; }));
    assert.strictEqual(S.landName("A1"), src.levels[0].land);
  });
})();

console.log("\nTrail generated from the syllabus (spec 06 E9)");
(function () {
  const fsT = require("fs");
  const root = path.join(__dirname, "..");
  const G = require(path.join(root, "tools", "build", "trail.js"));
  const SL = global.LM.trailLogic;
  const syllabus = JSON.parse(fsT.readFileSync(path.join(root, "content", "syllabus.json"), "utf8"));
  const status = { A1: "available", A2: "soon", B1: "soon", B2: "soon", C1: "soon", C2: "soon" };
  const firstA1 = syllabus.levels[0].units[0].topics[0].id;
  const tr = G.generate(syllabus, status, { quizzes: { [firstA1]: true }, sets: { [firstA1]: ["set-x", "set-y"] }, titles: {} });

  test("one lesson stop per topic (id = topic id), one checkpoint per unit at its end", function () {
    syllabus.levels.forEach(function (l, li) {
      assert.strictEqual(tr.levels[li].level, l.id);
      assert.strictEqual(tr.levels[li].land, l.land);
      assert.strictEqual(tr.levels[li].finalTest, "#/" + l.id.toLowerCase() + "/test");
      l.units.forEach(function (u, ui) {
        const stops = tr.levels[li].units[ui].stops;
        assert.strictEqual(tr.levels[li].units[ui].id, u.id);
        assert.deepStrictEqual(stops.slice(0, -1).map(function (s) { return s.id; }), u.topics.map(function (t) { return t.id; }));
        stops.slice(0, -1).forEach(function (s, i) {
          assert.strictEqual(s.type, "lesson");
          assert.deepStrictEqual(s.items, [s.id], "checklist item = topic");
          assert.strictEqual(s.page, s.id.slice(0, 2) + "/" + s.id.slice(3));
          assert.strictEqual(s.category, u.topics[i].category);
        });
        const cp = stops[stops.length - 1];
        assert.strictEqual(cp.id, u.id + "-checkpoint");
        assert.strictEqual(cp.type, "review");
        assert.deepStrictEqual(cp.from, u.topics.map(function (t) { return t.id; }));
        assert.strictEqual(cp.size, Math.min(8, 2 * u.topics.length));
      });
    });
  });
  test("quiz only when the quiz file exists; set = first set of the topic; status per level", function () {
    const stops = [].concat.apply([], tr.levels.map(function (l) { return [].concat.apply([], l.units.map(function (u) { return u.stops; })); }));
    const first = stops.find(function (s) { return s.id === firstA1; });
    assert.strictEqual(first.quiz, firstA1);
    assert.strictEqual(first.set, "set-x");
    assert.ok(stops.filter(function (s) { return s.type === "lesson" && s.id !== firstA1; }).every(function (s) { return !("quiz" in s) && !("set" in s); }));
    assert.deepStrictEqual(tr.levels.map(function (l) { return l.status; }), ["available", "soon", "soon", "soon", "soon", "soon"]);
  });
  test("overrides rename a stop and change a checkpoint", function () {
    const u = syllabus.levels[0].units[0];
    const t2 = G.generate(syllabus, status, {}, { stops: { [firstA1]: { title: "Renamed" } }, checkpoints: { [u.id + "-checkpoint"]: { size: 3, title: "Check" } } });
    assert.strictEqual(t2.levels[0].units[0].stops[0].title, "Renamed");
    const cp = t2.levels[0].units[0].stops[u.topics.length];
    assert.strictEqual(cp.size, 3);
    assert.strictEqual(cp.title, "Check");
  });
  test("passing rules: quiz ≥ 3 of 4, or I know this, or best set ≥ 80% without a quiz, or skip; a quiz never ticks I know this", function () {
    const env = { isKnown: function () { return false; }, setPercent: function () { return null; } };
    const lesson = tr.levels[0].units[0].stops[0];
    const st = SL.emptyState();
    st.stops[lesson.id] = { done: true, via: "quiz", best: 3, at: "" };
    assert.strictEqual(SL.statusOf(lesson, st, env).status, "done");
    assert.strictEqual(env.isKnown(lesson.id), false, "the quiz result does not tick the topic");
    const other = tr.levels[0].units[0].stops[1];
    assert.strictEqual(SL.statusOf(other, SL.emptyState(), { isKnown: function (id) { return id === other.id; }, setPercent: env.setPercent }).status, "done");
    const withSet = Object.assign({}, other, { set: "s1" });
    assert.strictEqual(SL.statusOf(withSet, SL.emptyState(), { isKnown: env.isKnown, setPercent: function () { return 80; } }).status, "done");
    assert.strictEqual(SL.statusOf(Object.assign({}, withSet, { quiz: other.id }), SL.emptyState(), { isKnown: env.isKnown, setPercent: function () { return 100; } }).status, "open", "a set does not pass a stop that has a quiz");
  });
  test("soon levels: status soon, never current; a start in a soon land moves back to the last available land", function () {
    const env = { isKnown: function () { return false; }, setPercent: function () { return null; } };
    const b = SL.buildTrail(tr, SL.emptyState(), env, "B1");
    assert.strictEqual(b.startIndex, 0, "start moved back to A1");
    assert.strictEqual(b.current.level, "A1");
    assert.ok(b.nodes.filter(function (n) { return n.level !== "A1"; }).every(function (n) { return n.status === "soon" && n.soon && !n.current; }));
    const allDone = { isKnown: function (id) { return /^a1-/.test(id); }, setPercent: function () { return null; } };
    const st = SL.emptyState();
    tr.levels[0].units.forEach(function (u) { st.reviews[u.id + "-checkpoint"] = { best: 1, of: 1, at: "" }; });
    assert.strictEqual(SL.buildTrail(tr, st, allDone, "A1").current, null, "A1 done: no current stop in a soon land");
    assert.deepStrictEqual(SL.levelProgress(b, "A2"), { done: 0, total: tr.levels[1].units.reduce(function (a, u) { return a + u.stops.length - 1; }, 0), percent: 0 });
  });
  test("data/trail.js is the generated trail of the current content", function () {
    global.LM.TRAIL = null;
    require(path.join(root, "data", "trail.js"));
    const lv = JSON.parse(fsT.readFileSync(path.join(root, "content", "levels.json"), "utf8")).levels;
    assert.deepStrictEqual(global.LM.TRAIL.levels.map(function (l) { return l.status; }), syllabus.levels.map(function (l) { return lv[l.id] === "available" ? "available" : "soon"; }));
    const ids = [];
    global.LM.TRAIL.levels.forEach(function (l) { l.units.forEach(function (u) { u.stops.forEach(function (s) { if (s.type === "lesson") ids.push(s.id); }); }); });
    assert.strictEqual(ids.length, 130);
    global.LM.TRAIL.levels.forEach(function (l) { l.units.forEach(function (u) { u.stops.forEach(function (s) {
      if (s.quiz) assert.ok(fsT.existsSync(path.join(root, "content", "quizzes", l.level.toLowerCase(), s.quiz + ".json")), "quiz file of " + s.id);
    }); }); });
  });
})();

console.log("\nExams: generic module with the fixture exam tools/fixtures/exam-demo (spec 06 E8)");
(function () {
  const root = path.join(__dirname, "..");
  const fsX = require("fs");
  ["utils", "markdown", "exam-logic", "exam-core"].forEach(function (f) { require(path.join(root, "js", f + ".js")); });
  const EX = require(path.join(root, "tools", "build", "exams.js"));
  const EXI = require(path.join(root, "tools", "build", "exercises.js"));
  const fx = EX.collect(path.join(root, "tools", "fixtures", "exam-demo"));
  const saved = global.LM.EXAM_REGISTRY;

  test("collect(): registry in order, active exam with pages, engine set and writing trainer; soon exam without data", function () {
    assert.deepStrictEqual(fx.errors, []);
    assert.deepStrictEqual(fx.registry.exams.map(function (e) { return e.id + ":" + e.status; }), ["exam-demo:active", "exam-later:soon"]);
    const d = fx.data["exam-demo"];
    assert.deepStrictEqual(Object.keys(d.pages).sort(), ["format", "overview"]);
    assert.ok(d.trainers.writing && d.trainers.writing.tasks.length === 1);
    assert.ok(!fx.data["exam-later"], "a soon exam has no data file");
    const set = fx.setFiles["exam-demo-set-1"];
    assert.strictEqual(set.items.length, 2);
    assert.ok(set.items.every(function (it) { return it.setId === "exam-demo-set-1" && it.topic === null && it.level === "B1"; }));
    assert.deepStrictEqual(fx.registry.exams[0].setIds, ["exam-demo-set-1"]);
    assert.strictEqual(fx.registry.sets["exam-demo-set-1"].href, "#/practice/set/exam-demo-set-1");
  });
  test("collect(): broken registry entries are errors (status, missing manifest, trainer without type)", function () {
    const tmp = path.join(root, "tmp", "exam-bad");
    fsX.rmSync(tmp, { recursive: true, force: true });
    fsX.mkdirSync(path.join(tmp, "x1"), { recursive: true });
    fsX.writeFileSync(path.join(tmp, "registry.json"), JSON.stringify({ version: 1, exams: [
      { id: "x1", code: "X1", label: "X1", status: "active" }, { id: "x2", code: "X2", label: "X2", status: "maybe" }, { id: "x2", code: "X3", label: "X3", status: "soon" }
    ] }));
    fsX.writeFileSync(path.join(tmp, "x1", "manifest.json"), JSON.stringify({ sections: [{ id: "s", label: "S", trainers: [{ id: "t", file: "t.json" }] }] }));
    const r = EX.collect(tmp);
    fsX.rmSync(tmp, { recursive: true, force: true });
    assert.ok(r.errors.some(function (e) { return /unknown status/.test(e); }), "status");
    assert.ok(r.errors.some(function (e) { return /duplicate exam id x2/.test(e); }), "duplicate");
    assert.ok(r.errors.some(function (e) { return /needs type/.test(e); }), "trainer type");
    assert.ok(r.errors.some(function (e) { return /missing trainer/.test(e); }), "trainer file");
  });
  test("files(): the data files the app loads (registry, exam data, set) assign into LM", function () {
    const f = EX.files(fx);
    assert.deepStrictEqual(Object.keys(f).sort(), ["data/exam-exam-demo.js", "data/exams-registry.js", "data/sets/exam-demo-set-1.js"]);
    assert.ok(/^\/\* GENERATED by tools\/build\.js/.test(f["data/exams-registry.js"]));
    assert.ok(/LM\.EXAM_REGISTRY = \{/.test(f["data/exams-registry.js"]));
    assert.ok(/\(LM\.EXAMS = LM\.EXAMS \|\| \{\}\)\["exam-demo"\]/.test(f["data/exam-exam-demo.js"]));
  });
  test("examSetMeta(): exam sets go into the practice index with their exam id, count and points", function () {
    const m = EXI.examSetMeta(fx.examSets[0]);
    assert.strictEqual(m.id, "exam-demo-set-1");
    assert.strictEqual(m.exam, "exam-demo");
    assert.strictEqual(m.count, 2);
    assert.strictEqual(m.file, "data/sets/exam-demo-set-1.js");
    assert.strictEqual(m.defaultMode, "exam");
    assert.ok(m.points >= 2);
  });
  test("routes: #/exams/<id>[/page|practice|writing[/task]|speaking]; soon exam only at its root; unknown → null", function () {
    global.LM.EXAM_REGISTRY = fx.registry;
    const P = global.LM.exams.parseRoute;
    assert.deepStrictEqual(P("#/exams/exam-demo"), { examId: "exam-demo", kind: "page", id: "overview" });
    assert.deepStrictEqual(P("#/exams/exam-demo/format"), { examId: "exam-demo", kind: "page", id: "format" });
    assert.deepStrictEqual(P("#/exams/exam-demo/practice"), { examId: "exam-demo", kind: "exercises" });
    assert.deepStrictEqual(P("#/exams/exam-demo/writing/email-1"), { examId: "exam-demo", kind: "writing", task: "email-1" });
    assert.deepStrictEqual(P("#/exams/exam-demo/speaking"), { examId: "exam-demo", kind: "speaking" });
    assert.deepStrictEqual(P("#/exams/exam-later"), { examId: "exam-later", kind: "soon" });
    ["#/exams/exam-later/x", "#/exams/nope", "#/exams/exam-demo/a/b", "#/exams", "#/exam-demo", "#/certyfikat-c1"].forEach(function (h) { assert.strictEqual(P(h), null, h); });
    assert.strictEqual(global.LM.exams.href(fx.registry.exams[0]), "#/exams/exam-demo");
  });
  test("empty registry (until stage E): no exam route at all", function () {
    global.LM.EXAM_REGISTRY = { version: 1, exams: [], links: {}, sets: {} };
    assert.strictEqual(global.LM.exams.parseRoute("#/exams/exam-demo"), null);
    const real = JSON.parse(fsX.readFileSync(path.join(root, "content", "exams", "registry.json"), "utf8"));
    assert.deepStrictEqual(real.exams, [], "content/exams/registry.json stays empty until stage E");
  });
  test("my exams with the fixture: a done set or a date makes the exam mine; the soon exam never", function () {
    const EL = global.LM.examLogic;
    const reg = fx.registry;
    const st = function (input) { return EL.myExams(EL.examMyState(Object.assign({ registry: reg, examsRecord: { exams: {} }, isSetDone: function () { return false; } }, input)), reg, "2026-11-22"); };
    assert.deepStrictEqual(st({}), []);
    assert.deepStrictEqual(st({ isSetDone: function (id) { return id === "exam-demo-set-1"; } }), [{ id: "exam-demo", reason: "sets", days: null }]);
    assert.deepStrictEqual(st({ examsRecord: { exams: { "exam-demo": { examDate: "2026-12-01" } }, my: { "exam-later": "pinned" } } }), [{ id: "exam-demo", reason: "date", days: 9 }]);
    assert.deepStrictEqual(EL.navSplit(reg, [], null), { shown: ["exam-demo", "exam-later"], hidden: [] });
  });
  global.LM.EXAM_REGISTRY = saved;
})();

console.log("\nEnglish helpers: LM.plural and LM.fmt (spec 04 §1)");
(function () {
  require(path.join(__dirname, "..", "js", "utils.js"));
  const LMg = global.LM;
  test("plural: count + singular or plural noun, default plural adds s, numbers with separators", function () {
    assert.strictEqual(LMg.plural(1, "day", "days"), "1 day");
    assert.strictEqual(LMg.plural(0, "day", "days"), "0 days");
    assert.strictEqual(LMg.plural(3, "day", "days"), "3 days");
    assert.strictEqual(LMg.plural(2, "set"), "2 sets");
    assert.strictEqual(LMg.plural(1, "entry", "entries"), "1 entry");
    assert.strictEqual(LMg.plural(21, "card"), "21 cards", "no Polish 2–4 rule");
    assert.strictEqual(LMg.plural(1200, "card"), "1,200 cards");
  });
  test("fmt.date / dayMonth / weekday / dateLong: en-US, a YYYY-MM-DD day is never shifted by the time zone", function () {
    assert.strictEqual(LMg.fmt.date("2026-11-12"), "Nov 12, 2026");
    assert.strictEqual(LMg.fmt.dateLong("2026-11-12"), "November 12, 2026");
    assert.strictEqual(LMg.fmt.dayMonth("2026-01-05"), "Jan 5");
    assert.strictEqual(LMg.fmt.weekday("2026-11-12"), "Thursday");
    assert.strictEqual(LMg.fmt.weekdayShort("2026-11-12"), "Thu");
    assert.strictEqual(LMg.fmt.date("not a date"), "");
    assert.strictEqual(LMg.fmt.date(""), "");
    assert.strictEqual(LMg.fmt.date(new Date(2027, 4, 6)), "May 6, 2027");
    assert.match(LMg.fmt.time(new Date(2026, 10, 12, 14, 5)), /^2:05\s?PM$/);
  });
  test("fmt.number / percent", function () {
    assert.strictEqual(LMg.fmt.number(1234567), "1,234,567");
    assert.strictEqual(LMg.fmt.number(7), "7");
    assert.strictEqual(LMg.fmt.percent(0.426), "43%");
    assert.strictEqual(LMg.fmt.percent(1), "100%");
    assert.strictEqual(LMg.fmt.percent(0), "0%");
  });
  test("the temporary Polish plural (LM.pluralPl) is gone and nothing calls it", function () {
    const fs = require("fs");
    assert.strictEqual(LMg.pluralPl, undefined);
    const dir = path.join(__dirname, "..", "js");
    fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
      assert.ok(!/pluralPl/.test(fs.readFileSync(path.join(dir, f), "utf8")), f + " still mentions pluralPl");
    });
  });
})();

console.log("\nValidators (spec 06 E11: tools/validate-content.js = validate_plan.py + heuristics)");
(function () {
  const cp = require("child_process");
  const ROOT = path.join(__dirname, "..");
  function runNode(dir) {
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "validate-content.js"), dir], { encoding: "utf8" });
    return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
  }
  function runPython(dir) {
    for (const exe of ["python3", "python"]) {
      const r = cp.spawnSync(exe, [path.join(ROOT, "docs", "plan", "scripts", "validate_plan.py"), dir], { encoding: "utf8", env: Object.assign({}, process.env, { PYTHONUTF8: "1" }) });
      if (!r.error && /topics/.test(r.stdout || "")) return { status: r.status, out: r.stdout };
    }
    return null;
  }
  /** "#n" of every message of a severity in a validator output (ERROR / warn). */
  function itemsWith(out, level) {
    const re = new RegExp("^" + level + "\\s+.*? #(\\d+):", "gm"); // paths may contain spaces
    const s = new Set(); let m;
    while ((m = re.exec(out))) s.add(Number(m[1]));
    return Array.from(s).sort(function (a, b) { return a - b; });
  }
  const FIXTURE = path.join(ROOT, "tools", "fixtures", "validate-content");
  test("docs/plan (syllabus + examples): 0 errors and 0 warnings in Node", function () {
    const r = runNode(path.join(ROOT, "docs", "plan"));
    assert.strictEqual(r.status, 0, r.out);
    assert.ok(/0 error\(s\), 0 warning\(s\)/.test(r.out), r.out);
  });
  test("content/: 0 errors in Node (the sample placement pool shape is a warning until STRICT)", function () {
    const r = runNode(path.join(ROOT, "content"));
    assert.strictEqual(r.status, 0, r.out);
  });
  test("fixture: every broken item is reported with the right severity, the clean ones are silent", function () {
    const r = runNode(FIXTURE);
    assert.strictEqual(r.status, 1);
    assert.deepStrictEqual(itemsWith(r.out, "ERROR"), [4, 5, 6, 7]);
    assert.deepStrictEqual(itemsWith(r.out, "warn"), [1, 2, 3, 6]);
    [/#1: .*subject pronoun/, /#2: .*gender/, /#3: .*you \(plural\)/, /#4: characters outside/, /#5: duplicate options \(after normalisation\)/,
      /#5: optionNotes length/, /#6: correct must be an option index/, /#7: paradigm: at least 2 cells to fill/].forEach(function (re) {
      assert.ok(re.test(r.out), "missing " + re);
    });
  });
  const py = runPython(path.join(ROOT, "docs", "plan"));
  test("Python and Node agree: docs/plan 0 errors; on the fixture the items with errors match (Python skipped when not installed)", function () {
    if (!py) { console.log("       (python not found: agreement not checked)"); return; }
    assert.strictEqual(py.status, 0, py.out);
    const pf = runPython(FIXTURE);
    const nodeErr = itemsWith(runNode(FIXTURE).out, "ERROR");
    // Node adds E11 rule 4 (duplicates after normalisation: item 5 has a second error); the items with errors are the same
    assert.deepStrictEqual(itemsWith(pf.out, "ERROR"), nodeErr);
  });
})();

console.log("\nstrip-keys (spec 10 §4, step 4)");
(function () {
  const SK = require(path.join(__dirname, "strip-keys.js"));
  const leaks = function (t) {
    return SK.KEY_FIELDS.filter(function (k) { return k in t; })
      .concat((t.gaps || []).some(function (g) { return "accepted" in g; }) ? ["gaps[].accepted"] : [])
      .concat((t.cells || []).some(function (c) { return "accepted" in c; }) ? ["cells[].accepted"] : [])
      .concat("pairs" in t ? ["pairs"] : []);
  };
  test("no key field survives, for every fixture item and every item of content/", function () {
    allItems.forEach(function (it) { assert.deepStrictEqual(leaks(SK.stripItem(it)), [], it.id); });
    const dir = path.join(__dirname, "..", "content");
    ["exercises", "quizzes/a1", "tests"].forEach(function (sub) {
      fs.readdirSync(path.join(dir, sub)).filter(function (f) { return /\.json$/.test(f) && f !== "topics.json" && f !== "mixes.json"; }).forEach(function (f) {
        SK.stripFile(path.join(dir, sub, f)).forEach(function (t) { assert.deepStrictEqual(leaks(t), [], f + " " + t.id); });
      });
    });
  });
  test("reorder becomes tiles (the words of the first answer), match becomes two columns; the order is fixed per item", function () {
    const r = bankItem("fx-ser-estar-1-08");
    const a = SK.stripItem(r), b = SK.stripItem(r);
    assert.deepStrictEqual(a.tiles, b.tiles);
    assert.deepStrictEqual(a.tiles.slice().sort(), X.answerTokens(r.answers[0], r.answers.slice(1)).sort());
    const m = SK.stripItem(bankItem("fx-gustar-1-01"));
    assert.strictEqual(m.left.length, 3);
    assert.strictEqual(m.right.length, 4); // the three answers + one extra
  });
  test("paradigm keeps the labels and the given forms only; gap hints stay", function () {
    const p = SK.stripItem(bankItem("fx-ser-estar-1-07"));
    assert.ok(p.cells[0].given && !p.cells[1].given && p.cells.every(function (c) { return c.label; }));
  });
})();

console.log("\nResult: " + passed + " ok, " + failures.length + " failed");


if (failures.length) process.exit(1);
