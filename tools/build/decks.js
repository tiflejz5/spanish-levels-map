/*
 * decks.js — built-in flashcard decks (port of the reference tools/zbuduj-fiszki.js).
 *
 *   content/decks/index.json, content/decks/<deck id>.json
 *   → data/decks-index.js   LM.DECKS_INDEX = { version, decks: [{ id, title, description, level, count, enabled, file }] }
 *   → data/decks/<id>.js    LM.DECKS[<id>] = deck   (lazy)
 */
"use strict";

const C = require("./common");

function build(ctx) {
  const dir = C.path.join(C.CONTENT, "decks");
  const index = C.readJsonIf(C.path.join(dir, "index.json"), { version: 1, decks: [] });
  let cards = 0;
  const decks = [];
  (index.decks || []).forEach(function (d) {
    const file = C.path.join(dir, d.file || d.id + ".json");
    if (!C.exists(file)) { ctx.error("decks/index.json: no file for deck " + d.id); return; }
    const deck = C.readJson(file);
    if (deck.id !== d.id) ctx.error("decks/" + (d.file || d.id) + ": id " + deck.id + " ≠ index id " + d.id);
    cards += (deck.cards || []).length;
    C.writeData("decks/" + d.id + ".js", "content/decks/" + (d.file || d.id + ".json"), C.assignKey("DECKS", d.id, deck));
    decks.push({ id: d.id, title: d.title || deck.title, description: d.description || deck.description || "", level: d.level || deck.level,
      count: (deck.cards || []).length, enabled: d.enabled === true, file: "data/decks/" + d.id + ".js" });
  });
  ctx.decks = decks;
  C.writeData("decks-index.js", "content/decks/index.json", C.assign("DECKS_INDEX", { version: index.version || 1, decks: decks }));
  ctx.log("Decks: " + decks.length + " decks, " + cards + " cards");
}

module.exports = { build: build };
