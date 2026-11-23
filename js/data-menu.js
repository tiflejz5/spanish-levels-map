/*
 * data-menu.js — backups and reset (the "Data" section of the profile menu), spec 02 §5.
 *
 * Export: one file spanish-levels-map-YYYY-MM-DD.json
 *   { app: "spanish-levels-map", kind: "backup", version: 1, exportedAt, data: { <registry entry id>: … } }
 * Every part comes from the storage key registry (LM.storage, js/profile-data.js): profiles, learning data,
 * flashcards and trail state of every profile. Device settings (theme, sidebar) are not exported.
 * Import accepts only this app's backup files (a file of another app is refused with a clear message).
 * Reset removes everything the registry lists except the device's theme and sidebar.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  function app() { return LM.app; }

  // ---------- Export ----------

  function exportAll() {
    LM.store.downloadJSON(LM.storage.backupFileName(), LM.storage.exportBackup());
  }

  // ---------- Import ----------

  /** Opens the file picker and resolves with the file text. */
  function pickFileText() {
    return new Promise(function (resolve) {
      const input = el("input", { type: "file", accept: ".json,application/json" });
      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        if (!file) return;
        file.text().then(resolve, function () {
          LM.dialogs.alert({ title: "Could not read the file", message: "The file could not be read." });
        });
      });
      input.click();
    });
  }

  function importAll() {
    pickFileText().then(importText);
  }

  function fail(message) {
    return LM.dialogs.alert({ title: "Cannot import the data", message: message });
  }

  /** Checks the file, shows what it contains, and replaces the data after one confirmation. */
  function importText(text) {
    let obj, parsed;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return fail("The file is not a valid JSON file.");
    }
    try {
      parsed = LM.storage.parseBackup(obj);
    } catch (e) {
      return fail(e.message);
    }
    const profiles = parsed.profiles.profiles;
    let entries = 0;
    if (parsed.journal) Object.keys(parsed.journal.profiles).forEach(function (pid) { entries += parsed.journal.profiles[pid].entries.length; });
    return LM.dialogs.confirm({
      title: "Replace the data in this browser?",
      message: "The file contains " + LM.plural(profiles.length, "profile") +
        (profiles.length ? " (" + profiles.map(function (p) { return p.name; }).join(", ") + ")" : "") +
        " and " + LM.plural(entries, "mistake log entry", "mistake log entries") + ".\n\n" +
        "All profiles, their progress, flashcards and other learning data in this browser will be replaced.",
      confirmLabel: "Import and replace"
    }).then(function (ok) {
      if (!ok) return false;
      LM.storage.applyBackup(parsed);
      app().renderAll();
      LM.dialogs.alert({ title: "Done", message: "The data has been imported." });
      return true;
    });
  }

  // ---------- Reset ----------

  /** Reset — double confirmation, with the advice to export first. */
  function resetAll() {
    LM.dialogs.confirm({
      title: "Reset all data?",
      message: "All profiles will be deleted together with their progress, mistake log, streak, test results, flashcards and trail. " +
        "The app goes back to how it was on the first visit.\n\nTip: export your data first, so you have a copy.",
      confirmLabel: "Continue"
    }).then(function (ok) {
      if (!ok) return false;
      return LM.dialogs.confirm({
        title: "Are you sure?",
        message: "This is the last warning. This cannot be undone. If you have no copy, cancel and export first.",
        confirmLabel: "Yes, delete the data"
      });
    }).then(function (ok) {
      if (!ok) return;
      LM.storage.resetAll();
      app().renderAll({ resetScroll: true });
    });
  }

  LM.dataMenu = {
    exportAll: exportAll,
    importAll: importAll,
    importText: importText,
    resetAll: resetAll
  };
})(window.LM);
