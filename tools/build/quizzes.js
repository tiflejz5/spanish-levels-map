/*
 * quizzes.js — trail stop quizzes (quiz part of the reference tools/zbuduj-szlak.js).
 *
 *   content/quizzes/<level>/<topic id>.json → data/quizzes-<level>.js   LM.QUIZZES[<topic id>] = quiz   (lazy)
 *
 * The trail itself (data/trail.js) is generated from the syllabus by tools/build/trail.js (spec 06 E9).
 */
"use strict";

const C = require("./common");

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "quizzes");
  let total = 0;
  const done = [];
  ctx.quizzes = {};
  C.listDirs(dir).forEach(function (lvl) {
    const L = lvl.toUpperCase();
    if (C.LEVELS.indexOf(L) === -1) { ctx.warn("quizzes/" + lvl + ": not a level folder (skipped)"); return; }
    const lines = [];
    C.listFiles(C.path.join(dir, lvl), /\.json$/).forEach(function (f) {
      const q = C.readJson(C.path.join(dir, lvl, f));
      const id = f.replace(/\.json$/, "");
      if (q.id !== id) ctx.error("quizzes/" + lvl + "/" + f + ": id " + q.id + " ≠ file name");
      const t = ctx.topics[q.topic];
      if (!t) ctx.error("quizzes/" + lvl + "/" + f + ": unknown topic " + q.topic);
      else if (t.level !== L) ctx.error("quizzes/" + lvl + "/" + f + ": topic of level " + t.level);
      lines.push(C.assignKey("QUIZZES", q.id, q));
      ctx.quizzes[q.id] = true;
      total++;
    });
    if (lines.length) { C.writeData("quizzes-" + lvl + ".js", "content/quizzes/" + lvl + "/*.json", lines.join("\n")); done.push(L); }
  });
  ctx.log("Quizzes: " + total + (done.length ? " (" + done.join(", ") + ")" : ""));
}

module.exports = { build: build };
