/*
 * final.js — level final tests A1–C2 (pack v6, spec 13 section 2).
 *
 *   #/a1/test … #/c2/test   start screen → a session in Exam mode in the exercise engine
 *                           (js/exercise-engine.js, LM.exercises.startFinal) → result
 *
 * Pool of 30 items per level: content/tests/final-<level>.json → data/final-<level>.js (tools/build/tests.js),
 * loaded on demand. Drawing 20 items with every category represented in proportion, and the pass mark in points:
 * js/final-logic.js. Result and level stamp: LM.profileData (slm.finals).
 *
 * Also here: the "level passed" stamp (trail, panel, level header), the "Final test" card on the level page
 * and the hint on "Today" (≥ 70% of the level's topics marked "I know this").
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const DRAW = 20;
  const PASS = 80;
  const MINUTES = 15;
  const READY_PERCENT = 70; // from this % of topics known on a level, suggest the final test

  function pd() { return LM.profileData; }
  function F() { return LM.finalLogic; }
  function levelHash(level) { return LM.app.levelHash(level); }
  function testHash(level) { return "#/" + String(level).toLowerCase() + "/test"; }

  /** "2026-11-12" → "Nov 12, 2026". */
  function fmtDate(day) {
    return LM.fmt.date(day) || String(day || "");
  }

  function plural(n, one, other) { return LM.plural(n, one, other); }

  function categoryLabel(key) { return LM.syl.categoryName(key); }
  /** Category of an item (spec 06 E10): the syllabus category of its topic; the build copies it into item.category as well. */
  function categoryOf(item) {
    const t = item.topic && LM.syl ? LM.syl.topic(item.topic) : null;
    return (t && t.category) || item.category || "other";
  }
  /** Position of a category in the syllabus (the result lists categories in that order). */
  function categoryRank(key) {
    const i = LM.syl ? LM.syl.categories().map(function (c) { return c.id; }).indexOf(key) : -1;
    return i === -1 ? 99 : i;
  }

  // =====================================================================
  // LEVEL STAMP (trail, panel, level header)
  // =====================================================================

  /** Day the active profile passed the level ("YYYY-MM-DD"), or null. */
  function passedAt(level) {
    const r = LM.app.getActiveProfile() ? pd().finalResult(level) : null;
    return r && r.passedAt ? r.passedAt : null;
  }

  /** Text for screen readers and labels: "A1 passed Nov 12, 2026", or null. */
  function passedText(level) {
    const d = passedAt(level);
    return d ? level + " passed " + fmtDate(d) : null;
  }

  /**
   * Stamp: an award icon in a circle (a shape, not colour alone) + hidden text "A1 passed Nov 12, 2026"
   * (opts.hideText — when the parent link gives the label).
   */
  function stamp(level, opts) {
    const text = passedText(level);
    if (!text) return null;
    opts = opts || {};
    return el("span", { class: "lvl-stamp lvl-" + level + (opts.cls ? " " + opts.cls : ""), "data-level": level }, [
      el("span", { class: "lvl-stamp-icon", "aria-hidden": "true" }, LM.icon("award", { size: opts.size || 14 })),
      opts.hideText ? null : el("span", { class: "visually-hidden", text: text })
    ]);
  }

  /** The "Passed · Nov 12, 2026" label in the level page header (visible text), or null. */
  function headerLabel(level) {
    const d = passedAt(level);
    if (!d) return null;
    return el("p", { class: "lvl-passed-label lvl-" + level }, [
      el("span", { class: "lvl-stamp-icon", "aria-hidden": "true" }, LM.icon("award", { size: 16 })),
      el("span", { text: "Passed · " + fmtDate(d) }),
      el("span", { class: "visually-hidden", text: " (" + level + " final test)" })
    ]);
  }

  // =====================================================================
  // DATA
  // =====================================================================

  /** Pool of the level (Promise → set, or null when there is no file). */
  function load(level) {
    if (LM.FINALS && LM.FINALS[level]) return Promise.resolve(LM.FINALS[level]);
    return LM.loadModule("data/final-" + level.toLowerCase() + ".js").then(function () {
      return (LM.FINALS && LM.FINALS[level]) || null;
    }, function () { return null; });
  }

  /** Points needed to pass for a given total of points (the pass mark in points). */
  function pointsNeeded(total, percent) { return Math.ceil(total * percent / 100); }

  /** Size of one attempt: the pool's draw (never more than the pool), else DRAW; minutes scale with it. */
  function facts(level) {
    const set = LM.FINALS && LM.FINALS[level];
    const n = set ? Math.min(set.draw || DRAW, (set.items || []).length || DRAW) : DRAW;
    const pass = (set && set.passPercent) || PASS;
    return { draw: n, minutes: Math.max(5, Math.round(MINUTES * n / DRAW)), pass: pass, need: pointsNeeded(n, pass) };
  }

  /** A text that depends on the pool size: drawn now, redrawn once the pool file is loaded (it loads on demand). */
  function factsText(level, tag, attrs, make) {
    const node = el(tag, Object.assign({}, attrs, { text: make(facts(level)) }));
    if (!(LM.FINALS && LM.FINALS[level]) && LM.syl.isAvailable(level)) load(level).then(function (set) { if (set) node.textContent = make(facts(level)); });
    return node;
  }

  function percentOf(r) { return r.total ? Math.round(r.score / r.total * 100) : 0; }

  // =====================================================================
  // START SCREEN
  // =====================================================================

  function backTo(level) { return { href: levelHash(level), label: "Back to " + level }; }

  function renderStart(view, level) {
    document.title = level + " final test · " + LM.APP.appTitle;
    if (!LM.syl.isAvailable(level)) {
      view.className = "view tool-view ex-view lf-view lvl-" + level;
      view.appendChild(el("section", { class: "card lf-card", "aria-labelledby": "lf-soon-title" }, [
        el("h1", { class: "tool-title", id: "lf-soon-title", text: level + " final test" }),
        el("p", { text: level + " is on its way. Its final test comes with it." }),
        el("p", null, el("a", { class: "btn btn-secondary", href: levelHash(level) }, "See the planned topics of " + level))
      ]));
      return;
    }
    view.className = "view tool-view ex-view lf-view lvl-" + level;
    const info = pd().finalResult(level);
    const msg = el("p", { class: "tool-note lf-msg", role: "status", "aria-live": "polite" });
    const startBtn = el("button", { type: "button", class: "btn btn-primary", "data-fk": "start", onclick: function () { begin(level, startBtn, msg); } },
      LM.ui.withIcon("play", info ? "Take the test again" : "Start the test"));
    const when = passedText(level);
    view.appendChild(el("header", { class: "tool-head" }, [
      el("p", { class: "tool-eyebrow" }, el("a", { href: levelHash(level) }, "Level " + level)),
      el("h1", { class: "tool-title", text: level + " final test" }),
      factsText(level, "p", { class: "tool-lead" }, function (f) { return f.draw + " questions from the whole of " + level + ", about " + f.minutes + " minutes. You pass with " + f.pass + "% of the points (" + f.need + " of " + f.draw + ")."; })
    ]));
    view.appendChild(el("section", { class: "card lf-card" }, [
      when ? el("p", { class: "lf-passed" }, [stamp(level, { hideText: true }), el("strong", { text: when })]) : null,
      info ? el("p", { class: "tool-note", text: "Best result: " + info.best.score + "/" + info.best.total + " points (" + percentOf(info.best) + "%) · last: " +
        info.last.score + "/" + info.last.total + " points (" + fmtDate(info.last.date) + ")" }) : el("p", { class: "tool-note", text: "Not taken yet." }),
      el("ul", { class: "lf-rules" }, [
        el("li", { text: "Questions from different topics of the level, drawn again on every attempt." }),
        el("li", { text: "Exam mode: explanations only after the last question. Mistakes go to the mistake log." }),
        el("li", { text: "The test is always open. It never marks anything as “I know this” – you still do that yourself." })
      ]),
      msg,
      el("div", { class: "tool-actions" }, [startBtn, el("a", { class: "btn btn-link", href: levelHash(level) }, "Back to " + level)])
    ]));
    setTimeout(function () { startBtn.focus({ preventScroll: true }); }, 0);
  }

  /** Draws the items from the pool and starts a session in the engine. */
  function begin(level, btn, msg) {
    btn.disabled = true;
    msg.textContent = "Drawing the questions…";
    load(level).then(function (set) {
      btn.disabled = false;
      if (!set || !Array.isArray(set.items) || !set.items.length) {
        msg.textContent = "The question pool of this level is not available yet. Run: npm run build";
        return;
      }
      msg.textContent = "";
      start(level, set);
    });
  }

  /** A new attempt: draw + Exam session at #/<level>/test. */
  function start(level, set) {
    const items = F().drawItems(set.items, set.draw || DRAW, categoryOf);
    LM.exercises.startFinal({
      level: level, title: set.title || level + " final test", items: items, back: backTo(level),
      hooks: {
        finish: function (run, s) { return finish(level, set, run, s); },
        afterFinish: function (run) { afterFinish(level, run); },
        renderDone: function (view, run, api) { renderResult(view, run, api, level, set); }
      }
    });
  }

  // =====================================================================
  // END AND RESULT
  // =====================================================================

  /** Saves the result (slm.finals) and computes the split by category. Returns run.final. */
  function finish(level, set, run, s) {
    const percent = set.passPercent || PASS;
    const passed = F().isPassed(s.score, s.total, percent);
    const saved = pd().saveFinalResult(level, { score: s.score, total: s.total, passed: passed });
    return {
      passed: passed, saved: saved, percent: percent, needed: pointsNeeded(s.total, percent),
      breakdown: F().breakdown(run.items.map(function (p) { return { item: p.item, res: p.res }; }), categoryOf)
    };
  }

  /** After passing: refresh the panel (stamp) and congratulate (milestone lvl-<level>-passed). */
  function afterFinish(level, run) {
    if (!run.final || !run.final.passed) return;
    if (LM.render && LM.render.renderSidebar) LM.render.renderSidebar();
    if (run.final.saved && run.final.saved.firstPass && LM.celebrate) LM.celebrate.check({ event: "final", level: level });
  }

  function topicInfo(id) { return LM.exercises.topicInfo(id); }

  function renderResult(view, run, api, level, set) {
    const fin = run.final;
    const total = run.total;
    const pct = total ? Math.round(run.score / total * 100) : 0;
    const passed = fin && fin.passed;
    document.title = level + " final test result · " + LM.APP.appTitle;
    view.className = "view tool-view ex-view lf-view lvl-" + level;
    view.appendChild(el("header", { class: "tool-head" }, [
      el("p", { class: "tool-eyebrow" }, el("a", { href: levelHash(level) }, "Level " + level)),
      el("h1", { class: "tool-title", text: level + " final test" })
    ]));

    const wrong = run.items.filter(api.isWrong);
    const catRows = fin.breakdown.categories.slice().sort(function (a, b) { return categoryRank(a.key) - categoryRank(b.key); }).map(function (c) {

      const showPct = c.total >= 3; // as in the placement test: no percentages with fewer than 3
      return el("li", { class: c.score === c.total ? "is-full" : "" }, [
        el("span", { class: "lf-cat-name", text: categoryLabel(c.key) }),
        el("strong", { class: "num", text: c.score + "/" + c.total }),
        showPct ? el("span", { class: "lf-cat-pct num", text: Math.round(c.score / c.total * 100) + "%" }) : null,
        el("span", { class: "lf-cat-bar", "aria-hidden": "true" }, el("span", { class: "lf-cat-fill", style: "width:" + Math.round(c.score / c.total * 100) + "%" }))
      ]);
    });
    const weak = fin.breakdown.topics.slice(0, 6);
    const names = weak.slice(0, 3).map(function (t) { const i = topicInfo(t.topic); return i ? i.title : t.topic; });
    const sets = el("p", { class: "tool-note lf-sets", hidden: true });
    const actions = el("div", { class: "tool-actions" }, [
      el("button", { type: "button", class: "btn " + (passed ? "btn-secondary" : "btn-primary"), "data-fk": "again", onclick: function () { start(level, set); } }, LM.ui.withIcon("rotate-ccw", "Take the test again")),
      el("a", { class: "btn btn-secondary", href: levelHash(level) }, "Back to " + level),
      passed ? el("a", { class: "btn btn-link", href: "#/trail" }, LM.ui.withIcon("arrow-right", "See the trail")) : null
    ]);

    view.appendChild(el("section", { class: "card ex-result lf-result " + (passed ? "is-passed" : "is-failed"), "aria-live": "polite" }, [
      el("p", { class: "ex-result-score" }, [
        el("strong", { class: "num", text: run.score + "/" + total + " " + (total === 1 ? "point" : "points") }),
        el("span", { class: "ex-result-pct num", text: pct + "%" })
      ]),
      el("p", { class: "lf-verdict" }, [
        el("span", { class: "c1-mark " + (passed ? "is-ok" : "is-bad"), "aria-hidden": "true" }, LM.icon(passed ? "check" : "x", { size: 16 })),
        el("strong", { text: passed ? "Passed" : "Not yet" }),
        el("span", { class: "lf-need", text: " – pass mark " + fin.percent + "% (" + fin.needed + " of " + total + " points)" })
      ]),
      passed && fin.saved && fin.saved.firstPass
        ? el("p", { class: "lf-passed" }, [stamp(level, { hideText: true }), el("strong", { text: level + " passed " + fmtDate(fin.saved.passedAt) + ". Your stamp is now on the trail, in the panel and on the level page." })])
        : passed ? el("p", { class: "tool-note", text: "You passed " + level + " on " + fmtDate(fin.saved.passedAt) + "." })
          : el("p", { class: "ex-result-comment", text: passedAt(level) ? "Your " + level + " stamp stays – this result was below the pass mark. Look at the mistakes and try again." : "You need " + plural(Math.max(0, fin.needed - run.score), "more point") + " to pass. Look at the mistakes, review the topics and try again." }),
      fin.saved ? el("p", { class: "tool-note", text: "Best result: " + fin.saved.best.score + "/" + fin.saved.best.total + " points (" + percentOf(fin.saved.best) + "%)." }) : null,
      el("h2", { class: "lf-h", text: "Result by category" }),
      el("ul", { class: "lf-cats" }, catRows),
      !passed && names.length ? el("p", { class: "lf-weak" }, [el("span", { class: "review-label", text: "Most mistakes in: " }), names.join(", ") + "."]) : null,
      weak.length ? el("div", { class: "lf-topics" }, [
        el("h2", { class: "lf-h", text: "Topics to review" }),
        el("ul", { class: "lf-topic-list" }, weak.map(function (t) {
          const i = topicInfo(t.topic);
          return el("li", null, [
            i ? el("a", { href: i.href, text: i.title }) : el("span", { text: t.topic }),
            el("span", { class: "tool-note", text: " – " + plural(t.wrong, "item") + " with a mistake" })
          ]);
        }))
      ]) : el("p", { class: "tool-note", text: "No mistakes – well done!" }),
      sets,
      api.journalSummary(),
      actions
    ]));
    // "Sets for these topics" (only when these topics have exercise sets)
    if (!passed && weak.length) LM.exercises.loadIndex().then(function (index) {
      const found = [];
      weak.forEach(function (t) { (index.topics[t.topic] || []).forEach(function (id) { if (index.sets[id] && found.indexOf(id) === -1) found.push(id); }); });
      if (!found.length || !sets.isConnected) return;
      sets.hidden = false;
      sets.replaceChildren(el("span", { class: "review-label", text: "Sets for these topics: " }));
      found.slice(0, 4).forEach(function (id, k) {
        if (k) sets.appendChild(document.createTextNode(", "));
        sets.appendChild(el("a", { href: "#/practice/set/" + id, text: index.sets[id].title }));
      });
      actions.insertBefore(el("a", { class: "btn btn-secondary", href: "#/practice/set/" + found[0] }, "Sets for these topics"), actions.children[1]);
    });

    view.appendChild(el("section", { class: "card ex-review" }, [
      el("h2", { class: "section-title", text: wrong.length ? "To fix (" + wrong.length + ")" : "No mistakes – well done!" }),
      wrong.length ? el("ol", { class: "ex-wrong" }, wrong.map(function (p) {
        const mine = api.userAnswer(p);
        return el("li", null, [
          el("p", { class: "ex-wrong-q" }, [el("span", { class: "chip", text: api.typeShort[p.item.type] }), p.res && p.res.max > 1 ? el("span", { class: "chip", text: p.res.points + "/" + p.res.max + " points" }) : null, " ", api.itemSummary(p.item)]),
          el("p", { class: "journal-row is-wrong" }, [el("span", { class: "review-label", text: "Your answer: " }), el("span", { text: mine || "(none)" })]),
          el("p", { class: "journal-row is-right" }, [el("span", { class: "review-label", text: "Right answer: " }), el("strong", { text: api.modelAnswer(p.item) })]),
          p.item.explanation ? el("p", { class: "ex-wrong-expl", text: p.item.explanation }) : null,
          p.item.trap ? el("p", { class: "ex-wrong-trap" }, [el("strong", { text: "Trap: " }), p.item.trap]) : null
        ]);
      })) : el("p", { class: "tool-note", text: "All your answers were right." })
    ]));
    setTimeout(function () { const b = view.querySelector("[data-fk='again']"); if (b) b.focus({ preventScroll: true }); }, 0);
  }

  // =====================================================================
  // CARD ON THE LEVEL PAGE AND HINT ON "TODAY"
  // =====================================================================

  /** The "A1 final test" card below the level summary. */
  function card(level) {
    const info = LM.app.getActiveProfile() ? pd().finalResult(level) : null;
    const when = passedText(level);
    return el("section", { class: "card lf-level-card lvl-" + level, "aria-labelledby": "lf-card-title" }, [
      el("div", { class: "lf-level-card-body" }, [
        el("h2", { class: "section-title", id: "lf-card-title" }, [el("span", { class: "callout-icon", "aria-hidden": "true" }, LM.icon("award", { size: 20 })), level + " final test"]),
        factsText(level, "p", {}, function (f) { return f.draw + " questions from the whole level, about " + f.minutes + " minutes. " + f.pass + "% (" + f.need + " of " + f.draw + ") gives you the level stamp on the trail."; }),
        when ? el("p", { class: "lf-passed" }, [stamp(level, { hideText: true }), el("strong", { text: when })]) : null,
        info ? el("p", { class: "tool-note", text: "Best result: " + info.best.score + "/" + info.best.total + " points (" + percentOf(info.best) + "%), last: " + info.last.score + "/" + info.last.total + " (" + fmtDate(info.last.date) + ")." })
          : el("p", { class: "tool-note", text: "The test is always open – you can take it without marking anything as “I know this”." })
      ]),
      el("a", { class: "btn btn-primary", href: testHash(level), "aria-label": (info ? "Take it again: the " : "Start the test: the ") + level + " final test" }, LM.ui.withIcon("play", info ? "Take it again" : "Start the test"))
    ]);
  }

  /**
   * Hint on "Today": the lowest level with ≥ 70% of topics known and no passed final test.
   * stats = [{ id, percent, … }] as in LM.today. Returns a tile or null.
   */
  /** Level ready for the final test (≥ 70% known, not passed yet) from the list of level stats, or null (map card on Today). */
  function readyLevel(stats) {
    if (!LM.app.getActiveProfile()) return null;
    stats = stats.filter(function (x) { return LM.syl.isAvailable(x.id); });
    const passed = pd().passedLevels();
    return stats.find(function (x) { return x.total !== 0 && x.percent >= READY_PERCENT && !passed[x.id]; }) || null;
  }


  function todayTip(stats) {
    if (!LM.app.getActiveProfile()) return null;
    stats = stats.filter(function (x) { return LM.syl.isAvailable(x.id); });
    const passed = pd().passedLevels();
    const s = stats.find(function (x) { return x.total !== 0 && x.percent >= READY_PERCENT && !passed[x.id]; });
    if (!s) return null;
    return el("section", { class: "card bento-tile bento-tip lf-tip", "aria-label": s.id + " final test" }, [
      el("div", { class: "today-tip-body" }, [
        el("h2", { class: "tile-title", text: "Ready for the " + s.id + " final test?" }),
        factsText(s.id, "p", { class: "tool-note" }, function (f) { return "You already know " + s.percent + "% of the topics of " + s.id + ". " + f.draw + " questions, about " + f.minutes + " minutes, pass mark " + f.pass + "%."; })
      ]),
      el("a", { class: "btn btn-primary", href: testHash(s.id) }, LM.ui.withIcon("award", "Take the " + s.id + " final test"))
    ]);
  }

  LM.final = {
    DRAW: DRAW, PASS: PASS, MINUTES: MINUTES,
    renderStart: renderStart, load: load, fmtDate: fmtDate,
    passedAt: passedAt, passedText: passedText, stamp: stamp, headerLabel: headerLabel,
    card: card, todayTip: todayTip, readyLevel: readyLevel, testHash: testHash
  };
})(window.LM);
