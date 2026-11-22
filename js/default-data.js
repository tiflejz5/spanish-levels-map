/*
 * default-data.js — dane startowe.
 *
 * Używane, gdy w przeglądarce nie ma jeszcze zapisanych treści
 * (pierwsze uruchomienie) oraz po „Resetuj dane”.
 *
 * Jeśli dołączony jest js/base-content.js, startujemy od bazowej listy
 * umiejętności. Bez niego startujemy od pustego szkieletu (poniżej).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  // Stała lista poziomów CEFR. Poziomów nie można usuwać w aplikacji.
  LM.LEVEL_IDS = ["A1", "A2", "B1", "B2", "C1", "C2"];

  // Kategorie, z którymi startuje PUSTA aplikacja.
  // Aby dodać kolejną kategorię domyślną, dopisz np.:
  //   { id: "cat_vocabulary", name: "Słownictwo" }
  // (id musi być unikalne i nie powinno się później zmieniać).
  // Uwaga: zmiana działa tylko dla nowych danych / po „Resetuj dane”.
  // Istniejące dane dodasz w aplikacji przyciskiem „+ Kategoria”.
  LM.DEFAULT_CATEGORIES = [
    { id: "cat_grammar", name: "Gramatyka i czasy" }
  ];

  // Profili nie ma w kodzie — każdy użytkownik tworzy własne (osoba, klasa,
  // grupa). Bez profilu aplikacja pokazuje ekran powitalny z „Dodaj profil”.
  // Profile i postęp „Umiem” zapisują się tylko w tej przeglądarce.

  /** Zwraca NOWĄ, pustą listę profili. */
  LM.createEmptyProfiles = function () {
    return { version: 1, activeId: null, profiles: [] };
  };

  /**
   * Dane startowe: bazowa lista z js/base-content.js (jeśli jest dołączona),
   * w przeciwnym razie pusty szkielet. Zawsze zwraca NOWĄ kopię.
   */
  LM.createDefaultData = function () {
    if (LM.BASE_CONTENT) return JSON.parse(JSON.stringify(LM.BASE_CONTENT));
    return LM.createEmptyData();
  };

  /** Zwraca NOWĄ kopię pustego szkieletu danych. */
  LM.createEmptyData = function () {
    const data = {
      version: 1,
      categories: LM.DEFAULT_CATEGORIES.map(function (c) {
        return { id: c.id, name: c.name };
      }),
      levels: []
    };

    LM.LEVEL_IDS.forEach(function (levelId) {
      const level = { id: levelId, description: "", content: {} };
      // Dla każdej kategorii pusta lista essentials i tematów
      data.categories.forEach(function (cat) {
        level.content[cat.id] = { essentials: [], topics: [] };
      });
      data.levels.push(level);
    });

    return data;
  };
})(window.LM);
