/*
 * cards-store.js — dane fiszek w localStorage (spec 10, sekcja 4).
 *
 *   Klucz per profil: slm.cards.<profileId>
 *   { version: 1, cards: { <id>: stan }, userDecks: [...], userCards: [...], settings: {...}, daily: { <dzień>: {...} } }
 *
 * Stan jest zapisywany tylko dla kart, które użytkownik ruszył (reszta = nowe). Zapis po każdej
 * zmianie, w try/catch; przy błędzie (np. brak miejsca) komunikat i praca dalej w pamięci.
 * Uszkodzony zapis jest odkładany jako slm.cards.<id>_corrupt_backup i zaczynamy od pustego.
 * Dane trafiają do eksportu (data.fiszki: { <profileId>: stan }), importu i resetu; stary plik
 * eksportu (bez data.fiszki) nie zmienia fiszek. Walidacja: LM.cardsLogic.sanitizeState.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const memory = {}; // { profileId: stan }
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
        try { window.localStorage.setItem(keyOf(pid) + ".corrupt", raw); } catch (e2) { /* trudno */ }
        data = null;
      }
    }
    memory[pid] = data || L().emptyState();
    return memory[pid];
  }

  /** Dołącza do pamięci to, co druga karta przeglądarki zapisała w międzyczasie (patrz fiszki-logic mergeStates). → true, gdy coś przejęto. */
  function mergeStored(pid) {
    if (!memory[pid]) return false;
    try {
      const raw = window.localStorage.getItem(keyOf(pid));
      return raw ? L().mergeStates(memory[pid], L().sanitizeState(JSON.parse(raw))) : false;
    } catch (e) { return false; }
  }

  /**
   * Zapis stanu profilu. Domyślnie scala go z zapisem w localStorage (dwie karty przeglądarki nie nadpisują sobie ocen);
   * force = true zapisuje stan z pamięci bez scalania (cofnięcie oceny, import), bo tam stan celowo się cofa albo zastępuje.
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
      if (!saveFailed && app() && app().reportSaveError) app().reportSaveError("Nie zapisano fiszek! Brak miejsca albo dostępu do pamięci przeglądarki – nauka trwa dalej, ale zmiany mogą zniknąć po zamknięciu strony.");
      saveFailed = true;
      return false;
    }
  }

  /** Stan aktywnego profilu (bez profilu — tymczasowy, niezapisywany). */
  function data() { return load(activeId()); }

  /** Profile, które mają zapis fiszek (do eksportu, resetu i porządkowania). */
  function storedIds() {
    const out = LM.storage.storedProfileIds("cards");
    Object.keys(memory).forEach(function (pid) { if (out.indexOf(pid) === -1) out.push(pid); });
    return out;
  }

  function removeProfile(pid) {
    delete memory[pid];
    try { window.localStorage.removeItem(keyOf(pid)); } catch (e) { /* brak dostępu */ }
  }

  /** Część eksportu: { <profileId>: stan } (tylko profile z danymi). */
  function exportData() {
    const out = {};
    storedIds().forEach(function (pid) { out[pid] = JSON.parse(JSON.stringify(load(pid))); });
    return out;
  }

  /** Część importu: brak (stary plik) → null; zły format → wyjątek z opisem. */
  function parseImport(raw) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Część „fiszki” pliku ma nieprawidłowy format.");
    const out = {};
    Object.keys(raw).slice(0, 500).forEach(function (pid) {
      if (typeof pid !== "string" || pid.length > 80) return;
      out[pid] = L().sanitizeState(raw[pid]); // wyjątek = cały import odrzucony (np. nieznana wersja)
    });
    return out;
  }

  /** Zapis importu: część obecna w pliku zastępuje fiszki; profile spoza listy są usuwane. */
  function applyImport(parsed, profileIds) {
    if (parsed) {
      storedIds().forEach(function (pid) { if (!parsed[pid]) removeProfile(pid); });
      Object.keys(parsed).forEach(function (pid) { memory[pid] = parsed[pid]; save(pid, true); });
    }
    if (profileIds) storedIds().forEach(function (pid) { if (profileIds.indexOf(pid) === -1) removeProfile(pid); });
  }

  function clearAll() { storedIds().forEach(removeProfile); }


  // Druga karta przeglądarki zapisała fiszki: przejmujemy nowsze oceny, żeby następny zapis stąd ich nie cofnął
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
