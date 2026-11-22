/*
 * trail.js — the trail generated from the syllabus (spec 06 E9) → data/trail.js (LM.TRAIL, loaded at start).
 *
 *   level → { level, land, status, finalTest, units }
 *   unit  → { id, title, stops }: one LESSON stop per topic, then one CHECKPOINT
 *   lesson     { id: <topic id>, type: "lesson", title, category, items: [<topic id>], page: "a1/verbs-gustar",
 *                quiz: <topic id> (only when content/quizzes/<level>/<topic id>.json exists),
 *                set: <first set of the topic in content/exercises/topics.json> (only when there is one) }
 *   checkpoint { id: "<unit id>-checkpoint", type: "review", title, from: [<stop ids of the unit>], size: min(8, 2 × topics) }
 *
 * Optional content/trail-overrides.json renames stops or changes a checkpoint:
 *   { "version": 1, "stops": { "<topic id>": { "title": "…" } },
 *     "checkpoints": { "<unit id>-checkpoint": { "title": "…", "size": 6 } } }
 * Unknown ids or fields in the overrides are errors.
 *
 * build() needs ctx.quizzes (tools/build/quizzes.js) and ctx.pageMeta (tools/build/pages.js), so it runs after them.
 */
"use strict";

const C = require("./common");

const MAX_CHECKPOINT = 8;

function readOverrides(ctx) {
  const file = C.path.join(C.CONTENT, "trail-overrides.json");
  const raw = C.readJsonIf(file, null);
  const out = { stops: {}, checkpoints: {} };
  if (!raw) return out;
  if (raw.version !== 1) ctx.error("trail-overrides.json: version must be 1");
  Object.keys(raw).forEach(function (k) {
    if (["version", "stops", "checkpoints"].indexOf(k) === -1) ctx.error("trail-overrides.json: unknown field \"" + k + "\"");
  });
  Object.keys(raw.stops || {}).forEach(function (id) {
    const o = raw.stops[id];
    if (!ctx.topics[id]) { ctx.error("trail-overrides.json: stop " + id + " is not a syllabus topic"); return; }
    Object.keys(o || {}).forEach(function (k) { if (k !== "title") ctx.error("trail-overrides.json: stop " + id + " has unknown field \"" + k + "\""); });
    if (typeof o.title !== "string" || !o.title.trim()) ctx.error("trail-overrides.json: stop " + id + " needs a non-empty title");
    else out.stops[id] = { title: o.title.trim() };
  });
  out.checkpointIds = Object.keys(raw.checkpoints || {});
  out.checkpointIds.forEach(function (id) {
    const o = raw.checkpoints[id] || {};
    Object.keys(o).forEach(function (k) { if (k !== "title" && k !== "size") ctx.error("trail-overrides.json: checkpoint " + id + " has unknown field \"" + k + "\""); });
    if ("size" in o && !(Number.isInteger(o.size) && o.size >= 1 && o.size <= 20)) ctx.error("trail-overrides.json: checkpoint " + id + " size must be 1–20");
    if ("title" in o && (typeof o.title !== "string" || !o.title.trim())) ctx.error("trail-overrides.json: checkpoint " + id + " title must be a non-empty string");
    out.checkpoints[id] = o;
  });
  return out;
}

/** Pure: syllabus + facts → trail object (exported for the unit tests). */
function generate(syllabus, status, facts, overrides) {
  overrides = overrides || { stops: {}, checkpoints: {} };
  return {
    version: 1,
    levels: syllabus.levels.map(function (level) {
      return {
        level: level.id,
        land: level.land || "",
        status: status[level.id] === "available" ? "available" : "soon",
        finalTest: "#/" + level.id.toLowerCase() + "/test",
        units: level.units.map(function (unit) {
          const stops = unit.topics.map(function (t) {
            const stop = {
              id: t.id, type: "lesson",
              title: (overrides.stops[t.id] && overrides.stops[t.id].title) || (facts.titles && facts.titles[t.id]) || t.title,
              category: t.category,
              items: [t.id],
              page: C.pageFileOf(t.id).replace(/\.md$/, "")
            };
            if (facts.quizzes && facts.quizzes[t.id]) stop.quiz = t.id;
            const sets = facts.sets && facts.sets[t.id];
            if (sets && sets.length) stop.set = sets[0];
            return stop;
          });
          const cpId = unit.id + "-checkpoint";
          const cp = overrides.checkpoints[cpId] || {};
          stops.push({
            id: cpId, type: "review",
            title: cp.title || "Checkpoint: " + unit.title,
            from: unit.topics.map(function (t) { return t.id; }),
            size: cp.size || Math.min(MAX_CHECKPOINT, 2 * unit.topics.length)
          });
          return { id: unit.id, title: unit.title, stops: stops };
        })
      };
    })
  };
}

function build(ctx) {
  const overrides = readOverrides(ctx);
  const unitIds = {};
  ctx.syllabus.levels.forEach(function (l) { l.units.forEach(function (u) { unitIds[u.id + "-checkpoint"] = true; }); });
  (overrides.checkpointIds || []).forEach(function (id) { if (!unitIds[id]) ctx.error("trail-overrides.json: checkpoint " + id + " is not <unit id>-checkpoint of a syllabus unit"); });
  const topicsFile = C.path.join(C.CONTENT, "exercises", "topics.json");
  const sets = (C.readJsonIf(topicsFile, { topics: {} }).topics) || {};
  const titles = {};
  Object.keys(ctx.pageMeta || {}).forEach(function (id) { titles[id] = ctx.pageMeta[id].title; });
  const trail = generate(ctx.syllabus, ctx.status, { quizzes: ctx.quizzes || {}, sets: sets, titles: titles }, overrides);
  let lessons = 0, checkpoints = 0, quizzes = 0;
  trail.levels.forEach(function (l) { l.units.forEach(function (u) { u.stops.forEach(function (s) {
    if (s.type === "lesson") { lessons++; if (s.quiz) quizzes++; } else checkpoints++;
  }); }); });
  C.writeData("trail.js", "content/syllabus.json, content/levels.json, content/quizzes, content/exercises/topics.json, content/trail-overrides.json",
    C.assign("TRAIL", trail));
  ctx.log("Trail: " + lessons + " lesson stops (" + quizzes + " with a quiz), " + checkpoints + " checkpoints");
}

module.exports = { build: build, generate: generate, MAX_CHECKPOINT: MAX_CHECKPOINT };
