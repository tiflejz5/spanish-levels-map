/*
 * cards-store.js — flashcard data in localStorage (spec 10, section 4).
 *
 *   Key per profile: slm.cards.<profileId>
 *   { version: 1, cards: { <id>: state }, userDecks: [...], userCards: [...], settings: {...}, daily: { <day>: {...} } }
 *
 * State is saved only for cards the user has touched (the rest = new). Saved after every
 * change, in try/catch; on an error (e.g. storage full) a message, and work goes on in memory.
 * A damaged save is put aside as slm.cards.<id>.corrupt and we start empty.
 * The data is part of the backup (registry entry "cards": { <profileId>: state }), import and reset;
 * a backup without that part leaves the flashcards unchanged. Validation: LM.cardsLogic.sanitizeState.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const memory = {}; // { profileId: state }
  let saveFailed = false;

  function L() { return LM.cardsLogic; }
  function app() { return LM.app; }
  function keyOf(pid) { return LM.storage.profileKey("cards", pid); } // slm.cards.<profileId> (registry in js/profile-data.js)
  function activeId() { const p = app() && app().getActiveProfile(); return p ? p.id : null; }

  function load(pid) {
    if (!pid) return L().emptyState();
    if (memory[pid]) return memory[pid];
    let raw = null;
    try { raw = window.localStorage.getItem(keyOf(pid)); } catch (e) { raw = null; }
    let data = null;
    if (raw) {
      try { data = L().sanitizeState(JSON.parse(raw)); } catch (e) {
        try { window.localStorage.setItem(keyOf(pid) + ".corrupt", raw); } catch (e2) { /* nothing to do */ }
        data = null;
      }
    }
    memory[pid] = data || L().emptyState();
    return memory[pid];
  }

  /** Merges into memory what another browser tab saved in the meantime (see cards-logic mergeStates). → true when something was taken over. */
  function mergeStored(pid) {
    if (!memory[pid]) return false;
    try {
      const raw = window.localStorage.getItem(keyOf(pid));
      return raw ? L().mergeStates(memory[pid], L().sanitizeState(JSON.parse(raw))) : false;
    } catch (e) { return false; }
  }

  /**
   * Saves the profile's state. By default it merges with what is in localStorage (two browser tabs do not overwrite each other's ratings);
   * force = true saves the state from memory without merging (undo of a rating, import), because there the state deliberately goes back or is replaced.
   */
  function save(pid, force) {
    pid = pid || activeId();
    if (!pid || !memory[pid]) return true;
    if (LM.state && LM.state.storageOk === false) return false;
    if (!force) mergeStored(pid);
    try {
      memory[pid].daily = L().pruneDaily(memory[pid].daily, 400);
      window.localStorage.setItem(keyOf(pid), JSON.stringify(memory[pid]));
      saveFailed = false;
      return true;
    } catch (e) {
      if (!saveFailed && app() && app().reportSaveError) app().reportSaveError("Your flashcards were not saved! The browser storage is full or not available – you can keep studying, but changes may be lost when you close the page.");
      saveFailed = true;
      return false;
    }
  }

  /** State of the active profile (without a profile — temporary, not saved). */
  function data() { return load(activeId()); }

  /** Profiles that have saved flashcards (for export, reset and clean-up). */
  function storedIds() {
    const out = LM.storage.storedProfileIds("cards");
    Object.keys(memory).forEach(function (pid) { if (out.indexOf(pid) === -1) out.push(pid); });
    return out;
  }

  function removeProfile(pid) {
    delete memory[pid];
    try { window.localStorage.removeItem(keyOf(pid)); } catch (e) { /* no access */ }
  }

  /** Export part: { <profileId>: state } (only profiles with data). */
  function exportData() {
    const out = {};
    storedIds().forEach(function (pid) { out[pid] = JSON.parse(JSON.stringify(load(pid))); });
    return out;
  }

  /** Import part: missing (an old file) → null; a wrong format → an exception with a description. */
  function parseImport(raw) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("The “cards” part of the file has a wrong format.");
    const out = {};
    Object.keys(raw).slice(0, 500).forEach(function (pid) {
      if (typeof pid !== "string" || pid.length > 80) return;
      out[pid] = L().sanitizeState(raw[pid]); // an exception = the whole import is refused (e.g. an unknown version)
    });
    return out;
  }

  /** Saving an import: the part in the file replaces the flashcards; profiles not on the list are removed. */
  function applyImport(parsed, profileIds) {
    if (parsed) {
      storedIds().forEach(function (pid) { if (!parsed[pid]) removeProfile(pid); });
      Object.keys(parsed).forEach(function (pid) { memory[pid] = parsed[pid]; save(pid, true); });
    }
    if (profileIds) storedIds().forEach(function (pid) { if (profileIds.indexOf(pid) === -1) removeProfile(pid); });
  }

  function clearAll() { storedIds().forEach(removeProfile); }


  // Another browser tab saved flashcards: take over the newer ratings, so the next save from here does not undo them
  window.addEventListener("storage", function (e) {
    const prefix = LM.storage.profileKey("cards", "");
    if (!e.key || e.key.indexOf(prefix) !== 0 || /.corrupt$/.test(e.key)) return;
    const pid = e.key.slice(prefix.length);
    if (memory[pid] && mergeStored(pid) && app() && app().refreshLearning) app().refreshLearning();
  });

  LM.cardsStore = {
    mergeStored: mergeStored,
    keyOf: keyOf, data: data, load: load, save: save,
    exportData: exportData, parseImport: parseImport, applyImport: applyImport,
    removeProfile: removeProfile, clearAll: clearAll
  };
})(window.LM);
