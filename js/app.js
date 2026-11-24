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
    listScroll: 0 // scroll position of the level page, restored when coming back from a topic page
  };


  // =====================================================================
  // START
  // =====================================================================

  function init() {
    try {
      bindStaticEvents();
      state.storageOk = LM.store.isStorageAvailable();

      if (!state.storageOk) {
        // Without localStorage the app works, but only until the tab closes
        state.profiles = LM.store.emptyProfiles();
        syncProgress();
        addBanner("error", "Browser storage (localStorage) is not available, so changes will NOT be saved. " +
          "Check your browser settings (e.g. private mode, blocked cookies). You can import a backup and use the app until you close the tab.",
          { label: "Import a backup…", onClick: function () { LM.dataMenu.importAll(); } });
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
    // Topic pages: routes #/a1/… (a change of address = a change of view)
    window.addEventListener("hashchange", onRoute);
    // The side menu is a drawer on a phone
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
  // NAVIGATION
  // =====================================================================

  /** Route of a level page, e.g. "#/a1". */
  function levelHash(levelId) {
    return "#/" + String(levelId).toLowerCase();
  }

  /** Go to a level page (sidebar). Changes the address to #/a1 etc. */
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

  /** Reacts to a change of address (links, "Back", logo, the browser's back button). */
  function onRoute() {
    if (!state.profiles) return;
    const previous = state.view;
    const previousHash = state.lastHash;
    if (previous === "level") state.listScroll = U.getScroll();
    setNavOpen(false);
    if (LM.sidebar) LM.sidebar.afterNavigate();
    if (LM.motion) LM.motion.cleanup(); // clean up the previous page's animations (GSAP)
    applyRoute();
    syncSection();
    document.documentElement.classList.remove("focus-mode"); // a trainer's focus mode ends when the page changes
    state.lastHash = location.hash;
    if (state.view === "mistakes" && previousHash !== location.hash) LM.mistakes.onEnter(state.toolRoute);
    if (state.view === "placement" && previousHash !== location.hash) LM.placement.onEnter();
    if (state.view === "exercises" && previousHash !== location.hash) LM.exercises.onEnter(state.toolRoute);
    saveUI();
    if (state.view !== "page") document.title = LM.APP.appTitle + " (A1–C2)";
    if (state.view === "level" && previous === "page") {
      renderAll({ scrollTop: state.listScroll }); // back from a topic page: the same place in the list
    } else {
      renderAll({ resetScroll: true });
    }
    playViewEnter();
  }

  /** Short entrance animation of the content after a page change (CSS: .view-enter). */
  function playViewEnter() {
    const view = document.getElementById("view");
    if (!view) return;
    view.classList.remove("view-enter");
    void view.offsetWidth; // forces the animation to restart
    view.classList.add("view-enter");
  }

  /** Opens/closes the side menu as a drawer (narrow screen only). */
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
  // DRAWING
  // =====================================================================

  function renderAll(opts) {
    LM.profiles.render();
    LM.render.renderSidebar();
    LM.render.renderMain(opts);
  }


  /** Refreshes the learning badges in the left panel (e.g. the number of reviews due today). */
  function refreshLearning() {
    LM.render.renderToolsNav();
  }

  /** Refreshes counters and progress bars without redrawing the content (focus stays). */
  function refreshProgress() {
    LM.render.renderSidebar();
    LM.render.updateEssentialsProgress();
  }

  // =====================================================================
  // SAVING
  // =====================================================================

  /** Saves the profiles (each with its progress). */
  function saveProgressNow() {
    if (!state.storageOk) return;
    const res = LM.store.saveProfiles(state.profiles);
    if (!res.ok) reportSaveError("Your progress was not saved! " + res.error);
  }

  function saveUI() {
    if (state.storageOk) LM.store.saveUI(state.ui);
  }

  /** Save error: shows a banner (only once for the same message). */
  let lastSaveError = "";
  function reportSaveError(text) {
    if (text === lastSaveError) return;
    lastSaveError = text;
    addBanner("error", text + " Export your data so you do not lose your changes.");
  }

  // =====================================================================
  // LEARNER PROGRESS
  // =====================================================================

  function setProgress(essentialId, checked) {
    if (!getActiveProfile()) return; // without a profile there is nowhere to save progress
    if (checked) state.progress[essentialId] = true;
    else delete state.progress[essentialId];
    saveProgressNow();
    LM.markActivity(); // a change of "I know this" = a study day
    if (LM.celebrate) LM.celebrate.check(); // milestones of "I know this" and of levels
    refreshProgress();
  }

  // =====================================================================
  // REPLACING THE DATA (import / reset)
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

  /** The active profile, or null when there is no profile. */
  function getActiveProfile() {
    const p = state.profiles;
    if (!p || !p.profiles.length) return null;
    return p.profiles.find(function (x) { return x.id === p.activeId; }) || p.profiles[0];
  }

  function hasProfiles() {
    return !!getActiveProfile();
  }

  /**
   * Guest mode (spec v7 14, P1): runs an action that saves something. With a profile at once; without one it shows the
   * "Create a profile…" dialog and runs the action after the profile is created (the page stays). reason — a note in the dialog.
   */
  function withProfile(reason, fn) {
    if (getActiveProfile()) { fn(); return; }
    LM.profiles.requireProfile({ reason: reason }).then(function (ok) { if (ok) fn(); });
  }

  /** Sets state.progress to the active profile's progress (empty without a profile). */
  function syncProgress() {
    const active = getActiveProfile();
    state.profiles.activeId = active ? active.id : null;
    state.progress = active ? active.progress : {};
  }

  /** Adds a profile with the given name and makes it active. */
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

  /** After every change of profiles: recompute, save, redraw. */
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
  // MESSAGES AND ERROR SCREENS
  // =====================================================================

  /** Banner above the content. type: "info" | "warning" | "error". */
  function addBanner(type, text, action) {
    const banner = el("div", { class: "banner is-" + type, role: type === "error" ? "alert" : "status" }, [
      el("span", { class: "banner-text", text: text }),
      action ? el("button", { type: "button", class: "btn btn-small btn-secondary", onclick: action.onClick }, action.label) : null,
      el("button", {
        type: "button",
        class: "icon-btn",
        "aria-label": "Close message",
        "data-tooltip": "Close message",
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

  /** Last resort for an unexpected error. */
  function showFatal(err) {
    console.error(err);
    const view = document.getElementById("view");
    if (!view) return;
    view.replaceChildren(el("div", { class: "error-screen" }, [
      el("h1", { text: "Something went wrong" }),
      el("p", { text: "The app hit an unexpected error. Try reloading the page. If the problem comes back, import a backup from the “Data” menu." }),
      el("div", { class: "error-details", text: String(err && err.stack || err) }),
      el("div", { class: "error-actions" }, [
        el("button", { type: "button", class: "btn btn-primary", onclick: function () { location.reload(); } }, "Reload the page"),
        el("button", { type: "button", class: "btn btn-secondary", onclick: function () { LM.dataMenu.importAll(); } }, "Import data…")
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

  // Start once the page has loaded
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.LM);
