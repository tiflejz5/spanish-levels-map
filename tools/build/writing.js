/*
 * writing.js — phrase bank and writing tasks (port of the reference tools/zbuduj-zwroty.js).
 *
 *   content/writing/phrases.json → data/phrases.js   LM.PHRASES = { groups }   (lazy)
 *   content/writing/tasks.json   → data/writing.js   LM.WRITING = { tasks }    (lazy, stage E)
 * Both files are optional; the phrase bank is written in stage X of B1 (spec 07 §8).
 */
"use strict";

const C = require("./common");

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "writing");
  const phrasesFile = C.path.join(dir, "phrases.json");
  ctx.phrases = null;
  if (C.exists(phrasesFile)) {
    const data = C.readJson(phrasesFile);
    const total = (data.groups || []).reduce(function (n, g) { return n + (g.phrases || []).length; }, 0);
    C.writeData("phrases.js", "content/writing/phrases.json", C.assign("PHRASES", data));
    ctx.phrases = data;
    ctx.log("Phrase bank: " + (data.groups || []).length + " groups, " + total + " phrases");
  } else ctx.log("Phrase bank: none yet (content/writing/phrases.json)");
  const tasksFile = C.path.join(dir, "tasks.json");
  if (C.exists(tasksFile)) {
    const tasks = C.readJson(tasksFile);
    C.writeData("writing.js", "content/writing/tasks.json", C.assign("WRITING", tasks));
    ctx.log("Writing tasks: " + (tasks.tasks || []).length);
  }
}

module.exports = { build: build };
