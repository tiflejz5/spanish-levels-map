/*
 * exercises.js — exercise sets and mixes (port of the reference tools/zbuduj-cwiczenia.js).
 *
 *   content/exercises/topics.json   map: topic id → [set ids]
 *   content/exercises/<set id>.json sets (spec 07 §5)
 *   content/exercises/mixes.json    ready mixes
 *
 * Output (sets are loaded on demand with a plain <script>, which also works on file://):
 *   data/sets/<set id>.js   LM.EX_SETS[<id>] = full set
 *   data/sets-index.js      LM.SETS_INDEX = { version, topics, sets (cards without items), mixes, tenseByTopic }
 * Exam sets come from tools/build/exams.js (ctx.examSets, so that module runs first) and are listed in the same index
 * with an "exam" field; the C1 Use of English format is dropped (spec 03).
 */
"use strict";

const C = require("./common");

function typeCounts(items) {
  const out = {};
  items.forEach(function (it) { out[it.type] = (out[it.type] || 0) + 1; });
  return out;
}

function pointsOf(items) {
  global.window = global.window || global;
  require(C.path.join(C.ROOT, "js", "exercise-logic.js"));
  const maxPoints = global.window.LM.exLogic.maxPoints;
  return items.reduce(function (s, it) { return s + maxPoints(it); }, 0);
}

/** Index card of an exam set (no items): what the practice list and the engine need. */
function examSetMeta(x) {
  const set = x.set;
  return {
    id: x.meta.id, topic: null, level: set.level || null, title: set.title || x.meta.label, intro: set.intro || "",
    count: set.items.length, points: pointsOf(set.items), types: typeCounts(set.items),
    defaultMode: set.defaultMode === "learn" ? "learn" : "exam", file: "data/sets/" + x.meta.id + ".js",
    exam: x.exam.id, hasPassage: !!set.passage
  };
}

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "exercises");
  const map = C.readJsonIf(C.path.join(dir, "topics.json"), { topics: {} });

  const topics = {};
  const sets = {};
  Object.keys(map.topics || {}).forEach(function (topic) {
    if (!ctx.topics[topic]) ctx.warn("exercises/topics.json: unknown topic " + topic);
    (map.topics[topic] || []).forEach(function (setId) {
      const file = C.path.join(dir, setId + ".json");
      if (!C.exists(file)) { ctx.warn("exercises/topics.json: no file for set " + setId + " (skipped)"); return; }
      const set = C.readJson(file);
      set.items = (set.items || []).map(function (it) {
        return Object.assign({ topic: set.topic || null, level: set.level || null, tags: [], setId: setId }, it);
      });
      C.writeData("sets/" + setId + ".js", "content/exercises/" + setId + ".json", C.assignKey("EX_SETS", setId, set));
      (topics[topic] = topics[topic] || []).push(setId);
      sets[setId] = {
        id: setId, topic: set.topic || topic, level: set.level || null, title: set.title || setId, intro: set.intro || "",
        count: set.items.length, points: pointsOf(set.items), types: typeCounts(set.items),
        defaultMode: set.defaultMode === "exam" ? "exam" : "learn", file: "data/sets/" + setId + ".js"
      };
    });
  });
  // Sets on disk that the map does not list are invisible in the app
  C.listFiles(dir, /\.json$/).forEach(function (f) {
    const id = f.replace(/\.json$/, "");
    if (id !== "topics" && id !== "mixes" && !sets[id]) ctx.warn("exercises/" + f + " is not listed in exercises/topics.json");
  });

  (ctx.examSets || []).forEach(function (x) {
    if (sets[x.meta.id]) ctx.error("exam set id " + x.meta.id + " is also a topic set id");
    sets[x.meta.id] = examSetMeta(x);
  });

  const mixes = C.readJsonIf(C.path.join(dir, "mixes.json"), { mixes: [] }).mixes || [];
  ctx.tenseByTopic = ctx.tenseByTopic || {};
  C.writeData("sets-index.js", "content/exercises/topics.json, mixes.json, <set>.json",
    C.assign("SETS_INDEX", { version: 1, topics: topics, sets: sets, mixes: mixes, tenseByTopic: ctx.tenseByTopic }));
  ctx.sets = sets;
  ctx.mixes = mixes;
  const n = Object.keys(sets).reduce(function (s, k) { return s + sets[k].count; }, 0);
  ctx.log("Exercises: " + Object.keys(sets).length + " sets, " + n + " items, " + mixes.length + " mixes");
}

module.exports = { build: build, examSetMeta: examSetMeta };
