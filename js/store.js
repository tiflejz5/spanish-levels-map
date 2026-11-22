/*
 * store.js — profiles and the "I know this" progress in localStorage, plus file download.
 *
 *   slm.profiles  { version: 1, activeId, profiles: [{ id, name, progress: { <topic id>: true } }] }
 *   slm.ui        { levelId } (device, convenience only)
 * Keys come from the registry in js/profile-data.js (LM.storage). Export, import, reset and profile deletion are
 * driven by that registry; this file provides the handler of the "profiles" entry (LM.store.profilesHandler).
 *
 * There is no content store (D3, D9): levels and topics come from LM.SYLLABUS (js/syllabus.js), never from storage.
 * No migrations: schemas start at version 1. A damaged save is copied to "<key>.corrupt" and the app starts empty.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const PROFILES_VERSION = 1;

  function profilesKey() { return LM.storage.key("profiles"); }
  function uiKey() { return LM.storage.key("ui"); }

  // ---------- localStorage access (always in try/catch) ----------

  /** Whether localStorage works (it can be blocked in private mode or by settings). */
  function isStorageAvailable() {
    try {
      const testKey = LM.storage.PREFIX + "test";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /** Writes text; returns { ok, error }. */
  function writeRaw(key, text) {
    try {
      window.localStorage.setItem(key, text);
      return { ok: true };
    } catch (e) {
      const quota = e && (e.name === "QuotaExceededError" || e.code === 22);
      return { ok: false, error: quota ? "The browser storage is full." : "The browser did not allow saving data." };
    }
  }

  function removeRaw(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* no access */ }
  }

  // ---------- Profiles ----------

  function normalizeProgress(raw) {
    if (!U.isPlainObject(raw)) throw new Error("Progress is not an object.");
    const clean = {};
    Object.keys(raw).forEach(function (key) { if (raw[key] === true) clean[key] = true; });
    return clean;
  }

  /**
   * Checks a profile list and returns a clean copy:
   *   { version: 1, activeId | null, profiles: [{ id, name, progress: { <topic id>: true } }] }
   * An empty list is valid (the app then shows the welcome screen).
   */
  function normalizeProfiles(raw) {
    if (!U.isPlainObject(raw) || !Array.isArray(raw.profiles)) throw new Error("No profile list (\"profiles\").");
    if (typeof raw.version !== "number" || raw.version > PROFILES_VERSION) throw new Error("Unsupported profile data version (" + raw.version + ").");
    const seen = new Set();
    const profiles = raw.profiles.filter(U.isPlainObject).map(function (p) {
      let id = typeof p.id === "string" ? p.id.trim() : "";
      if (!id || seen.has(id)) id = U.uid("p");
      seen.add(id);
      return {
        id: id,
        name: (typeof p.name === "string" ? p.name : "").trim() || "Unnamed profile",
        progress: U.isPlainObject(p.progress) ? normalizeProgress(p.progress) : {}
      };
    });
    const activeId = profiles.some(function (p) { return p.id === raw.activeId; }) ? raw.activeId : (profiles.length ? profiles[0].id : null);
    return { version: PROFILES_VERSION, activeId: activeId, profiles: profiles };
  }

  function emptyProfiles() { return { version: PROFILES_VERSION, activeId: null, profiles: [] }; }

  /** Loads the profiles: { status: "new" | "ok" | "corrupt", data }. */
  function loadProfiles() {
    const raw = readRaw(profilesKey());
    if (raw === null) return { status: "new", data: emptyProfiles() };
    try {
      return { status: "ok", data: normalizeProfiles(JSON.parse(raw)) };
    } catch (e) {
      writeRaw(profilesKey() + ".corrupt", raw);
      return { status: "corrupt", data: emptyProfiles() };
    }
  }

  function saveProfiles(profilesData) {
    return writeRaw(profilesKey(), JSON.stringify(profilesData));
  }

  /** Handler of the "profiles" registry entry (export, import, reset); see LM.storage in js/profile-data.js. */
  const profilesHandler = {
    exportData: function () { return JSON.parse(JSON.stringify((LM.state && LM.state.profiles) || emptyProfiles())); },
    parseImport: function (raw) {
      if (raw === undefined || raw === null) return null;
      try { return normalizeProfiles(raw); } catch (e) { throw new Error("Part \"profiles\": " + e.message); }
    },
    applyImport: function (parsed) {
      const data = parsed || emptyProfiles();
      if (LM.app && LM.app.replaceProfiles) LM.app.replaceProfiles(data);
      else saveProfiles(data);
    },
    clearAll: function () {
      removeRaw(profilesKey());
      removeRaw(profilesKey() + ".corrupt");
      if (LM.app && LM.app.replaceProfiles) LM.app.replaceProfiles(emptyProfiles(), { save: false });
    }
  };

  // ---------- Interface state (device, convenience only) ----------

  function loadUI() {
    const fallback = { levelId: LM.LEVEL_IDS[0] };
    try {
      const ui = JSON.parse(readRaw(uiKey()) || "null");
      if (!U.isPlainObject(ui)) return fallback;
      return { levelId: typeof ui.levelId === "string" ? ui.levelId : fallback.levelId };
    } catch (e) {
      return fallback;
    }
  }

  function saveUI(ui) { writeRaw(uiKey(), JSON.stringify(ui)); }

  // ---------- File download ----------

  /** Downloads an object as a .json file (Blob + link with the download attribute). */
  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = U.el("a", { href: url, download: filename });
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  LM.store = {
    PROFILES_VERSION: PROFILES_VERSION,
    isStorageAvailable: isStorageAvailable,
    normalizeProfiles: normalizeProfiles,
    emptyProfiles: emptyProfiles,
    loadProfiles: loadProfiles,
    saveProfiles: saveProfiles,
    profilesHandler: profilesHandler,
    loadUI: loadUI,
    saveUI: saveUI,
    downloadJSON: downloadJSON
  };
})(window.LM);
