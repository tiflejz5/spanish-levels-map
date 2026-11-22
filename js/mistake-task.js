/*
 * mistake-task.js — a "mistake" item in a review session: when the mistake-log entry has a ref to an exercise item
 * ("ex:<item id>"), the session shows the ORIGINAL item (with its hint) instead of a card built from the entry text.
 *
 *   Pure logic (tests: node tools/tests.js):
 *     parseRef(ref)            "ex:<item id>" → { kind: "ex", itemId } or null
 *     viewFor(entry)           "task" (entry with a known ref) | "card" (manual entry, no ref, unknown ref)
 *   With data:
 *     load(entry)              Promise → { kind: "engine", item } | null (item not found → card)
 * The engine draws the item (LM.exercises.startSingle, js/cards.js). The C1 cloze format of the reference app
 * ("c1:<set>:<n>" refs and their own view) is dropped with js/c1-*.js (spec 03, spec 06 E8).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  function parseRef(ref) {
    const m = /^ex:([a-z0-9][a-z0-9-]*)$/.exec(String(ref || ""));
    return m ? { kind: "ex", itemId: m[1] } : null;
  }

  function viewFor(entry) { return entry && parseRef(entry.ref) ? "task" : "card"; }

  /** Oryginalne zadanie wpisu albo null (wpis ręczny, usunięty zestaw, brak pliku — wtedy sesja pokazuje kartę). */
  function load(entry) {
    const ref = parseRef(entry && entry.ref);
    if (!ref) return Promise.resolve(null);
    if (!LM.exercises) return Promise.resolve(null);
    const setId = ref.itemId.replace(/-\d{1,3}$/, "");
    return LM.exercises.loadSets([setId]).then(function (sets) {
      const item = sets[0] && sets[0].items.find(function (i) { return i.id === ref.itemId; });
      return item ? { kind: "engine", item: item } : null;
    }, function () { return null; });
  }

  LM.mistakeTask = { parseRef: parseRef, viewFor: viewFor, load: load };
})(window.LM);
