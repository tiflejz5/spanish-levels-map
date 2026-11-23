/*
 * trail-store.js — trail state in localStorage (spec v7 13, section 3).
 *
 *   Key per profile: slm.trail.<profileId>
 *   { version: 1, start: { level, source: "test"|"manual"|"default", at } | null,
 *     stops: { <stopId>: { done, via: "quiz"|"known"|"skip"|"set", best?, at } },
 *     reviews: { <checkpointId>: { best, of, at } } }
 *
 * Export / import / reset and profile deletion go through the storage key registry (js/profile-data.js),
 * like js/cards-store.js (a backup without the "trail" part leaves the data unchanged).
 * Validation: LM.trailLogic.sanitizeState. Without a profile: a temporary state, not saved.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const memory = {}; // { profileId: state }

  function L() { return LM.trailLogic; }
  function app() { return LM.app; }
  function keyOf(pid) { return LM.storage.profileKey("trail", pid); } // slm.trail.<profileId> (registry in js/profile-data.js)
  function activeId() { const p = app() && app().getActiveProfile(); return p ? p.id : null; }
  function stamp() { return new Date().toISOString(); }

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

  function save(pid) {
    pid = pid || activeId();
    if (!pid || !memory[pid]) return true;
    if (LM.state && LM.state.storageOk === false) return false;
    try { window.localStorage.setItem(keyOf(pid), JSON.stringify(memory[pid])); return true; } catch (e) {
      if (app() && app().reportSaveError) app().reportSaveError("Your trail progress was not saved! The browser storage is full or not available.");
      return false;
    }
  }

  /** State of the active profile (without a profile — temporary). */
  function data() { return load(activeId()); }

  // ---------- state changes ----------

  /** The start. source: "test" (placement result), "manual" (by hand), "default". A manual choice is never overwritten by a test. */
  function setStart(level, source, force) {
    if (!activeId() || L().LEVELS.indexOf(level) === -1) return false;
    const d = data();
    if (!force && source === "test" && d.start && d.start.source === "manual") return false;
    d.start = { level: level, source: source === "manual" || source === "test" ? source : "default", at: stamp() };
    return save();
  }

  /** A stop's quiz result (number of right answers); the best is kept. Passed at ≥ 3/4 (via "quiz"). */
  function recordQuiz(stopId, score) {
    if (!activeId()) return null;
    const d = data();
    const prev = d.stops[stopId];
    const prevBest = prev && prev.via === "quiz" && typeof prev.best === "number" ? prev.best : 0;
    const best = Math.max(score, prevBest);
    d.stops[stopId] = { done: best >= L().PASS_QUIZ, via: "quiz", best: best, at: stamp() };
    save();
    return d.stops[stopId];
  }

  function skipStop(stopId) {
    if (!activeId()) return false;
    const d = data();
    const cur = d.stops[stopId];
    if (cur && cur.via === "quiz" && cur.best >= L().PASS_QUIZ) return false; // passed by a quiz stays passed
    d.stops[stopId] = { done: false, via: "skip", at: stamp() };
    return save();
  }

  function unskipStop(stopId) {
    if (!activeId()) return false;
    const d = data();
    if (d.stops[stopId] && d.stops[stopId].via === "skip") { delete d.stops[stopId]; return save(); }
    return false;
  }

  function recordReview(id, best, of) {
    if (!activeId()) return null;
    const d = data();
    const prev = d.reviews[id];
    d.reviews[id] = { best: Math.max(best, prev ? prev.best : 0), of: of, at: stamp() };
    save();
    return d.reviews[id];
  }

  // ---------- profiles, export, import, reset ----------

  function storedIds() {
    const out = LM.storage.storedProfileIds("trail");
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
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("The “trail” part of the file has a wrong format.");
    const out = {};
    Object.keys(raw).slice(0, 500).forEach(function (pid) {
      if (typeof pid !== "string" || pid.length > 80) return;
      out[pid] = L().sanitizeState(raw[pid]); // an exception = the whole import is refused
    });
    return out;
  }

  /** Saving an import: the part in the file replaces the trail data; profiles not on the list are removed. */
  function applyImport(parsed, profileIds) {
    if (parsed) {
      storedIds().forEach(function (pid) { if (!parsed[pid]) removeProfile(pid); });
      Object.keys(parsed).forEach(function (pid) { memory[pid] = parsed[pid]; save(pid); });
    }
    if (profileIds) storedIds().forEach(function (pid) { if (profileIds.indexOf(pid) === -1) removeProfile(pid); });
  }

  function clearAll() { storedIds().forEach(removeProfile); }

  LM.trailStore = {
    keyOf: keyOf, load: load, data: data, save: save,
    setStart: setStart, recordQuiz: recordQuiz, skipStop: skipStop, unskipStop: unskipStop, recordReview: recordReview,
    exportData: exportData, parseImport: parseImport, applyImport: applyImport, removeProfile: removeProfile, clearAll: clearAll
  };
})(window.LM);
