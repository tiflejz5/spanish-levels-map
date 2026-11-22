/*
 * data-menu.js — kopie zapasowe i reset danych (sekcja „Dane” w menu profilu).
 *
 * Eksport: jeden plik english-levels-dane-RRRR-MM-DD.json:
 *   { app, kind: "backup", version: 2, exportedAt,
 *     data: { content: <eksport treści>, progress: <eksport profili i postępu>,
 *             learning: { journal, activity, levelTest, celebrated, exercises } } }
 *   learning (od wersji 2) — dane nauki każdego profilu (js/profile-data.js).
 * Import przyjmuje ten plik, kopie w wersji 1 (bez „learning”) oraz starsze,
 * osobne pliki z treściami (english-levels-content-…) i z postępem
 * (english-levels-progress-…).
 * Dane zakładki „Certyfikat C1” (elm_c1_v1) nie są eksportowane ani resetowane.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  function app() { return LM.app; }

  // ---------- Eksport ----------

  function exportAll() {
    app().saveContentNow();
    LM.store.downloadJSON("english-levels-dane-" + U.dateStamp() + ".json", {
      app: "english-levels-map",
      kind: "backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {
        content: LM.store.wrapExport("content", LM.state.content),
        progress: LM.store.wrapExport("progress", LM.state.profiles),
        learning: LM.profileData.exportData(),
        // Fiszki (js/cards-store.js): { <profileId>: stan } — nowa część, starsze pliki jej nie mają
        fiszki: LM.cardsStore ? LM.cardsStore.exportData() : undefined,
        // Szlak (js/trail-store.js): { <profileId>: stan } — nowa część, starsze pliki jej nie mają
        szlak: LM.trailStore ? LM.trailStore.exportData() : undefined
      }
    });
  }

  // ---------- Import ----------

  /** Otwiera okno wyboru pliku i zwraca jego tekst (Promise). */
  function pickFileText() {
    return new Promise(function (resolve) {
      const input = el("input", { type: "file", accept: ".json,application/json" });
      input.addEventListener("change", function () {
        const file = input.files && input.files[0];
        if (!file) return;
        file.text().then(resolve, function () {
          LM.dialogs.alert({ title: "Błąd odczytu", message: "Nie udało się odczytać pliku." });
        });
      });
      input.click();
    });
  }

  function importAll() {
    pickFileText().then(importText);
  }

  /** Rozpoznaje rodzaj pliku i uruchamia właściwy import. */
  function importText(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      return LM.dialogs.alert({ title: "Nie można zaimportować danych", message: "Plik nie jest poprawnym plikiem JSON." });
    }
    if (!U.isPlainObject(obj)) {
      return LM.dialogs.alert({ title: "Nie można zaimportować danych", message: "Plik nie zawiera danych tej aplikacji." });
    }
    if (obj.kind === "backup") return importBackup(obj);
    const looksLikeProgress = obj.kind === "progress" || Array.isArray(obj.profiles) ||
      (U.isPlainObject(obj.data) && Array.isArray(obj.data.profiles));
    return looksLikeProgress ? importProgressText(text) : importContentText(text);
  }

  /** Plik z obiema częściami: walidacja obu → jedno potwierdzenie → zapis. */
  function importBackup(obj) {
    let content, profiles, learning, fiszki, szlak;
    try {
      if (!U.isPlainObject(obj.data) || !obj.data.content || !obj.data.progress) throw new Error("Plik kopii jest niekompletny.");
      if (typeof obj.version === "number" && obj.version > 2) throw new Error("Plik pochodzi z nowszej wersji aplikacji. Zaktualizuj pliki strony.");
      learning = LM.profileData.parseImport(obj.data.learning);
      fiszki = LM.cardsStore ? LM.cardsStore.parseImport(obj.data.fiszki) : null; // brak w starym pliku → null
      szlak = LM.trailStore ? LM.trailStore.parseImport(obj.data.szlak) : null;     // brak w starym pliku → null
      content = LM.store.parseContentImport(JSON.stringify(obj.data.content));
      const parsed = LM.store.parseProgressImport(JSON.stringify(obj.data.progress));
      if (parsed.type !== "profiles") throw new Error("Kopia nie zawiera listy profili.");
      profiles = parsed.data;
    } catch (e) {
      return LM.dialogs.alert({ title: "Nie można zaimportować danych", message: e.message });
    }
    const s = summarize(content);
    const ls = LM.profileData.summarizeImport(learning);
    return LM.dialogs.confirm({
      title: "Zastąpić dane w tej przeglądarce?",
      message: "Plik zawiera: kategorie: " + s.categories + ", punkty essentials: " + s.essentials +
        ", profile (" + profiles.profiles.length + "): " + (profiles.profiles.map(function (p) { return p.name; }).join(", ") || "brak") +
        (ls ? ", wpisy w dzienniku błędów: " + ls.journalEntries : "") +
        ".\n\nObecne treści, profile i ich postęp w tej przeglądarce zostaną zastąpione." +
        (learning ? "" : "\n\nTo starsza kopia bez dziennika błędów i serii nauki – te dane zostaną zachowane dla profili o tych samych identyfikatorach."),
      confirmLabel: "Importuj i nadpisz"
    }).then(function (ok) {
      if (!ok) return false;
      app().replaceContent(content);
      app().replaceProfiles(profiles, learning, fiszki, szlak);
      LM.dialogs.alert({ title: "Gotowe", message: "Dane zostały zaimportowane." });
      return true;
    });
  }

  /** Import treści z tekstu JSON: walidacja → podsumowanie → potwierdzenie → zapis. */
  function importContentText(text) {
    let data;
    try {
      data = LM.store.parseContentImport(text);
    } catch (e) {
      return LM.dialogs.alert({ title: "Nie można zaimportować treści", message: e.message });
    }
    const s = summarize(data);
    return LM.dialogs.confirm({
      title: "Zastąpić obecne treści?",
      message: "Plik zawiera: kategorie: " + s.categories + ", punkty essentials: " + s.essentials + ".\n\n" +
        "Obecne treści w tej przeglądarce zostaną nadpisane. Profile i ich postęp pozostaną bez zmian.",
      confirmLabel: "Importuj i nadpisz"
    }).then(function (ok) {
      if (!ok) return false;
      app().replaceContent(data);
      LM.dialogs.alert({ title: "Gotowe", message: "Treści zostały zaimportowane." });
      return true;
    });
  }

  /**
   * Import postępu. Nowy format (profile) zastępuje wszystkie profile.
   * Stary format (postęp jednej osoby) trafia do aktywnego profilu.
   */
  function importProgressText(text) {
    let parsed;
    try {
      parsed = LM.store.parseProgressImport(text);
    } catch (e) {
      return LM.dialogs.alert({ title: "Nie można zaimportować postępu", message: e.message });
    }
    const active = app().getActiveProfile();
    const isProfiles = parsed.type === "profiles";
    if (!isProfiles && !active) {
      return LM.dialogs.alert({ title: "Najpierw dodaj profil", message: "Ten plik zawiera postęp jednej osoby (starszy format). Dodaj profil, a potem zaimportuj plik ponownie – postęp trafi do tego profilu." });
    }
    const message = isProfiles
      ? "Plik zawiera profile (" + parsed.data.profiles.length + "): " +
        parsed.data.profiles.map(function (p) { return p.name; }).join(", ") +
        ".\n\nWszystkie obecne profile i ich postęp w tej przeglądarce zostaną zastąpione."
      : "Plik zawiera postęp jednej osoby (starszy format), zaznaczeń „Umiem”: " + Object.keys(parsed.progress).length +
        ".\n\nZostanie wczytany do profilu „" + active.name + "” i zastąpi jego obecny postęp.";
    return LM.dialogs.confirm({
      title: isProfiles ? "Zastąpić profile?" : "Zastąpić postęp profilu?",
      message: message,
      confirmLabel: "Importuj i nadpisz"
    }).then(function (ok) {
      if (!ok) return false;
      if (isProfiles) app().replaceProfiles(parsed.data);
      else app().replaceProgress(parsed.progress);
      LM.dialogs.alert({ title: "Gotowe", message: "Postęp został zaimportowany." });
      return true;
    });
  }

  function summarize(data) {
    const s = { categories: data.categories.length, essentials: 0 };
    data.levels.forEach(function (level) {
      Object.keys(level.content).forEach(function (catId) {
        s.essentials += level.content[catId].essentials.length;
      });
    });
    return s;
  }

  // ---------- Reset ----------

  /** Reset danych — podwójne potwierdzenie z zaleceniem eksportu. */
  function resetAll() {
    LM.dialogs.confirm({
      title: "Zresetować dane?",
      message: "Zostaną usunięte wszystkie profile z ich postępem „Umiem”, dziennikiem błędów, serią nauki, wynikami testu poziomu i fiszkami oraz zmiany w treści listy. " +
        "Aplikacja wróci do stanu jak przy pierwszym otwarciu: bazowa lista umiejętności, bez żadnych profili.\n\n" +
        "Zalecenie: najpierw zrób „Eksportuj dane”, żeby mieć kopię.\n\n" +
        "Dane zakładki „Certyfikat C1” (wyniki ćwiczeń, szkice, data egzaminu) zostają.",
      confirmLabel: "Dalej"
    }).then(function (ok) {
      if (!ok) return false;
      return LM.dialogs.confirm({
        title: "Na pewno?",
        message: "To ostatnie ostrzeżenie. Tej operacji nie można cofnąć. Jeśli nie masz kopii, anuluj i najpierw zrób eksport.",
        confirmLabel: "Tak, usuń dane"
      });
    }).then(function (ok) {
      if (!ok) return;
      LM.store.clearAll();
      LM.profileData.clearAll();
      if (LM.cardsStore) LM.cardsStore.clearAll(); // fiszki wszystkich profili (elm.<id>.fiszki)
      if (LM.trailStore) LM.trailStore.clearAll(); // Szlak wszystkich profili (elm.<id>.szlak)
      if (LM.search) LM.search.clearRecent(); // ostatnie wyszukiwania (na urządzeniu)
      app().replaceProfiles(LM.createEmptyProfiles());
      app().replaceContent(LM.createDefaultData());
    });
  }

  LM.dataMenu = {
    exportAll: exportAll,
    importAll: importAll,
    importText: importText,
    importContentText: importContentText,
    importProgressText: importProgressText,
    resetAll: resetAll
  };
})(window.LM);
