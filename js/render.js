/*
 * render.js — rysowanie widoków: lewy panel (poziomy), nagłówek poziomu,
 * kategorie, lista essentials z polem „Umiem” i podsumowanie poziomu.
 *
 * Treść listy jest tylko do odczytu (dawny „Tryb edycji” został usunięty).
 * Każdy tekst trafia do DOM jako tekst (textContent), nigdy jako HTML.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  // Skróty do innych części aplikacji (ładowane później, używane w trakcie działania)
  function app() { return LM.app; }

  // =====================================================================
  // ELEMENTY WSPÓLNE
  // =====================================================================

  /** Wypełnienie paska jako transform: scaleX (animuje się płynnie, bez przeliczania układu). */
  function fillStyle(percent) {
    return "transform:scaleX(" + Math.max(0, Math.min(100, percent)) / 100 + ")";
  }

  /** Pasek postępu. percent: 0–100. */
  function progressBar(percent, small, label) {
    return el("div", {
      class: "progress" + (small ? " is-small" : ""),
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": String(percent),
      "aria-label": label || "Postęp"
    }, el("div", { class: "progress-fill", style: fillStyle(percent) }));
  }

  /** Okrągły przycisk z symbolem i czytelną etykietą dla czytników ekranu. */
  function iconBtn(symbol, label, onClick, opts) {
    opts = opts || {};
    return el("button", {
      type: "button",
      class: "icon-btn" + (opts.danger ? " is-danger" : ""),
      "aria-label": label,
      "data-tooltip": label,
      disabled: !!opts.disabled,
      onclick: onClick
    }, LM.ICON_NODES && LM.ICON_NODES[symbol] ? LM.icon(symbol, { size: 18 }) : el("span", { "aria-hidden": "true", text: symbol }));
  }

  /** Pusty stan z komunikatem. */
  function emptyState(message) {
    return el("div", { class: "empty-state" }, el("p", { class: "empty-state-text", text: message }));
  }

  // =====================================================================
  // LEWY PANEL
  // =====================================================================

  /**
   * Pozycja lewego panelu: ikona (zawsze widoczna, także w wąskim pasku)
   * + etykieta (widoczna po rozwinięciu). Etykieta zostaje w DOM, więc
   * czytniki ekranu zawsze znają nazwę pozycji.
   */
  function sbItem(o) {
    return el("a", {
      class: "sb-item" + (o.cls ? " " + o.cls : "") + (o.active ? " is-active" : ""),
      href: o.href,
      "aria-current": o.active ? "page" : null,
      "aria-label": o.ariaLabel || null,
      onclick: o.onclick || null
    }, [
      el("span", { class: "sb-icon", "aria-hidden": "true" }, o.icon),
      el("span", { class: "sb-label" }, o.label),
      o.badge ? el("span", { class: "sb-badge num", "aria-hidden": "true", text: o.badge }) : null
    ]);
  }

  /** Poziom, którego test końcowy jest na ekranie (#/a1/test → "A1") albo null — wtedy w panelu świeci poziom, a nie „Ćwiczenia”. */
  function finalTestLevel() {
    const m = /^#\/([abcABC][12])\/test\/?$/.exec(location.hash || "");
    return m ? m[1].toUpperCase() : null;
  }

  /** Górna część lewego panelu: Dziś, Fiszki i błędy (jedna plakietka), Ćwiczenia, Lab czasów, Pisanie. */
  function renderToolsNav() {
    const box = document.getElementById("tools-nav");
    if (!box) return;
    const st = LM.state;
    const hasProfile = app().hasProfiles();
    const reviews = hasProfile && LM.reviewQueue ? LM.reviewQueue.dueCount() : 0; // jedna liczba: DO POWTÓRKI (fiszki + Moje błędy + słabe punkty); nowe karty osobno (spec v7 14, P3)
    const items = [
      { href: "#/trail", label: "Szlak", icon: "route", active: st.view === "trail" },
      { href: "#/today", label: "Dziś", icon: "sunrise", active: st.view === "today" },
      { href: "#/review", label: "Fiszki i błędy", icon: "layers", active: st.view === "review" || st.view === "cards" || st.view === "mistakes",
        badge: reviews ? String(reviews) : null, badgeLabel: reviews ? reviews + " do powtórki" : null },
      { href: "#/practice", label: "Ćwiczenia", icon: "dumbbell", active: st.view === "exercises" && !finalTestLevel() },
      { href: "#/lab", label: "Lab czasów", icon: "flask-conical", active: st.view === "lab" },
      { href: "#/writing", label: "Pisanie", icon: "pencil", active: st.view === "writing" }
    ];
    box.replaceChildren(el("ul", { class: "sb-list" }, items.map(function (it) {
      return el("li", null, sbItem({
        href: it.href,
        active: it.active,
        cls: "is-tool",
        icon: LM.icon(it.icon, { size: 22 }),
        label: el("span", { class: "sb-label-title", text: it.label }),
        badge: it.badge,
        ariaLabel: it.badgeLabel ? it.label + ", " + it.badgeLabel : null
      }));
    })));
  }

  /** Level name shown next to the code: the land of the level ("Meadow"). */
  function levelName(levelId) {
    return LM.syl.landName(levelId);
  }

  // Elementy poziomów budujemy raz i potem tylko aktualizujemy (pierścienie
  // i paski przechodzą płynnie z poprzedniej wartości, bez migania od zera).
  const levelNodes = {};

  function renderSidebar() {
    renderToolsNav();
    const st = LM.state;
    const list = document.getElementById("level-list");
    const currentId = LM.today && LM.today.currentLevelId ? LM.today.currentLevelId() : null;

    // Napis pod logo (stały; postęp w panelu dotyczy całych poziomów)
    document.getElementById("sidebar-category-name").textContent = LM.APP.tagline;

    let ul = list.querySelector(":scope > ul.sb-list");
    if (!ul) { ul = el("ul", { class: "sb-list" }); list.replaceChildren(ul); }

    LM.syl.levels().forEach(function (level) {
      const s = app().getLevelStats(level.id);
      // Poziom jest wyróżniony na jego liście i jego podstronach
      const active = ((st.view === "level" || st.view === "page") && level.id === st.ui.levelId) || finalTestLevel() === level.id;
      const name = levelName(level.id);
      let n = levelNodes[level.id];
      if (!n || !ul.contains(n.a)) {
        const ring = LM.ui.progressRing(s.percent, { size: 36, stroke: 4, node: LM.ui.landIcon(level.id, { size: 20 }), label: "Progress in " + level.id });
        const fill = el("div", { class: "progress-fill", style: "transform:scaleX(" + s.percent / 100 + ")" });
        const count = el("span", { class: "sb-label-sub num" });
        const title = el("span", { class: "sb-label-title" });
        // Kółko poziomu w opakowaniu: na nim ląduje znaczek zaliczonego testu końcowego (paczka v6)
        const ringWrap = el("span", { class: "sb-ring-wrap" }, [ring, el("span", { class: "sb-ring-code", "aria-hidden": "true", text: level.id })]);
        const a = sbItem({
          href: app().levelHash(level.id),
          cls: "is-level lvl-" + level.id,
          icon: ringWrap,
          label: [title, count, el("span", { class: "progress is-small sb-bar", "aria-hidden": "true" }, fill)],
          // Ten sam adres co obecny: przerysuj listę (np. powrót na górę) zamiast nic nie robić
          onclick: function (e) {
            if (location.hash === app().levelHash(level.id)) { e.preventDefault(); app().selectLevel(level.id); }
          }
        });
        n = levelNodes[level.id] = { a: a, ring: ring, ringWrap: ringWrap, fill: fill, count: count, title: title };
        ul.appendChild(el("li", null, a));
      }
      const soon = !LM.syl.isAvailable(level.id);
      n.title.textContent = level.id + (name ? " · " + name : "");
      n.count.textContent = soon ? "soon" : s.done + " / " + s.total + " known";
      n.a.classList.toggle("is-soon", soon);
      n.fill.style.transform = "scaleX(" + s.percent / 100 + ")";
      LM.ui.setRing(n.ring, s.percent);
      n.ring.removeAttribute("role"); // nazwę i wartość ogłasza link (aria-label), pierścień jest ozdobą
      n.ring.setAttribute("aria-hidden", "true");
      n.a.classList.toggle("is-active", active);
      if (active) n.a.setAttribute("aria-current", "page"); else n.a.removeAttribute("aria-current");
      // Znaczek zaliczonego testu końcowego: ikona nagrody na kółku + tekst „A1 zaliczony 12.11.2026” w etykiecie linku
      const passedText = LM.final ? LM.final.passedText(level.id) : null;
      const oldStamp = n.ringWrap.querySelector(".stamp");
      if (oldStamp) oldStamp.remove();
      if (passedText) n.ringWrap.appendChild(LM.ui.stamp(level.id, { size: 16 })); // pieczątka ✓ w rogu kółka
      n.a.classList.toggle("is-passed", !!passedText);
      n.a.classList.toggle("is-current", level.id === currentId);
      n.a.setAttribute("aria-label", "Level " + level.id + (name ? ", " + name : "") + (soon ? ": coming soon" : ": " + s.done + " of " + s.total +
        " topics known (" + s.percent + "%)") + (passedText ? ". " + passedText : "") + (level.id === currentId ? ". Current land" : ""));
    });

    // Pod poziomami: grupa „Egzaminy” z rejestru (E8, matury, B2…), na końcu Certyfikat C1 (własny moduł)
    if (LM.exams) LM.exams.renderNav();
    if (LM.c1) LM.c1.renderNav();
  }

  // =====================================================================
  // TREŚĆ POZIOMU (prawa część)
  // =====================================================================

  /** Widoki, które pokazują dane profilu: bez profilu mają kartę powitalną zamiast treści. */
  const PERSONAL_VIEWS = ["today", "review", "mistakes", "cards", "stats", "notes", "placement", "trail"];

  function renderMain(opts) {
    opts = opts || {};
    // Tryb gościa (spec v7 14, P1): treści publiczne działają bez profilu, a akcje zapisujące proszą o profil
    // (LM.profiles.requireProfile). Strony osobiste bez profilu pokazują kartę powitalną pod tym samym adresem.
    if (!app().hasProfiles() && PERSONAL_VIEWS.indexOf(LM.state.view) !== -1) return LM.profiles.renderWelcome({ personal: true });
    // Strona główna, zakładka „Certyfikat C1” albo podstrona zamiast listy
    if (LM.state.view === "home") return LM.handbook.renderHome();
    if (LM.state.view === "notfound") return renderNotFound();
    if (LM.state.view === "exam") return LM.exams.render(LM.state.toolRoute);
    if (LM.state.view === "review") return LM.review.render();
    if (LM.state.view === "mistakes") return LM.mistakes.render(LM.state.toolRoute);
    if (LM.state.view === "today") return LM.today.render();
    if (LM.state.view === "placement") return LM.placement.render();
    if (LM.state.view === "exercises") return LM.exercises.render(LM.state.toolRoute);
    if (LM.state.view === "lab") return LM.lab.render(LM.state.toolRoute);
    if (LM.state.view === "stats") return LM.statsPage.render();
    if (LM.state.view === "notes") return LM.notes.render();
    if (LM.state.view === "cards") return LM.cards.render();
    if (LM.state.view === "writing") return LM.writing.render();
    if (LM.state.view === "trail") return LM.trail.render(LM.state.toolRoute);
    if (LM.state.route) return LM.handbook.renderPage(LM.state.route);
    const view = document.getElementById("view");
    const scroll = opts.resetScroll ? 0 : U.getScroll();
    const level = app().getActiveLevel();

    view.className = "view lvl-" + level.id;
    delete view.dataset.file;
    view.replaceChildren();
    document.title = level.id + " · " + LM.APP.appTitle;

    if (!LM.syl.isAvailable(level.id)) {
      view.appendChild(renderLevelHeader(level));
      view.appendChild(renderPlannedTopics(level));
      U.setScroll(typeof opts.scrollTop === "number" ? opts.scrollTop : scroll);
      return;
    }
    view.appendChild(renderLevelHeader(level));
    view.appendChild(renderTopics(level));
    // Below the list: level summary (content/summaries/<level>.md)
    const summary = LM.handbook.renderSummary(level.id);
    if (summary) view.appendChild(summary);
    // Final test card, and the cheat-sheet card before it
    if (LM.final) view.appendChild(LM.final.card(level.id));
    const sheet = LM.handbook.cheatsheetCard(level.id);
    if (sheet) view.insertBefore(sheet, view.querySelector(".lf-level-card"));

    U.setScroll(typeof opts.scrollTop === "number" ? opts.scrollTop : scroll);
  }

  /** "Page not found": any hash no route claims (spec 02 §6). */
  function renderNotFound() {
    const view = document.getElementById("view");
    view.className = "view tool-view notfound-view";
    view.dataset.file = "#notfound";
    view.replaceChildren(el("section", { class: "card notfound", "aria-labelledby": "notfound-title" }, [
      el("h1", { class: "notfound-title", id: "notfound-title", text: "Page not found" }),
      el("p", { text: "There is no page at this address. It may have moved, or the link has a typo." }),
      el("p", null, el("a", { class: "btn btn-primary", href: "#/" }, LM.ui.withIcon("arrow-left", "Go to the home page")))
    ]));
    document.title = "Page not found · " + LM.APP.appTitle;
    U.setScroll(0);
  }

  // ---------- Level header ----------

  /**
   * Nagłówek poziomu: duży znak poziomu w kolorze krainy, nazwa i cel (z opisu),
   * pierścień postępu całego poziomu (wszystkie kategorie).
   */
  function renderLevelHeader(level) {
    const name = levelName(level.id);
    if (!LM.syl.isAvailable(level.id)) {
      return el("header", { class: "card level-hero is-soon" }, [
        el("div", { class: "level-hero-text" }, [
          el("p", { class: "level-kicker" }, [LM.ui.landIcon(level.id, { size: 16 }), LM.ui.landLabel(level.id)]),
          el("h1", { class: "level-title" }, [
            el("span", { class: "level-code-big", text: level.id }),
            name ? el("span", { class: "level-name", text: name }) : null
          ]),
          level.goal ? el("p", { class: "level-desc", text: level.goal }) : null,
          el("p", { class: "level-soon-badge" }, [LM.icon("clock", { size: 16 }), "Coming soon"])
        ])
      ]);
    }
    const s = app().getLevelStats(level.id);
    const ring = LM.ui.progressRing(s.percent, { size: 104, stroke: 8, label: "Progress in " + level.id, text: s.percent + "%" });
    ring.id = "level-ring";
    return el("header", { class: "card level-hero" }, [
      el("div", { class: "level-hero-text" }, [
        el("p", { class: "level-kicker" }, [LM.ui.landIcon(level.id, { size: 16 }), LM.ui.landLabel(level.id)]),
        el("h1", { class: "level-title" }, [
          el("span", { class: "level-code-big", text: level.id }),
          name ? el("span", { class: "level-name", text: name }) : null
        ]),
        level.goal ? el("p", { class: "level-desc", text: level.goal }) : null,
        LM.trail ? LM.trail.levelLink(level.id) : null
      ]),
      el("div", { class: "level-hero-ring" }, [
        ring,
        el("p", { class: "level-ring-label num", id: "level-ring-label", text: s.done + " of " + s.total + " known" }),
        el("p", { class: "level-ring-scope", text: "all topics" }),
        LM.final ? LM.final.headerLabel(level.id) : null
      ])
    ]);
  }

  // ---------- Topics (the checklist: one row per syllabus topic, spec 06 E2) ----------

  /** Topic row: "I know this" on the left, the title (link to the topic page) with a chevron on the right. */
  function topicRow(topic) {
    const done = LM.state.progress[topic.id] === true;
    const textId = "ess-text-" + topic.id;
    let li = null;
    const checkbox = el("label", { class: "umiem" }, [
      el("input", {
        type: "checkbox",
        checked: done,
        "aria-describedby": textId,
        onchange: function (e) {
          if (!app().hasProfiles()) { // guest mode: create a profile first, then tick (the list redraws itself)
            const input = e.target, on = input.checked;
            input.checked = !on;
            app().withProfile("“I know this” ticks are saved in your profile.", function () { app().setProgress(topic.id, on); app().renderAll(); });
            return;
          }
          app().setProgress(topic.id, e.target.checked);
          li.classList.toggle("is-done", e.target.checked);
          checkbox.classList.toggle("is-fresh", e.target.checked);
        }
      }),
      el("span", { class: "visually-hidden", text: "I know this" })
    ]);
    li = el("li", { class: "ess-item has-page" + (done ? " is-done" : ""), "data-topic": topic.id }, [
      checkbox,
      el("div", { class: "ess-text", id: textId },
        el("a", { class: "ess-link", href: LM.syl.routeOf(topic.id), onclick: rememberScroll }, [
          el("span", { class: "ess-title", text: topic.title }),
          LM.syl.hasPage(topic.id) ? null : el("span", { class: "ess-soon", text: "being written" }),
          el("span", { class: "ess-link-arrow", "aria-hidden": "true" }, LM.icon("chevron-right", { size: 18 }))
        ]))
    ]);
    return li;
  }

  /**
   * A "soon" level (spec 06 E1): the planned topics from the syllabus, titles and examples only (no links, no checkboxes),
   * grouped by category like an available level.
   */
  function renderPlannedTopics(level) {
    const section = el("section", { class: "essentials is-planned", "aria-labelledby": "ess-title" }, [
      el("div", { class: "section-head" }, [
        el("h2", { class: "section-title", id: "ess-title", text: "Planned topics" }),
        el("span", { class: "section-sub", text: level.id + " is on its way. The topics below are what it will cover." })
      ])
    ]);
    LM.syl.groups(level.id).forEach(function (g) {
      section.appendChild(el("h3", { class: "ess-group-title", text: g.name }));
      section.appendChild(el("ul", { class: "ess-list is-planned" }, g.topics.map(function (t) {
        return el("li", { class: "ess-item is-planned", "data-topic": t.id }, el("div", { class: "ess-text" }, [
          el("span", { class: "ess-title", text: t.title }),
          t.example ? el("span", { class: "ess-example", lang: LM.APP.targetLang, text: t.example }) : null
        ]));
      })));
    });
    return section;
  }

  /** The level's topics grouped by syllabus category (order of first appearance on the level). */
  function renderTopics(level) {
    const stats = app().getLevelStats(level.id);
    const section = el("section", { class: "essentials", "aria-labelledby": "ess-title" }, [
      el("div", { class: "section-head" }, [
        el("h2", { class: "section-title", id: "ess-title", text: "Topics" }),
        el("span", { class: "section-sub", text: "What to know at " + level.id })
      ]),
      el("div", { class: "essentials-progress", id: "ess-progress" }, [
        progressBar(stats.percent, false, "Progress in " + level.id),
        el("span", { class: "progress-text", text: progressLabel(stats) })
      ])
    ]);
    const groups = LM.syl.groups(level.id);
    groups.forEach(function (g) {
      section.appendChild(el("h3", { class: "ess-group-title", text: g.name }));
      section.appendChild(el("ul", { class: "ess-list" }, g.topics.map(topicRow)));
    });
    if (!groups.length) {
      section.appendChild(emptyState("This level has no topics."));
      return section;
    }
    // Best set score ("set 8/10") before the arrow, added once the exercise index has loaded
    if (LM.exercises && LM.exercises.setLabels) {
      const rows = section.querySelectorAll("li[data-topic]");
      const ids = Array.prototype.map.call(rows, function (r) { return r.getAttribute("data-topic"); });
      LM.exercises.setLabels(ids).then(function (labels) {
        Array.prototype.forEach.call(rows, function (row) {
          const lab = labels[row.getAttribute("data-topic")];
          const arrow = row.querySelector(".ess-link-arrow");
          if (!lab || !arrow || row.querySelector(".ess-set")) return;
          arrow.parentNode.insertBefore(el("span", { class: "ess-set" + (lab.high ? " is-high" : ""), title: "Best score in the exercise set of this topic" }, [
            lab.high ? el("span", { class: "ess-set-dot", "aria-hidden": "true" }) : null, lab.text
          ]), arrow);
        });
      });
    }
    return section;
  }

  /** Remembers the list scroll position before opening a topic page. */
  function rememberScroll() {
    LM.state.listScroll = U.getScroll();
  }

  function progressLabel(stats) {
    return stats.done + " of " + stats.total + " known at this level · " + stats.percent + "%";
  }

  /** Updates the level progress bar and ring without redrawing the page (focus stays). */
  function updateEssentialsProgress() {
    const box = document.getElementById("ess-progress");
    if (!box) return;
    const stats = app().getLevelStats(LM.state.ui.levelId);
    const bar = box.querySelector(".progress");
    bar.setAttribute("aria-valuenow", String(stats.percent));
    bar.querySelector(".progress-fill").style.transform = fillStyle(stats.percent).slice("transform:".length);
    const ring = document.getElementById("level-ring");
    if (ring) {
      LM.ui.setRing(ring, stats.percent, stats.percent + "%");
      const lbl = document.getElementById("level-ring-label");
      if (lbl) lbl.textContent = stats.done + " of " + stats.total + " known";
    }
    box.querySelector(".progress-text").textContent = progressLabel(stats);
  }

  LM.render = {
    renderSidebar: renderSidebar,
    renderToolsNav: renderToolsNav,
    renderMain: renderMain,
    updateEssentialsProgress: updateEssentialsProgress,
    iconBtn: iconBtn
  };
})(window.LM);
