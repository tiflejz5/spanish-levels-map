/*
 * tests.js — placement test and level final tests (port of the placement part of
 * tools/zbuduj-niezbednik.js and of tools/zbuduj-testy-koncowe.js).
 *
 *   content/tests/placement.json       → data/placement.js      LM.PLACEMENT = { version, questions }  (lazy)
 *   content/tests/final-<level>.json   → data/final-<level>.js  LM.FINALS[<level>] = set               (lazy)
 *
 * Placement questions: { id, level, skill: grammar|vocabulary|reading, type: "multiple-choice", question,
 * options (4), correct, explanation, topicId?, passage? (reading) } — spec 07 §6. Broken questions are left out
 * with a warning; the pool proportions (5/3/2 per level) are the validator's job.
 */
"use strict";

const C = require("./common");

const SKILLS = ["grammar", "vocabulary", "reading"];
const PASSAGE_RANGE = { A1: [30, 80], A2: [30, 80], B1: [30, 80], B2: [60, 130], C1: [60, 130], C2: [60, 130] };

function placement(ctx) {
  const file = C.path.join(C.CONTENT, "tests", "placement.json");
  if (!C.exists(file)) { ctx.warn("tests/placement.json is missing (the placement test will show its empty state)"); return; }
  const raw = C.readJson(file);
  if (raw.version !== 1 || !Array.isArray(raw.questions)) { ctx.error("tests/placement.json needs \"version\": 1 and a \"questions\" list"); return; }
  const seen = new Set();
  const questions = raw.questions.filter(function (q, i) {
    const where = "placement question " + (i + 1) + (q && q.id ? " (" + q.id + ")" : "");
    const fail = function (msg) { ctx.warn(where + ": " + msg + " — left out"); return false; };
    if (!q || typeof q !== "object") return fail("not an object");
    if (typeof q.id !== "string" || !q.id.trim()) return fail("no id");
    if (seen.has(q.id)) return fail("duplicate id");
    if (C.LEVELS.indexOf(q.level) === -1) return fail("level must be one of " + C.LEVELS.join(", "));
    if (q.type !== "multiple-choice") return fail("type must be multiple-choice");
    if (typeof q.question !== "string" || !q.question.trim()) return fail("no question text");
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(function (o) { return typeof o === "string" && o.trim(); })) return fail("options must be 2+ non-empty strings");
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) return fail("correct must be an option index (from 0)");
    if (SKILLS.indexOf(q.skill) === -1) return fail("skill must be one of " + SKILLS.join(", "));
    if (q.skill === "reading") {
      if (typeof q.passage !== "string" || !q.passage.trim()) return fail("a reading question needs a passage");
      const n = q.passage.trim().split(/\s+/).length, r = PASSAGE_RANGE[q.level];
      if (n < r[0] || n > r[1]) ctx.warn(where + ": passage has " + n + " words, " + q.level + " needs " + r[0] + "–" + r[1]);
    } else if (q.passage != null) return fail("passage is only for skill reading");
    if (q.options.length !== 4) ctx.warn(where + ": " + q.options.length + " options (4 expected)");
    if (q.topicId && !ctx.topics[q.topicId]) { ctx.warn(where + ": unknown topicId " + q.topicId + " — kept without a link"); q.topicId = ""; }
    seen.add(q.id);
    return true;
  });
  C.writeData("placement.js", "content/tests/placement.json", C.assign("PLACEMENT", { version: 1, questions: questions }));
  ctx.log("Placement: " + questions.length + " questions (" + C.LEVELS.map(function (l) {
    return l + " " + questions.filter(function (q) { return q.level === l; }).length;
  }).join(", ") + ")");
}

function finals(ctx) {
  let pools = 0, items = 0;
  C.LEVELS.forEach(function (L) {
    const file = C.path.join(C.CONTENT, "tests", "final-" + L.toLowerCase() + ".json");
    if (!C.exists(file)) {
      if (ctx.status[L] === "available") ctx.warn("tests/final-" + L.toLowerCase() + ".json is missing (level " + L + " is available)");
      return;
    }
    const set = C.readJson(file);
    set.items = (set.items || []).map(function (it) {
      const t = ctx.topics[it.topic];
      if (!t) ctx.warn("final " + L + ": item " + it.id + " has unknown topic " + it.topic);
      else if (t.level !== L) ctx.warn("final " + L + ": item " + it.id + " has a topic of level " + t.level);
      return Object.assign({ level: L, tags: [], setId: set.id }, it, { category: t ? t.category : "grammar" });
    });
    C.writeData("final-" + L.toLowerCase() + ".js", "content/tests/final-" + L.toLowerCase() + ".json", C.assignKey("FINALS", L, set));
    pools++; items += set.items.length;
  });
  ctx.log("Final tests: " + pools + " pools, " + items + " items");
}

module.exports = { build: function (ctx) { placement(ctx); finals(ctx); } };
