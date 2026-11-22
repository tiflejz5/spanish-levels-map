/*
 * trail.js — the Trail view (spec v7 13, section 4): the learning path A1 → C2 with lands, units, stops and checkpoints;
 * the stop sheet (Read → Check yourself → Done / Skip); quizzes and checkpoints run in the exercise engine.
 *
 *   #/trail                  the trail view (the current stop scrolled into view)
 *   #/trail/<stop id>        the same, with the stop sheet open (links from "Today"; the address goes back to #/trail)
 *
 * Pure logic: js/trail-logic.js. State: js/trail-store.js (slm.trail.<profile>). Data: data/trail.js (LM.TRAIL, generated
 * from the syllabus by tools/build/trail.js, spec 06 E9; one stop per topic, a checkpoint per unit) and
 * data/quizzes-<level>.js (LM.QUIZZES, on demand). A "soon" level is drawn dimmed with "Coming soon" (spec 06 E1).
 * Accessibility: the stop list is an <ol> of buttons, the state is written as text ("done", "current", "skipped").
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/trail";
  const ROW = 108;                 // height of a stop row (px)
  // Stop icon per syllabus category
  const CAT_ICON = { verbs: "notebook-text", grammar: "notebook-text", functions: "arrow-left-right", vocabulary: "layers" };
  const STATUS_TEXT = { done: "done", current: "current", open: "open", skipped: "skipped" };

  function SL() { return LM.trailLogic; }
  function ST() { return LM.trailStore; }
  function pd() { return LM.profileData; }
  function hasProfile() { return !!(LM.app && LM.app.getActiveProfile()); }
  function plural(n, one, other) { return LM.plural(n, one, other); }

  // =====================================================================
  // DANE I STAN
  // =====================================================================

  /** The trail data is loaded (start script), and the logic and store are ready. */
  function loaded() { return !!(LM.TRAIL && LM.trailLogic && LM.trailStore); }
  /** The trail can be computed for the active profile. */
  function ready() { return loaded() && hasProfile() && !!(LM.state && LM.state.profiles); }

  function env() {
    return {
      isKnown: function (id) { return LM.state.progress[id] === true; },
      setPercent: function (setId) { const r = pd() ? pd().setScore(setId) : null; return r && r.best.total ? Math.round(100 * r.best.score / r.best.total) : null; }
    };
  }

  function testLevel() { const t = hasProfile() && pd() ? pd().lastTest() : null; return t && t.level ? t.level : null; }

  /** Start of the active profile: { level, source, at }. */
  function startInfo() { return SL().effectiveStart(ST().data(), testLevel()); }

  /** The whole trail with the current state (computed every time, no cache, so never out of date). */
  function trail() { return SL().buildTrail(LM.TRAIL, ST().data(), env(), startInfo().level); }

  function nodeById(tr, id) { return tr.nodes.find(function (n) { return n.id === id; }) || null; }

  function pageHref(stop) { return "#/" + stop.page; }
  function setHref(stop) { return "#/practice/set/" + stop.set; }

  /** Label text: "Stop 7 of 26 · A1 · Meadow". */
  function positionText(n) { return "Stop " + n.number + " of " + n.levelTotal + " · " + LM.ui.landLabel(n.level); }

  // =====================================================================
  // API FOR OTHER VIEWS (Today, topic page, level page, stats)
  // =====================================================================

  /** Current stop of the active profile, or null: { node, unit: { done, total, index, count, title }, level } */
  function current() {
    if (!ready()) return null;
    const tr = trail();
    if (!tr.current) return null;
    return { node: tr.current, unit: SL().unitProgress(tr, tr.current.unitId), level: tr.current.level, trail: tr };
  }

  /** Land progress, taking the start into account: { done, total, percent, skipped }. */
  function levelInfo(level) {
    if (!ready()) return null;
    const tr = trail();
    const p = SL().levelProgress(tr, level);
    return Object.assign(p, { skipped: SL().LEVELS.indexOf(level) < tr.startIndex && p.percent < 100, isCurrent: !!(tr.current && tr.current.level === level) });
  }

  function startLevelId() { return ready() ? startInfo().level : null; }

  /** "Stop N of M" bar at the end of a topic page (stop id = topic id), or null (no stop, or a "soon" level). */
  function barFor(topicId) {
    if (!loaded() || !LM.syl.topic(topicId) || !LM.syl.isAvailable(LM.syl.topic(topicId).level)) return null;
    const found = topicId;
    const guest = !hasProfile();
    const tr = guest ? SL().buildTrail(LM.TRAIL, SL().emptyState(), { isKnown: function () { return false; }, setPercent: function () { return null; } }, "A1") : trail();
    const n = nodeById(tr, found);
    if (!n) return null;
    const lessons = tr.nodes.filter(function (x) { return x.type === "lesson"; });
    const next = lessons.slice(lessons.indexOf(n) + 1).find(function (x) { return x.status !== "done" && x.status !== "skipped"; }) || lessons[lessons.indexOf(n) + 1] || null;
    const actions = [];
    if (n.stop.quiz) actions.push(el("button", { type: "button", class: "btn btn-primary btn-small", onclick: function () { startQuiz(n); } }, LM.ui.withIcon("play", "Check yourself (4 questions)")));
    else actions.push(el("button", { type: "button", class: "btn btn-secondary btn-small", onclick: function () { openSheet(n.id); } }, "Open the stop on the trail"));
    if (next) actions.push(el("a", { class: "btn btn-secondary btn-small", href: HASH + "/" + next.id }, LM.ui.withIcon("arrow-right", "Next stop")));
    return el("aside", { class: "card sz-bar lvl-" + n.level, "aria-label": "Trail: " + positionText(n) }, [
      el("p", { class: "sz-bar-text" }, [
        el("span", { class: "sz-bar-land", "aria-hidden": "true" }, LM.ui.landIcon(n.level, { size: 22 })),
        el("span", null, [el("strong", { text: positionText(n) }), n.status === "done" ? el("span", { class: "sz-bar-done", text: " · done" }) : null])
      ]),
      el("div", { class: "sz-bar-actions" }, actions)
    ]);
  }

  // =====================================================================
  // LOADING QUIZZES AND CHECKPOINTS
  // =====================================================================

  function loadQuizzes(level) {
    const lvl = String(level).toLowerCase();
    if (LM.QUIZZES && Object.keys(LM.QUIZZES).some(function (k) { return k.indexOf(lvl + "-") === 0; })) return Promise.resolve();
    return LM.loadModule("data/quizzes-" + lvl + ".js").catch(function () { /* a level without quizzes */ });
  }

  /** Quiz items in the engine format (topic, level and set are needed for the attempts log and the stats). */
  function quizItems(quiz) {
    return quiz.items.map(function (it) { return Object.assign({ topic: quiz.topic, level: quiz.level, setId: quiz.id, tags: ["trail"] }, it); });
  }

  /** The stop's quiz (after the level has loaded), or null. */
  function quizById(id) { return (LM.QUIZZES && LM.QUIZZES[id]) || null; }

  function startQuiz(n) {
    LM.app.withProfile("The quiz result is saved in your profile.", function () {
      loadQuizzes(n.level).then(function () {
        const quiz = quizById(n.stop.quiz);
        if (!quiz) { LM.ui.toast({ text: "This stop has no quiz yet.", icon: "info" }); return; }
        closeSheet();
        runSession({
          title: quiz.title, intro: quiz.intro, items: quizItems(quiz), kind: "quiz", node: n, quiz: quiz
        });
      });
    });
  }

  function startReview(n) {
    LM.app.withProfile("The checkpoint result is saved in your profile.", function () {
      const level = n.level;
      const stops = {};
      LM.TRAIL.levels.forEach(function (lv) { lv.units.forEach(function (u) { u.stops.forEach(function (s) { stops[s.id] = s; }); }); });
      const setIds = (n.stop.from || []).map(function (id) { return stops[id] && stops[id].set; }).filter(Boolean);
      Promise.all([loadQuizzes(level), setIds.length ? LM.exercises.loadSets(setIds) : Promise.resolve([]), LM.final ? LM.final.load(level) : Promise.resolve(null)]).then(function (res) {
        const sets = {};
        res[1].forEach(function (s) { sets[s.id] = s.items || []; });
        const src = {
          stops: stops,
          quizItems: function (id) { const s = stops[id]; const q = s && s.quiz ? quizById(s.quiz) : null; return q ? quizItems(q) : []; },
          setItems: function (setId) { return sets[setId] || []; },
          finalItems: function () { return res[2] && res[2].items ? res[2].items : []; }
        };
        const pick = SL().pickReview(Object.assign({ level: level }, n.stop), src, Math.random);
        if (!pick.source || !pick.items.length) { LM.ui.toast({ text: "The checkpoint is available once the quizzes are added.", icon: "info" }); return; }
        closeSheet();
        runSession({ title: n.stop.title, intro: "Checkpoint: " + plural(pick.items.length, "question") + " from this unit.", items: pick.items, kind: "review", node: n });
      });
    });
  }

  /** A session in the exercise engine (js/exercise-engine.js, startCustom) with its own result saving and result screen. */
  function runSession(cfg) {
    const n = cfg.node;
    LM.exercises.startCustom({
      title: cfg.title, intro: cfg.intro, items: cfg.items, mode: "learn", autostart: true, // key "custom:" — the session at #/practice/session
      back: { href: HASH, label: "Back to the trail" },
      hooks: {
        finish: function (run, s) {
          if (cfg.kind === "quiz") {
            const rec = ST().recordQuiz(n.id, s.score);
            return { kind: "quiz", passed: s.score >= SL().PASS_QUIZ, best: rec ? rec.best : s.score };
          }
          ST().recordReview(n.id, s.score, s.total);
          return { kind: "review", passed: true, best: s.score };
        },
        afterFinish: function () { if (LM.app.refreshLearning) LM.app.refreshLearning(); },
        renderDone: function (view, run, api) { renderResult(view, run, api, cfg); }
      }
    });
  }

  /** Result screen of a quiz / checkpoint: the score, passing, an "I know this" suggestion (never automatic), next steps. */
  function renderResult(view, run, api, cfg) {
    const n = cfg.node, fin = run.final || { passed: false };
    const tr = trail();
    const node = nodeById(tr, n.id) || n;
    const next = nextLesson(tr, node);
    const isQuiz = cfg.kind === "quiz";
    view.className = "view tool-view ex-view sz-result-view lvl-" + n.level;
    document.title = (isQuiz ? "Quiz result" : "Checkpoint result") + " · Trail · " + LM.APP.appTitle;
    view.appendChild(el("header", { class: "tool-head" }, [
      LM.ui.breadcrumbs([{ label: "Trail", href: HASH }, { label: cfg.title }]),
      el("h1", { class: "tool-title", text: isQuiz ? "Result: " + n.stop.title : cfg.title })
    ]));
    const needed = SL().PASS_QUIZ;
    const wrong = run.items.filter(api.isWrong);
    const missing = isQuiz ? (n.stop.items || []).filter(function (id) { return LM.state.progress[id] !== true; }) : [];
    const knownBox = isQuiz && fin.passed && missing.length ? el("div", { class: "ex-known", role: "status" }, [
      el("span", { class: "ex-known-icon", "aria-hidden": "true" }, LM.icon("sparkles", { size: 20 })),
      el("div", { class: "ex-known-body" }, [
        el("p", null, [el("strong", { text: "Mark “I know this”? " }), "Quiz passed, but only you mark “I know this”. Mark it for: " + node.stop.title + "?"]),
        el("p", { class: "ex-journal-actions" }, el("button", { type: "button", class: "btn btn-primary btn-small", onclick: function (e) {
          missing.forEach(function (id) { LM.app.setProgress(id, true); });
          e.currentTarget.closest(".ex-known").replaceWith(el("div", { class: "ex-known is-done", role: "status" }, [LM.icon("check", { size: 18 }), el("p", { text: "Marked “I know this”. Well done!" })]));
        } }, LM.ui.withIcon("check", "Mark “I know this”")))
      ])
    ]) : null;
    view.appendChild(el("section", { class: "card ex-result sz-result " + (fin.passed ? "is-passed" : "is-failed"), "aria-live": "polite" }, [
      el("p", { class: "ex-result-score" }, [el("strong", { class: "num", text: run.score + "/" + run.total }), el("span", { class: "ex-result-pct num", text: Math.round(100 * run.score / Math.max(1, run.total)) + "%" })]),
      isQuiz
        ? el("p", { class: "lf-verdict" }, [
          el("span", { class: "c1-mark " + (fin.passed ? "is-ok" : "is-bad"), "aria-hidden": "true" }, LM.icon(fin.passed ? "check" : "x", { size: 16 })),
          el("strong", { text: fin.passed ? "Stop passed" : "Not yet" }),
          el("span", { class: "lf-need", text: " – pass mark " + needed + " of " + run.total + " right answers" })
        ])
        : el("p", { class: "tool-note", text: "Checkpoint saved. The score never blocks the way on; wrong answers went to your mistake log." }),
      knownBox,
      wrong.length ? el("div", { class: "sz-wrong" }, [
        el("h2", { class: "lf-h", text: "To review (" + wrong.length + ")" }),
        el("ul", { class: "lf-topic-list" }, wrong.map(function (p) { return el("li", null, [api.itemSummary(p.item), el("span", { class: "tool-note", text: " → " + api.modelAnswer(p.item) })]); }))
      ]) : el("p", { class: "tool-note", text: "No mistakes – well done!" }),
      api.journalSummary(),
      el("div", { class: "tool-actions" }, [
        next && (fin.passed || !isQuiz) ? el("a", { class: "btn btn-primary", href: HASH + "/" + next.id }, LM.ui.withIcon("arrow-right", "Next stop")) : null,
        isQuiz && !fin.passed ? el("button", { type: "button", class: "btn btn-primary", onclick: function () { startQuiz(node); } }, LM.ui.withIcon("rotate-ccw", "Try again")) : null,
        isQuiz && !fin.passed ? el("a", { class: "btn btn-secondary", href: pageHref(node.stop) }, "Read the topic again") : null,
        el("a", { class: "btn btn-secondary", href: HASH }, "Back to the trail")
      ])
    ]));
  }

  function nextLesson(tr, node) {
    const lessons = tr.nodes.filter(function (x) { return x.type === "lesson" && x.levelIndex >= tr.startIndex; });
    const i = lessons.findIndex(function (x) { return x.id === node.id; });
    const after = i === -1 ? lessons : lessons.slice(i + 1);
    return after.find(function (x) { return x.status === "open"; }) || null;
  }

  // =====================================================================
  // ARKUSZ PRZYSTANKU
  // =====================================================================

  let sheet = null;

  function closeSheet() { if (sheet) { sheet.close(); sheet = null; } }

  function openSheet(id, opts) {
    if (!ready()) { LM.app.withProfile("The trail saves progress in your profile.", function () { openSheet(id, opts); }); return; }
    opts = opts || {};
    closeSheet();
    const body = el("div", { class: "sz-sheet-body" });
    sheet = LM.dialogs.open({
      title: "", className: "dialog-sz sz-sheet", body: body, cancelValue: false,
      actions: [{ label: "Close", value: false, autofocus: true }]
    });
    const sh = sheet;
    sh.result.then(function () { if (sheet === sh) sheet = null; });
    paintSheet(body, id, opts);
  }

  /** Whether the stop is in a later land than the current one while the previous land has no passed final test (spec 3.3). */
  function recommendFirst(tr, n) {
    const cur = tr.current;
    if (!cur || n.levelIndex <= cur.levelIndex) return null;
    const prev = SL().LEVELS[n.levelIndex - 1];
    const passed = pd() ? pd().passedLevels() : {};
    return passed[prev] ? null : cur.level;
  }

  function paintSheet(body, id, opts) {
    const tr = trail();
    const n = nodeById(tr, id);
    const dlg = body.closest("dialog");
    if (!n) { body.replaceChildren(el("p", { text: "There is no such stop." })); return; }
    const title = dlg && dlg.querySelector(".dialog-title");
    if (title) title.textContent = n.stop.title;
    const parts = [];
    const st = n.current ? "current" : n.status;
    parts.push(el("p", { class: "sz-sheet-meta" }, [
      n.type === "lesson" ? positionText(n) : "Checkpoint · " + n.unitTitle,
      " · ", el("strong", { class: "sz-state is-" + st, text: STATUS_TEXT[st] }),
      n.via === "start" ? " (skipped by the placement test)" : n.via === "skip" ? " (skipped by you)" : n.via === "quiz" ? " (by the quiz)" : n.via === "known" ? " (topic marked “I know this”)" : n.via === "set" ? " (by the exercise set)" : ""
    ]));

    const rec = opts.force ? null : recommendFirst(tr, n);
    if (rec) {
      parts.push(el("div", { class: "sz-recommend", role: "note" }, [
        el("p", { text: "We suggest finishing " + LM.ui.landLabel(rec) + " first. Later lands are open, but the trail suggests an order." }),
        el("button", { type: "button", class: "btn btn-secondary btn-small", onclick: function () { paintSheet(body, id, { force: true }); } }, "Open it anyway")
      ]));
      body.replaceChildren.apply(body, parts);
      return;
    }

    if (n.type === "review") {
      parts.push(el("p", { text: (n.stop.size || 6) + " questions from the stops of this unit. The score never blocks the way on; wrong answers go to your mistake log." }));
      const r = ST().data().reviews[n.id];
      if (r) parts.push(el("p", { class: "tool-note", text: "Best result: " + r.best + "/" + r.of + "." }));
      parts.push(el("div", { class: "sz-sheet-actions" }, [
        el("button", { type: "button", class: "btn btn-primary", onclick: function () { startReview(n); } }, LM.ui.withIcon("play", r ? "Do it again" : "Start the checkpoint"))
      ]));
      body.replaceChildren.apply(body, parts);
      return;
    }

    // checklist items of the stop (topics, spec 06 E2)
    const textOf = function (id) { const t = LM.syl.topic(id); return t ? LM.handbook.titleOf(t) : id; };
    parts.push(el("h3", { class: "sz-sheet-h", text: "What you learn here" }));
    parts.push(el("ul", { class: "sz-items" }, (n.stop.items || []).map(function (itemId) {
      const done = LM.state.progress[itemId] === true;
      const cid = "sz-i-" + itemId;
      return el("li", null, el("label", { class: "sz-item", for: cid }, [
        el("input", { type: "checkbox", id: cid, checked: done, onchange: function (e) {
          LM.app.setProgress(itemId, e.target.checked);
          paintSheet(body, id, Object.assign({}, opts, { force: true }));
          refreshView();
        } }),
        el("span", { text: textOf(itemId) })
      ]));
    })));

    // steps 1 and 2
    parts.push(el("ol", { class: "sz-steps" }, [
      el("li", null, [el("strong", { text: "Read" }), el("a", { class: "btn btn-secondary btn-small", href: pageHref(n.stop), onclick: closeSheet }, LM.ui.withIcon("file-text", "Open the topic page"))]),
      el("li", null, [el("strong", { text: "Check yourself" }), el("span", { class: "sz-step-actions" }, [
        n.stop.quiz ? el("button", { type: "button", class: "btn btn-primary btn-small", onclick: function () { startQuiz(n); } }, LM.ui.withIcon("play", "Quiz (4 questions)")) : null,
        n.stop.set ? el("a", { class: "btn btn-secondary btn-small", href: setHref(n.stop), onclick: closeSheet }, "Exercise set") : null,
        !n.stop.quiz && !n.stop.set ? el("a", { class: "btn btn-secondary btn-small", href: pageHref(n.stop), onclick: closeSheet }, "Practice on the topic page") : null
      ])])
    ]));
    const qrec = ST().data().stops[n.id];
    if (qrec && qrec.via === "quiz" && typeof qrec.best === "number") parts.push(el("p", { class: "tool-note", text: "Best quiz result: " + qrec.best + "/4." }));

    // the "I know this" suggestion after a quiz (never automatic)
    const missing = (n.stop.items || []).filter(function (itemId) { return LM.state.progress[itemId] !== true; });
    if (n.via === "quiz" && missing.length) {
      parts.push(el("div", { class: "ex-known", role: "status" }, [
        el("span", { class: "ex-known-icon", "aria-hidden": "true" }, LM.icon("sparkles", { size: 20 })),
        el("div", { class: "ex-known-body" }, [
          el("p", null, [el("strong", { text: "Mark “I know this”? " }), "Quiz passed. Mark it for: " + n.stop.title + "?"]),
          el("p", { class: "ex-journal-actions" }, el("button", { type: "button", class: "btn btn-primary btn-small", onclick: function () {
            missing.forEach(function (itemId) { LM.app.setProgress(itemId, true); });
            paintSheet(body, id, Object.assign({}, opts, { force: true }));
            refreshView();
          } }, LM.ui.withIcon("check", "Mark “I know this”")))
        ])
      ]));
    }

    // done / skip
    const foot = [];
    const next = nextLesson(tr, n);
    if (n.status === "done") {
      foot.push(el("button", { type: "button", class: "btn btn-primary", onclick: function () { closeSheet(); if (next) openSheet(next.id); else refreshView(); } }, LM.ui.withIcon("arrow-right", next ? "Done, next" : "Done")));
    }
    if (n.via === "skip") foot.push(el("button", { type: "button", class: "btn btn-secondary", onclick: function () { ST().unskipStop(n.id); paintSheet(body, id, Object.assign({}, opts, { force: true })); refreshView(); } }, "Undo skip"));
    else if (n.status !== "done") foot.push(el("button", { type: "button", class: "btn btn-link", onclick: function () {
      ST().skipStop(n.id);
      closeSheet();
      refreshView();
    } }, "Skip this stop"));
    if (foot.length) parts.push(el("div", { class: "sz-sheet-actions" }, foot));
    body.replaceChildren.apply(body, parts);
  }

  // =====================================================================
  // PUNKT STARTU
  // =====================================================================

  function startDialog() {
    LM.app.withProfile("The start is saved in your profile.", function () {
      const cur = startInfo();
      const form = el("form", { class: "sz-start-form" }, SL().LEVELS.map(function (lvl) {
        const id = "sz-start-" + lvl;
        return el("label", { class: "sz-start-opt lvl-" + lvl, for: id }, [
          el("input", { type: "radio", name: "sz-start", id: id, value: lvl, checked: cur.level === lvl }),
          el("span", { class: "sz-start-land", "aria-hidden": "true" }, LM.ui.landIcon(lvl, { size: 22 })),
          el("span", { text: LM.ui.landLabel(lvl) })
        ]);
      }));
      LM.dialogs.open({
        title: "Change the start",
        body: [el("p", { text: "Lands before the start get the status “skipped”. They block nothing, and you can go back to them." }), form],
        cancelValue: false,
        actions: [
          { label: "Cancel", value: false },
          { label: "Save", variant: "btn-primary", value: true, onClick: function () {
            const v = form.querySelector("input:checked");
            if (v) ST().setStart(v.value, "manual");
          } }
        ]
      }).result.then(function (ok) { if (ok) { refreshView(); if (LM.app.refreshLearning) LM.app.refreshLearning(); } });
    });
  }

  // =====================================================================
  // WIDOK
  // =====================================================================

  function parseRoute(hash) {
    const m = /^#\/trail(?:\/([a-z0-9-]+))?\/?$/.exec(String(hash || ""));
    return m ? { kind: "trail", open: m[1] || null } : null;
  }

  function refreshView() { if (LM.state.view === "trail") render({ kind: "trail", open: null }, { keepScroll: true }); }

  function nodeButton(n, geo) {
    const st = n.current ? "current" : n.status;
    const isReview = n.type === "review";
    const cat = isReview ? null : n.stop.category;
    const label = (isReview ? "Checkpoint: " : "") + n.stop.title + ". " + (isReview ? "" : positionText(n) + ". ") + STATUS_TEXT[st] + (n.via === "start" ? " by the placement test" : "") + ".";
    const icon = st === "done" ? "check" : isReview ? "rotate-ccw" : (st === "skipped" ? "arrow-right" : CAT_ICON[cat] || "sparkles");
    return el("li", { class: "sz-node is-" + st + (isReview ? " is-review" : ""), style: "left:" + geo.x.toFixed(1) + "%;top:" + geo.y + "px", "data-stop": n.id }, [
      el("button", { type: "button", class: "sz-btn", "aria-label": label, "aria-haspopup": "dialog", onclick: function () { openSheet(n.id); } }, [
        el("span", { class: "sz-circle", "aria-hidden": "true" }, LM.icon(icon, { size: st === "done" ? 24 : 22 })),
        el("span", { class: "sz-title", "aria-hidden": "true", text: isReview ? "Checkpoint" : n.stop.title })
      ])
    ]);
  }

  function unitBlock(tr, unit, nodes) {
    const prog = SL().unitProgress(tr, unit.id);
    const n = nodes.length;
    const H = n * ROW;
    const geo = nodes.map(function (node, i) {
      const k = node.global !== null ? node.global : (nodes[i - 1] ? nodes[i - 1].global : 0) + 0.5;
      return { x: 50 + 25 * Math.sin(k * 0.95 + node.levelIndex), y: Math.round(i * ROW + ROW / 2) };
    });
    // a curve through the node centres
    let d = "M" + geo[0].x.toFixed(1) + " " + geo[0].y;
    for (let i = 1; i < geo.length; i++) {
      const a = geo[i - 1], b = geo[i], my = (a.y + b.y) / 2;
      d += " C" + a.x.toFixed(1) + " " + my + " " + b.x.toFixed(1) + " " + my + " " + b.x.toFixed(1) + " " + b.y;
    }
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "sz-wire"); svg.setAttribute("viewBox", "0 0 100 " + H); svg.setAttribute("preserveAspectRatio", "none"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return el("section", { class: "sz-unit", "aria-labelledby": "sz-u-" + unit.id }, [
      el("div", { class: "sz-unit-head" }, [
        el("h3", { class: "sz-unit-title", id: "sz-u-" + unit.id, text: "Unit " + prog.index + " · " + unit.title }),
        el("span", { class: "sz-unit-prog num", text: prog.done + "/" + prog.total, "aria-label": prog.done + " of " + plural(prog.total, "stop") + " done" })
      ]),
      el("div", { class: "sz-lane", style: "height:" + H + "px" }, [svg, el("ol", { class: "sz-stops" }, nodes.map(function (node, i) { return nodeButton(node, geo[i]); }))])
    ]);
  }

  /** A "soon" land (spec 06 E1): dimmed, "Coming soon", its units by title, no stops to open yet. */
  function soonSection(tr, lv) {
    const level = lv.level;
    const p = SL().levelProgress(tr, level);
    return el("section", { class: "sz-level is-soon lvl-" + level, "aria-labelledby": "sz-l-" + level }, [
      el("header", { class: "sz-level-head" }, [
        el("span", { class: "sz-level-icon", "aria-hidden": "true" }, LM.ui.landIcon(level, { size: 30 })),
        el("div", { class: "sz-level-text" }, [
          el("h2", { class: "sz-level-title", id: "sz-l-" + level, text: LM.ui.landLabel(level) }),
          el("p", { class: "sz-level-sub num" }, [
            el("span", { class: "chip is-soon", text: "Coming soon" }),
            " " + p.total + " stops in " + lv.units.length + " units"
          ])
        ]),
        el("div", { class: "sz-level-links" }, el("a", { class: "btn btn-link btn-small", href: LM.app.levelHash(level) }, "Planned topics"))
      ]),
      el("ol", { class: "sz-soon-units" }, lv.units.map(function (u) { return el("li", { text: u.title }); }))
    ]);
  }

  function levelSection(tr, lv, curLevel) {
    if (lv.status === "soon") return soonSection(tr, lv);
    const level = lv.level;
    const p = SL().levelProgress(tr, level);
    const skipped = SL().LEVELS.indexOf(level) < tr.startIndex && p.percent < 100;
    const passed = LM.final ? LM.final.passedText(level) : null;
    const isCur = curLevel === level;
    const nodesOf = function (unitId) { return tr.nodes.filter(function (x) { return x.unitId === unitId; }); };
    const units = lv.units.map(function (u) { return unitBlock(tr, u, nodesOf(u.id)); });
    const head = el("header", { class: "sz-level-head" }, [
      el("span", { class: "sz-level-icon", "aria-hidden": "true" }, LM.ui.landIcon(level, { size: 30 })),
      el("div", { class: "sz-level-text" }, [
        el("h2", { class: "sz-level-title", id: "sz-l-" + level, text: LM.ui.landLabel(level) }),
        el("p", { class: "sz-level-sub num" }, [
          p.done + " of " + plural(p.total, "stop") + " (" + p.percent + "%)",
          skipped ? el("span", { class: "chip", text: "Skipped by the placement test" }) : null,
          isCur ? el("span", { class: "chip is-here", text: "You are here" }) : null,
          passed ? el("span", { class: "chip", text: passed }) : null
        ])
      ]),
      el("div", { class: "sz-level-links" }, [
        el("a", { class: "btn btn-link btn-small", href: LM.app.levelHash(level) }, "Topic list"),
        el("a", { class: "btn btn-secondary btn-small", href: lv.finalTest }, level + " final test")
      ])
    ]);
    const inner = [head].concat(units);
    const cls = "sz-level lvl-" + level + (skipped ? " is-skipped" : "") + (isCur ? " is-current" : "");
    if (skipped) {
      return el("details", { class: cls, "aria-labelledby": "sz-l-" + level }, [
        el("summary", { class: "sz-level-summary" }, [el("span", { "aria-hidden": "true" }, LM.ui.landIcon(level, { size: 24 })), el("span", { text: LM.ui.landLabel(level) + " · skipped by the placement test (" + p.done + "/" + p.total + ")" })])
      ].concat(inner));
    }
    return el("section", { class: cls, "aria-labelledby": "sz-l-" + level }, inner);
  }

  /** First run (a new profile with no start chosen and no test). */
  function firstRun() {
    return el("section", { class: "card sz-first", "aria-labelledby": "sz-first-title" }, [
      el("h2", { class: "sz-first-title", id: "sz-first-title", text: "Where do we start?" }),
      el("p", { text: "The trail is one path through six lands. You can start at the beginning, or take the short placement test and the trail sets itself where it makes sense to start." }),
      el("div", { class: "tool-actions" }, [
        el("a", { class: "btn btn-primary", href: LM.placement ? LM.placement.HASH : "#/placement" }, LM.ui.withIcon("target", "Take the placement test (6 min)")),
        el("button", { type: "button", class: "btn btn-secondary", onclick: function () { ST().setStart("A1", "default"); refreshView(); } }, "Start at A1")
      ])
    ]);
  }

  function needsFirstRun() {
    const st = ST().data();
    return !st.start && !testLevel() && !Object.keys(st.stops).length && !Object.keys(st.reviews).length && !Object.keys(LM.state.progress).length;
  }

  function render(route, opts) {
    opts = opts || {};
    route = route || parseRoute(location.hash) || { kind: "trail", open: null };
    const view = document.getElementById("view");
    const scroll = opts.keepScroll ? U.getScroll() : 0;
    view.className = "view tool-view sz-view";
    view.dataset.file = HASH;
    view.replaceChildren();
    document.title = "Trail · " + LM.APP.appTitle;
    if (!ready()) {
      view.appendChild(el("p", { class: "tool-note", role: "status", text: "Loading the trail…" }));
      return;
    }
    const tr = trail();
    const start = startInfo();
    const cur = tr.current;
    view.appendChild(LM.ui.pageHead({ eyebrow: "Learn", title: "Trail", lead: "One path through the lands from A1 to C2: small stops with a checkpoint every few steps. The trail suggests an order, but nothing is locked." }));
    if (needsFirstRun()) view.appendChild(firstRun());

    const startText = start.source === "test" ? "from the placement test" : start.source === "manual" ? "chosen by you" : "default";
    const bar = [
      el("div", { class: "sz-now" }, cur ? [
        el("p", { class: "sz-now-label", text: "Current stop" }),
        el("p", { class: "sz-now-title" }, [el("strong", { text: cur.stop.title }), el("span", { class: "tool-note", text: " · " + positionText(cur) })]),
        el("p", { class: "tool-note num", text: "Unit " + SL().unitProgress(tr, cur.unitId).index + " · " + cur.unitTitle + " · " + SL().unitProgress(tr, cur.unitId).done + "/" + SL().unitProgress(tr, cur.unitId).total })
      ] : [el("p", { class: "sz-now-title" }, el("strong", { text: "The whole trail is done from your start. Congratulations!" }))]),
      el("div", { class: "sz-now-actions" }, [
        cur ? el("button", { type: "button", class: "btn btn-primary", onclick: function () { openSheet(cur.id); } }, LM.ui.withIcon("arrow-right", "Continue the trail")) : null,
        el("button", { type: "button", class: "btn btn-secondary", onclick: startDialog }, "Change the start")
      ])
    ];
    view.appendChild(el("section", { class: "card sz-now-card", "aria-label": "Current stop" }, bar));
    view.appendChild(el("p", { class: "tool-note sz-start-note" }, "Start: " + LM.ui.landLabel(start.level) + " (" + startText + ")."));

    const curLevel = cur ? cur.level : null;
    LM.TRAIL.levels.forEach(function (lv) { view.appendChild(levelSection(tr, lv, curLevel)); });

    if (opts.keepScroll) U.setScroll(scroll);
    else {
      const here = cur ? view.querySelector('[data-stop="' + cur.id + '"]') : null;
      if (here) {
        const reduce = LM.reducedMotion && LM.reducedMotion();
        const details = here.closest("details");
        if (details) details.open = true;
        requestAnimationFrame(function () { here.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); });
      } else U.setScroll(0);
    }
    if (route.open) {
      history.replaceState(null, "", HASH); // the address goes back to #/trail, a reload does not open the sheet again
      openSheet(route.open);
    }
  }

  /** "See A1 · Meadow on the trail" link on the level page. */
  function levelLink(level) {
    if (!loaded()) return null;
    return el("a", { class: "btn btn-link btn-small sz-level-link", href: HASH }, LM.ui.withIcon("route", "See " + LM.ui.landLabel(level) + " on the trail"));
  }

  /** "Trail" tile in Stats: passed stops per level and the average quiz result. */
  function statsTile() {
    if (!ready()) return null;
    const tr = trail();
    const st = ST().data();
    const avg = SL().quizAverage(st);
    const rows = SL().LEVELS.filter(function (lvl) { return LM.syl.isAvailable(lvl); }).map(function (lvl) {
      const p = SL().levelProgress(tr, lvl);
      return el("li", { class: "sz-st-row lvl-" + lvl }, [
        el("span", { class: "sz-st-name", text: LM.ui.landLabel(lvl) }),
        el("span", { class: "sz-st-bar", "aria-hidden": "true" }, el("span", { class: "sz-st-fill", style: "width:" + p.percent + "%" })),
        el("span", { class: "sz-st-n num", text: p.done + "/" + p.total })
      ]);
    });
    const quizzes = Object.keys(st.stops).filter(function (id) { return st.stops[id].via === "quiz"; }).length;
    return el("section", { class: "card st-tile st-wide", "aria-labelledby": "st-trail" }, [
      el("h2", { class: "tile-title", id: "st-trail", text: "Trail" }),
      el("ul", { class: "sz-st-list" }, rows),
      el("p", { class: "tool-note", text: avg === null ? "Stop quizzes: none yet. You pass with 3 of 4 questions." : "Stop quizzes: " + plural(quizzes, "attempt") + ", average result " + avg + "%." }),
      el("p", null, el("a", { class: "btn btn-link btn-small", href: HASH }, "Open the trail"))
    ]);
  }

  LM.trail = {
    levelLink: levelLink, statsTile: statsTile,
    HASH: HASH, parseRoute: parseRoute, render: render, loaded: loaded, ready: ready,
    current: current, levelInfo: levelInfo, startLevel: startLevelId, barFor: barFor, openSheet: openSheet, startQuiz: startQuiz, positionText: positionText
  };
})(window.LM);
