/*
 * lab.js — Tense & Mood Lab data (lab part of the reference tools/zbuduj-cwiczenia.js).
 *
 *   content/lab/cards.json, contrasts.json, trees.json → data/lab.js
 *   LM.LAB = { axes, cards, contrasts, trees, tenses, tree }   (lazy)
 *
 * The reference view still reads `tenses` and `tree` (English Tense Lab); they stay empty until the
 * data-driven lab of stage 6 (spec 06 E7). ctx.tenseByTopic (topic id → card) feeds the sets index.
 */
"use strict";

const C = require("./common");

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "lab");
  ctx.tenseByTopic = {};
  const cardsFile = C.path.join(dir, "cards.json");
  if (!C.exists(cardsFile)) { ctx.log("Lab: no content/lab/cards.json (skipped)"); return; }
  const cards = C.readJson(cardsFile);
  const contrasts = C.readJsonIf(C.path.join(dir, "contrasts.json"), { contrasts: [] });
  const trees = C.readJsonIf(C.path.join(dir, "trees.json"), { trees: [] });
  (cards.cards || []).forEach(function (card) {
    (card.topicIds || []).forEach(function (t) {
      if (!ctx.topics[t]) ctx.warn("lab/cards.json: card " + card.id + " links unknown topic " + t);
      if (!ctx.tenseByTopic[t]) ctx.tenseByTopic[t] = { id: card.id, name: card.name };
    });
  });
  C.writeData("lab.js", "content/lab/*.json", C.assign("LAB", {
    axes: cards.axes || null, cards: cards.cards || [], contrasts: contrasts.contrasts || [], trees: trees.trees || [],
    tenses: [], tree: null
  }));
  ctx.lab = cards.cards || [];
  ctx.log("Lab: " + (cards.cards || []).length + " cards, " + (contrasts.contrasts || []).length + " contrasts, " + (trees.trees || []).length + " trees");
}

module.exports = { build: build };
