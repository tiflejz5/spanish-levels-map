/*
 * app.js — start of the app, state, events and saving.
 *
 * LM.state holds what the app knows right now:
 *   profiles  — profiles, each with its own progress (saved in slm.profiles)
 *   progress  — progress of the ACTIVE profile ({ <topic id>: true }, a reference into profiles)
 *   ui        — selected level (slm.ui)
 *   view      — what is shown (see ROUTES below): "home", "level", "page", a tool view, or "notfound"
 *   route     — the topic page / cheat sheet route ({ kind, topicId | level }) or null
 *   toolRoute — the route object of a tool view (from that module's parseRoute) or null
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const state = LM.state = {
    profiles: null,
    progress: {},
    ui: { levelId: "A1" },
    storageOk: true,
    view: "home",
    route: null,
    toolRoute: null,
    listScroll: 0 // pozycja przewinięcia listy, przywracana po powrocie z podstrony
  };


  // =====================================================================
  // START
  // =====================================================================

  function init() {
    try {
      bindStaticEvents();
      state.storageOk = LM.store.isStorageAvailable();

      if (!state.storageOk) {
        // Bez localStorage aplikacja działa, ale tylko do zamknięcia karty
        state.profiles = LM.store.emptyProfiles();
        syncProgress();
        addBanner("error", "Pamięć przeglądarki (localStorage) jest niedostępna, więc zmiany NIE będą zapisywane. " +
          "Sprawdź ustawienia przeglądarki (np. tryb prywatny, blokada plików cookie). Możesz zaimportować kopię i korzystać ze strony do zamknięcia karty.",
          { label: "Importuj kopię…", onClick: function () { LM.dataMenu.importAll(); } });
        fixUi();
        applyRoute();
        renderAll();
        return;
      }

      const prof = LM.store.loadProfiles();
      state.profiles = prof.data;
      state.ui = LM.store.loadUI();
      syncProgress();
      if (prof.status === "corrupt") {
        showCorruptScreen();
        return;
      }
      if (prof.status === "new") LM.store.saveProfiles(state.profiles);

      fixUi();
      if (LM.celebrate) LM.celebrate.baseline();
      applyRoute();
      syncSection();
      renderAll();
    } catch (err) {
      showFatal(err);
    }
  }

  function bindStaticEvents() {
    LM.profiles.bindEvents();
    // Zapisz zaległe zmiany przy zamykaniu / chowaniu karty
    // Podstrony niezbędnika: adresy #/a1/… (zmiana adresu = zmiana widoku)
    window.addEventListener("hashchange", onRoute);
    // Menu boczne jako szuflada na telefonie
    document.getElementById("menu-btn").addEventListener("click", function () { setNavOpen(!document.body.classList.contains("nav-open")); });
    document.getElementById("nav-overlay").addEventListener("click", function () { setNavOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("nav-open") && !document.querySelector("dialog[open]")) {
        setNavOpen(false);
        document.getElementById("menu-btn").focus();
      }
    });
  }

  /** Keeps the selected level valid. */
  function fixUi() {
    if (LM.LEVEL_IDS.indexOf(state.ui.levelId) === -1) state.ui.levelId = LM.LEVEL_IDS[0];
  }

  // =====================================================================
  // DATA ACCESS (levels and topics come from LM.SYLLABUS through LM.syl, spec 06 E2)
  // =====================================================================

  function getActiveLevel() {
    return LM.syl.level(state.ui.levelId) || LM.syl.levels()[0];
  }

  /** Progress of a whole level for the active profile: ticked topics / all topics. */
  function getLevelStats(levelId) {
    return LM.syl.stats(levelId, state.progress);
  }

  // =====================================================================
  // NAWIGACJA
  // =====================================================================

  /** Adres listy poziomu, np. "#/a1". */
  function levelHash(levelId) {
    return "#/" + String(levelId).toLowerCase();
  }

  /** Przejście do listy poziomu (sidebar). Zmienia adres na #/a1 itd. */
  function selectLevel(levelId) {
    state.ui.levelId = levelId;
    saveUI();
    state.listScroll = 0;
    if (location.hash === levelHash(levelId)) renderAll({ resetScroll: true });
    else location.hash = levelHash(levelId);
  }

  // =====================================================================
  // ROUTES (hash routing, English paths, no legacy redirects — spec 02 §6)
  //   "" or "#/"                    home
  //   "#/a1" … "#/c2"               level page
  //   "#/a1/<category>-<slug>"      topic page; "#/a1/cheatsheet" cheat sheet (js/handbook.js)
  //   "#/a1/test"                   level final test (js/exercise-engine.js → js/final.js)
  //   the tool views below, each matched by its own module's parseRoute
  //   anything else                 "Page not found" with a link home
  // =====================================================================

  /** Tool views in match order: view name and the module whose parseRoute claims the hash. */
  const ROUTES = [
    ["placement", function () { return LM.placement; }],   // #/placement
    ["today", function () { return LM.today; }],           // #/today
    ["review", function () { return LM.review; }],         // #/review
    ["mistakes", function () { return LM.mistakes; }],     // #/review/mistakes
    ["cards", function () { return LM.cards; }],           // #/review/decks[/…], #/review/words, #/review/session
    ["exercises", function () { return LM.exercises; }],   // #/practice[/…], #/a1/test
    ["lab", function () { return LM.lab; }],               // #/lab[/…]
    ["stats", function () { return LM.statsPage; }],       // #/stats
    ["notes", function () { return LM.notes; }],           // #/notes
    ["trail", function () { return LM.trail; }],           // #/trail
    ["writing", function () { return LM.writing; }],       // #/writing[/…]
    ["exam", function () { return LM.exams; }]             // #/exams/<exam id>[/…]
  ];

  /** Reads the hash and sets state.view, state.route, state.toolRoute and the selected level. */
  function applyRoute() {
    const hash = location.hash || "";
    state.route = null;
    state.toolRoute = null;
    if (!hash || hash === "#" || hash === "#/") { state.view = "home"; return; }
    const level = /^#\/([abc][12])\/?$/i.exec(hash);
    if (level && LM.LEVEL_IDS.indexOf(level[1].toUpperCase()) !== -1) {
      state.view = "level";
      state.ui.levelId = level[1].toUpperCase();
      return;
    }
    for (let i = 0; i < ROUTES.length; i++) {
      const mod = ROUTES[i][1]();
      const r = mod && mod.parseRoute ? mod.parseRoute(hash) : null;
      if (!r) continue;
      state.view = ROUTES[i][0];
      state.toolRoute = r;
      if (r.kind === "final" && LM.LEVEL_IDS.indexOf(r.id) !== -1) state.ui.levelId = r.id;
      return;
    }
    const page = LM.handbook.parseRoute(hash);
    if (page) {
      state.view = "page";
      state.route = page;
      state.ui.levelId = page.level;
      return;
    }
    state.view = "notfound";
  }

  /** Visual scope of the section: html[data-section="<exam id>"] inside an exam, "app" elsewhere (css/style.css). */
  function syncSection() {
    document.documentElement.setAttribute("data-section", state.view === "exam" && state.toolRoute ? state.toolRoute.examId : "app");
  }

  /** Reakcja na zmianę adresu (linki, „Wróć”, logo, przycisk Wstecz). */
  function onRoute() {
    if (!state.profiles) return;
    const previous = state.view;
    const previousHash = state.lastHash;
    if (previous === "level") state.listScroll = U.getScroll();
    setNavOpen(false);
    if (LM.sidebar) LM.sidebar.afterNavigate();
    if (LM.motion) LM.motion.cleanup(); // animacje poprzedniej strony (GSAP) sprzątamy
    applyRoute();
    syncSection();
    document.documentElement.classList.remove("focus-mode"); // tryb skupienia trenera kończy się przy zmianie strony
    state.lastHash = location.hash;
    if (state.view === "mistakes" && previousHash !== location.hash) LM.mistakes.onEnter(state.toolRoute);
    if (state.view === "placement" && previousHash !== location.hash) LM.placement.onEnter();
    if (state.view === "exercises" && previousHash !== location.hash) LM.exercises.onEnter(state.toolRoute);
    saveUI();
    if (state.view !== "page") document.title = LM.APP.appTitle + " (A1–C2)";
    if (state.view === "level" && previous === "page") {
      renderAll({ scrollTop: state.listScroll }); // powrót z podstrony: to samo miejsce listy
    } else {
      renderAll({ resetScroll: true });
    }
    playViewEnter();
  }

  /** Krótka animacja wejścia treści po zmianie strony (CSS: .view-enter). */
  function playViewEnter() {
    const view = document.getElementById("view");
    if (!view) return;
    view.classList.remove("view-enter");
    void view.offsetWidth; // wymusza ponowne uruchomienie animacji
    view.classList.add("view-enter");
  }

  /** Otwiera/zamyka menu boczne jako szufladę (tylko wąski ekran). */
  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    document.getElementById("nav-overlay").hidden = !open;
    document.getElementById("menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const first = document.querySelector("#sidebar a, #sidebar button");
      if (first) first.focus();
    }
  }

  /** Back from a topic page to its level page (same scroll position as before). */
  function goToList(target) {
    if (target.levelId) state.ui.levelId = target.levelId;
    saveUI();
    const hash = levelHash(state.ui.levelId);
    if (location.hash === hash) onRoute();
    else location.hash = hash;
  }

  // =====================================================================
  // RYSOWANIE
  // =====================================================================

  function renderAll(opts) {
    LM.profiles.render();
    LM.render.renderSidebar();
    LM.render.renderMain(opts);
  }

  function renderMainOnly(opts) {
    LM.render.renderMain(opts);
  }

  /** Odświeża plakietki nauki w lewym panelu (np. liczbę powtórek na dziś). */
  function refreshLearning() {
    LM.render.renderToolsNav();
  }

  /** Odświeża liczniki i paski postępu bez przerysowania treści (fokus zostaje). */
  function refreshProgress() {
    LM.render.renderSidebar();
    LM.render.updateEssentialsProgress();
  }

  // =====================================================================
  // ZAPIS
  // =====================================================================

  /** Zapisuje profile (razem z postępem każdego z nich). */
  function saveProgressNow() {
    if (!state.storageOk) return;
    const res = LM.store.saveProfiles(state.profiles);
    if (!res.ok) reportSaveError("Nie zapisano postępu! " + res.error);
  }

  function saveUI() {
    if (state.storageOk) LM.store.saveUI(state.ui);
  }

  /** Błąd zapisu: pokazujemy baner (tylko raz dla tego samego komunikatu). */
  let lastSaveError = "";
  function reportSaveError(text) {
    if (text === lastSaveError) return;
    lastSaveError = text;
    addBanner("error", text + " Zrób eksport danych, żeby nie stracić zmian.");
  }

  // =====================================================================
  // POSTĘP UCZNIA
  // =====================================================================

  function setProgress(essentialId, checked) {
    if (!getActiveProfile()) return; // bez profilu nie ma gdzie zapisać postępu
    if (checked) state.progress[essentialId] = true;
    else delete state.progress[essentialId];
    saveProgressNow();
    LM.markActivity(); // zmiana „Umiem” = dzień nauki
    if (LM.celebrate) LM.celebrate.check(); // kamienie milowe „Umiem” i poziomów
    refreshProgress();
  }

  // =====================================================================
  // PODMIANA DANYCH (import / reset)
  // =====================================================================

  /**
   * Replaces the profile list (import / reset, through LM.storage in js/profile-data.js). Data of the other registry
   * entries is replaced by their own handlers. opts.save === false: do not write the list back (reset removed the key).
   */
  function replaceProfiles(profilesData, opts) {
    state.profiles = profilesData;
    if (opts && opts.save === false) {
      syncProgress();
      if (LM.celebrate) LM.celebrate.baseline();
      renderAll();
      return;
    }
    profilesChanged();
  }

  // =====================================================================
  // PROFILE
  // =====================================================================

  /** Aktywny profil albo null, gdy nie ma żadnego profilu. */
  function getActiveProfile() {
    const p = state.profiles;
    if (!p || !p.profiles.length) return null;
    return p.profiles.find(function (x) { return x.id === p.activeId; }) || p.profiles[0];
  }

  function hasProfiles() {
    return !!getActiveProfile();
  }

  /**
   * Tryb gościa (spec v7 14, P1): wykonuje akcję zapisującą. Z profilem od razu; bez profilu pokazuje okno
   * „Utwórz profil…” i wykonuje akcję po jego utworzeniu (strona zostaje ta sama). reason — dopisek w oknie.
   */
  function withProfile(reason, fn) {
    if (getActiveProfile()) { fn(); return; }
    LM.profiles.requireProfile({ reason: reason }).then(function (ok) { if (ok) fn(); });
  }

  /** Ustawia state.progress na postęp aktywnego profilu (bez profilu: pusty). */
  function syncProgress() {
    const active = getActiveProfile();
    state.profiles.activeId = active ? active.id : null;
    state.progress = active ? active.progress : {};
  }

  /** Dodaje profil o podanej nazwie i ustawia go jako aktywny. */
  function addProfile(name) {
    const profile = { id: U.uid("p"), name: String(name).trim(), progress: {} };
    state.profiles.profiles.push(profile);
    state.profiles.activeId = profile.id;
    profilesChanged();
    return profile;
  }

  function selectProfile(profileId) {
    state.profiles.activeId = profileId;
    profilesChanged();
  }

  /** Po każdej zmianie profili: przelicz, zapisz, przerysuj. */
  function profilesChanged() {
    syncProgress();
    saveProgressNow();
    if (LM.celebrate) LM.celebrate.baseline();
    renderAll();
  }

  /** Number of ticked topics in a profile (only topics that exist in the syllabus). */
  function countDone(progress) {
    return LM.syl.countDone(progress);
  }

  // =====================================================================
  // KOMUNIKATY I EKRANY BŁĘDÓW
  // =====================================================================

  /** Baner nad treścią. type: "info" | "warning" | "error". */
  function addBanner(type, text, action) {
    const banner = el("div", { class: "banner is-" + type, role: type === "error" ? "alert" : "status" }, [
      el("span", { class: "banner-text", text: text }),
      action ? el("button", { type: "button", class: "btn btn-small btn-secondary", onclick: action.onClick }, action.label) : null,
      el("button", {
        type: "button",
        class: "icon-btn",
        "aria-label": "Zamknij komunikat",
        "data-tooltip": "Zamknij komunikat",
        "data-tooltip-align": "end",
        onclick: function () { banner.remove(); }
      }, LM.icon("x", { size: 18 }))
    ]);
    document.getElementById("banners").appendChild(banner);
  }

  /**
   * Screen shown when the saved profile list is damaged, instead of a blank page. The damaged text was copied to
   * "<key>.corrupt" by LM.store.loadProfiles; nothing else has been changed yet.
   */
  function showCorruptScreen() {
    document.getElementById("level-list").replaceChildren();
    const key = LM.storage.key("profiles");
    let raw = "";
    try { raw = window.localStorage.getItem(key + ".corrupt") || ""; } catch (e) { raw = ""; }
    const view = document.getElementById("view");
    view.replaceChildren(el("div", { class: "error-screen" }, [
      el("h1", { text: "Your saved profiles could not be read" }),
      el("p", { text: "The data saved in this browser is damaged or has an unknown format. Nothing has been deleted yet." }),
      el("p", { text: "Import your latest backup (" + LM.APP.exportName + "-….json), download the damaged data, or start again without profiles." }),
      el("div", { class: "error-actions" }, [
        el("button", { type: "button", class: "btn btn-primary", onclick: function () { LM.dataMenu.importAll(); } }, "Import a backup…"),
        el("button", {
          type: "button",
          class: "btn btn-secondary",
          onclick: function () {
            const blob = new Blob([raw], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = el("a", { href: url, download: LM.APP.exportName + "-damaged-" + U.dateStamp() + ".txt" });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
          }
        }, "Download the damaged data"),
        el("button", {
          type: "button",
          class: "btn btn-danger",
          onclick: function () {
            LM.dialogs.confirm({
              title: "Start without profiles?",
              message: "The damaged data stays in a safety copy in this browser. The app starts with no profiles.",
              confirmLabel: "Start again"
            }).then(function (ok) {
              if (!ok) return;
              LM.store.saveProfiles(state.profiles);
              fixUi();
              applyRoute();
              syncSection();
              renderAll();
            });
          }
        }, "Start without profiles")
      ])
    ]));
  }

  /** Ostatnia deska ratunku przy nieoczekiwanym błędzie. */
  function showFatal(err) {
    console.error(err);
    const view = document.getElementById("view");
    if (!view) return;
    view.replaceChildren(el("div", { class: "error-screen" }, [
      el("h1", { text: "Coś poszło nie tak" }),
      el("p", { text: "Aplikacja napotkała nieoczekiwany błąd. Spróbuj odświeżyć stronę. Jeśli problem wraca, zaimportuj kopię zapasową w menu „Dane”." }),
      el("div", { class: "error-details", text: String(err && err.stack || err) }),
      el("div", { class: "error-actions" }, [
        el("button", { type: "button", class: "btn btn-primary", onclick: function () { location.reload(); } }, "Odśwież stronę"),
        el("button", { type: "button", class: "btn btn-secondary", onclick: function () { LM.dataMenu.importAll(); } }, "Importuj dane…")
      ])
    ]));
  }

  LM.app = {
    init: init,
    getActiveLevel: getActiveLevel,
    getLevelStats: getLevelStats,
    selectLevel: selectLevel,
    levelHash: levelHash,
    goToList: goToList,
    refreshProgress: refreshProgress,
    refreshLearning: refreshLearning,
    reportSaveError: reportSaveError,
    saveProgressNow: saveProgressNow,
    saveUI: saveUI,
    setProgress: setProgress,
    replaceProfiles: replaceProfiles,
    getActiveProfile: getActiveProfile,
    hasProfiles: hasProfiles,
    withProfile: withProfile,
    renderAll: renderAll,
    addProfile: addProfile,
    selectProfile: selectProfile,
    profilesChanged: profilesChanged,
    countDone: countDone
  };

  // Start po wczytaniu strony
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.LM);
