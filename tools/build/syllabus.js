/*
 * syllabus.js — content/syllabus.json + content/levels.json → data/syllabus.js
 *   LM.SYLLABUS     = the syllabus as written (levels → units → topics), plus `status` per level
 *   LM.LEVEL_STATUS = { A1: "available" | "soon", … }   (spec 06 E1)
 * Also builds ctx.topics (id → { level, unit, category, title, order }) for the other modules.
 */
"use strict";

const C = require("./common");

const STATUSES = ["available", "soon"];

function load(ctx) {
  const file = C.path.join(C.CONTENT, "syllabus.json");
  if (!C.exists(file)) { ctx.error("content/syllabus.json is missing"); return; }
  const syllabus = C.readJson(file);
  const levelsFile = C.path.join(C.CONTENT, "levels.json");
  const statusSrc = C.readJsonIf(levelsFile, { levels: {} }).levels || {};
  const status = {};
  const topics = {};
  let order = 0;
  (syllabus.levels || []).forEach(function (level) {
    const s = statusSrc[level.id] || "soon";
    if (STATUSES.indexOf(s) === -1) ctx.error("content/levels.json: " + level.id + " has unknown status \"" + s + "\"");
    status[level.id] = s;
    level.status = s;
    (level.units || []).forEach(function (unit) {
      (unit.topics || []).forEach(function (t) {
        if (topics[t.id]) ctx.error("syllabus: duplicate topic id " + t.id);
        if (!syllabus.categories || !syllabus.categories[t.category]) ctx.error("syllabus: " + t.id + " has unknown category " + t.category);
        topics[t.id] = { id: t.id, level: level.id, unit: unit.id, category: t.category, title: t.title, order: order++ };
      });
    });
  });
  C.LEVELS.forEach(function (l) { if (!status[l]) ctx.error("syllabus: level " + l + " is missing"); });
  ctx.syllabus = syllabus;
  ctx.status = status;
  ctx.topics = topics;
}

function build(ctx) {
  C.writeData("syllabus.js", "content/syllabus.json, content/levels.json",
    C.assign("SYLLABUS", ctx.syllabus) + "\n" + C.assign("LEVEL_STATUS", ctx.status));
  ctx.log("Syllabus: " + Object.keys(ctx.topics).length + " topics, " +
    Object.keys(ctx.status).map(function (l) { return l + " " + ctx.status[l]; }).join(", "));
}

module.exports = { load: load, build: build };
