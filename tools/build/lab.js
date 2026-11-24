/*
 * lab.js — Tense & Mood Lab data (spec 06 E7).
 *
 *   content/lab/cards.json, contrasts.json, trees.json → data/lab.js
 *   LM.LAB = { axes, cards, contrasts, trees }   (loaded on demand by js/lab.js)
 *
 * The structure is checked by LM.labLogic.validate (js/lab-logic.js), the same code the validator runs.
 * ctx.lab (search entries) and ctx.tenseByTopic (topic id → the Lab entry shown in the topic's practice section).
 */
"use strict";

const C = require("./common");

global.window = global.window || global;
require(C.path.join(__dirname, "..", "..", "js", "lab-logic.js"));
const LL = global.LM.labLogic;

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "lab");
  ctx.tenseByTopic = {};
  ctx.lab = { cards: [], contrasts: [], trees: [] };
  const cardsFile = C.path.join(dir, "cards.json");
  if (!C.exists(cardsFile)) { ctx.log("Lab: no content/lab/cards.json (skipped)"); return; }
  const cards = C.readJson(cardsFile);
  const contrasts = C.readJsonIf(C.path.join(dir, "contrasts.json"), { contrasts: [] });
  const trees = C.readJsonIf(C.path.join(dir, "trees.json"), { trees: [] });
  const lab = { axes: cards.axes || null, cards: cards.cards || [], contrasts: contrasts.contrasts || [], trees: trees.trees || [] };
  const res = LL.validate(lab, ctx.topics);
  res.errors.forEach(function (e) { ctx.error("content/lab: " + e); });
  res.warnings.forEach(function (w) { ctx.warn("content/lab: " + w); });
  // Topic → Lab entry: a card first, else a contrast card
  lab.cards.forEach(function (card) {
    (card.topicIds || []).forEach(function (t) {
      if (!ctx.tenseByTopic[t]) ctx.tenseByTopic[t] = { id: card.id, name: card.name, kind: "card", route: LL.routeOf("card", card.id) };
    });
  });
  lab.contrasts.forEach(function (k) {
    (k.topicIds || []).forEach(function (t) {
      if (!ctx.tenseByTopic[t]) ctx.tenseByTopic[t] = { id: k.id, name: LL.contrastTitle(k), kind: "contrast", route: LL.routeOf("contrast", k.id) };
    });
  });
  C.writeData("lab.js", "content/lab/*.json", C.assign("LAB", lab));
  ctx.lab = lab;
  ctx.log("Lab: " + lab.cards.length + " cards, " + lab.contrasts.length + " contrast cards, " + lab.trees.length + " trees");
}

module.exports = { build: build };
