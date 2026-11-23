/*
 * stats-page.js — "Stats" (#/stats, spec 03, section 3).
 *
 * Data: the attempts log (slm.attempts), set results, the mistake log
 * and activity days — all from LM.profileData; computed in js/learning-stats.js.
 *
 * Rules (DESIGN.md 3.11 and the dataviz skill):
 *   - with < 5 attempts no percentage as a judgement, only "not enough data";
 *   - no comparisons with others and no rankings;
 *   - bars in the level colour + the level code in the label (never colour alone),
 *     text always in text colours, not in the data colour;
 *   - charts have a text description / table (role="img" + <details> with a table).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/stats";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const TYPE_LABEL = {
    "multiple-choice": "Multiple choice", "reorder": "Put in order", "find-error": "Find the mistake", "short-answer": "Short answer",
    "gap-fill": "Fill the gaps", "match": "Match pairs", "transformation": "Rewrite the sentence", "translate": "Translate", "dictation": "Dictation", "paradigm": "Fill the table"
  };
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function pd() { return LM.profileData; }
  function learn() { return LM.learn; }
  function S() { return LM.stats; }

  function parseRoute(hash) { return /^#\/stats\/?$/.test(hash || "") ? { kind: "stats" } : null; }

  function plural(n, one, other) { return LM.plural(n, one, other); }
  function tries(n) { return plural(n, "attempt"); }
  function pct(x) { return Math.round(x * 100) + "%"; }
  function topic(id) { return (LM.exercises && LM.exercises.topicInfo(id)) || null; }

  function svg(tag, attrs, children) {
    const n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, String(attrs[k])); });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }

  function tile(title, id, body, extra) {
    return el("section", { class: "card st-tile" + (extra ? " " + extra : ""), "aria-labelledby": id }, [
      el("h2", { class: "tile-title", id: id, text: title })
    ].concat(body));
  }

  function emptyNote(text) { return el("p", { class: "st-empty", text: text }); }

  // ---------- 1. Summary (number tiles) ----------

  function summaryTile(rec, today) {
    const s = S().summary(rec, today);
    const month = today.slice(0, 7);
    const days = pd().activityDays().filter(function (d) { return d.slice(0, 7) === month; }).length;
    const stat = function (label, value, note) {
      return el("div", { class: "st-stat" }, [
        el("p", { class: "st-stat-label", text: label }),
        el("p", { class: "st-stat-value", text: value }),
        note ? el("p", { class: "st-stat-note", text: note }) : null
      ]);
    };
    return tile("Summary", "st-sum", [
      el("div", { class: "st-stats" }, [
        stat("Answers in 7 days", String(s.n7)),
        stat("Answers in 30 days", String(s.n30)),
        stat("Answers in total", String(s.n)),
        stat("Overall accuracy", s.acc === null ? "—" : pct(s.acc), s.acc === null ? "not enough data" : null),
        stat("Accuracy in 7 days", s.acc7 === null ? "—" : pct(s.acc7), s.acc7 === null ? "not enough data" : null),
        stat("Sets done", String(pd().solvedSetCount())),
        stat("Study days this month", String(days))
      ])
    ], "st-wide");
  }

  // ---------- Horizontal bars (accuracy) ----------

  /** Bar row: label (optionally a link), a 0–100% track with a fill, the value and the number of attempts. */
  function barRow(o) {
    const enough = o.acc !== null;
    const label = o.href ? el("a", { class: "st-bar-label", href: o.href }, o.label) : el("span", { class: "st-bar-label" }, o.label);
    return el("li", { class: "st-bar-row" + (o.level ? " lvl-" + o.level : "") + (enough ? "" : " is-small") }, [
      el("div", { class: "st-bar-head" }, [
        o.level ? el("span", { class: "chip is-level lvl-" + o.level, text: o.level }) : null,
        label,
        el("span", { class: "st-bar-value" }, enough
          ? [el("strong", { class: "num", text: pct(o.acc) }), " · " + tries(o.n)]
          : "not enough data · " + tries(o.n))
      ]),
      enough ? el("div", { class: "st-track", "aria-hidden": "true" }, el("div", { class: "st-fill", style: "width:" + Math.max(2, Math.round(o.acc * 100)) + "%" })) : null
    ]);
  }

  function topicsTile(rec) {
    const agg = S().aggregate(rec, "topic");
    const rows = S().ranked(rec, "topic");
    const small = Object.keys(agg).filter(function (k) { return agg[k].n < S().MIN_SAMPLE; }).length;
    return tile("Accuracy by topic", "st-topics", [
      el("p", { class: "tool-note", text: "Weakest first. Only topics with at least 5 attempts – select a topic to go back to it." }),
      rows.length ? el("ul", { class: "st-bars" }, rows.map(function (r) {
        const t = topic(r.key);
        return barRow({ label: t ? t.title : r.key, href: t ? t.href : null, level: t ? t.level : null, acc: r.acc, n: r.n });
      })) : emptyNote("Not enough data. Answer at least 5 items of one topic."),
      small ? el("p", { class: "st-small-note", text: "Topics with fewer than 5 attempts: " + small + " – too few to judge yet." }) : null
    ], "st-wide");
  }

  function typesLevelsTile(rec) {
    const byType = S().aggregate(rec, "type");
    const byLevel = S().aggregate(rec, "level");
    const row = function (g, extra) { return Object.assign({ acc: S().accuracy(g), n: g ? g.n : 0 }, extra); };
    const types = Object.keys(TYPE_LABEL).filter(function (t) { return byType[t]; });
    const levels = learn().LEVELS.filter(function (l) { return byLevel[l]; });
    return tile("By item type and level", "st-types", [
      el("h3", { class: "st-sub", text: "Item type" }),
      types.length ? el("ul", { class: "st-bars" }, types.map(function (t) { return barRow(row(byType[t], { label: TYPE_LABEL[t] })); })) : emptyNote("No answers yet."),
      el("h3", { class: "st-sub", text: "Level" }),
      levels.length ? el("ul", { class: "st-bars" }, levels.map(function (l) { return barRow(row(byLevel[l], { label: "Level " + l, level: l })); })) : emptyNote("No answers yet.")
    ]);
  }

  function weakTile(rec) {
    const rows = S().ranked(rec, "topic").slice(0, 5);
    const weak = S().weakTopics(rec);
    return tile("Weak spots", "st-weak", [
      rows.length ? el("ol", { class: "st-weak-list" }, rows.map(function (r) {
        const t = topic(r.key);
        return el("li", { class: "st-weak-row" + (t ? " lvl-" + t.level : "") }, [
          el("div", { class: "st-weak-text" }, [
            t ? el("a", { href: t.href, text: t.title }) : el("span", { text: r.key }),
            el("span", { class: "st-weak-meta" }, [el("strong", { class: "num", text: pct(r.acc) }), " · " + tries(r.n)])
          ]),
          el("a", { class: "btn btn-secondary btn-small", href: "#/practice/weak/" + r.key, "aria-label": "Practice: " + (t ? t.title : r.key) }, LM.ui.withIcon("dumbbell", "Practice"))
        ]);
      })) : emptyNote("No weak spots so far. Do a few sets and you will see what to work on."),
      weak.length ? el("p", { class: "st-weak-cta" }, el("a", { class: "btn btn-primary", href: "#/practice/weak" }, LM.ui.withIcon("target", "Practice weak spots"))) : null
    ]);
  }

  // ---------- 5. Weekly trend (columns + number of attempts) ----------

  function trendTile(rec, today) {
    const weeks = S().weekly(rec, today, 12);
    const any = weeks.some(function (w) { return w.n; });
    const W = 600, H = 210, top = 16, base = 160, left = 36, right = 590;
    const step = (right - left) / weeks.length;
    const bw = Math.min(24, step - 8);
    const yOf = function (v) { return base - v * (base - top); };
    const fmt = function (day) { return LM.fmt.dayMonth(day); };
    const grid = [0, 0.5, 1].map(function (v) {
      return svg("g", { class: "st-grid" }, [
        svg("line", { x1: left, x2: right, y1: yOf(v), y2: yOf(v) }),
        svg("text", { x: left - 6, y: yOf(v) + 4, "text-anchor": "end", class: "st-axis" }, [Math.round(v * 100) + "%"])
      ]);
    });
    const cols = weeks.map(function (w, i) {
      const x = left + step * i + (step - bw) / 2;
      const label = "Week of " + fmt(w.start) + ": " + (w.n ? (w.acc === null ? "not enough data, " + tries(w.n) : pct(w.acc) + " right, " + tries(w.n)) : "no answers");
      const g = svg("g", { class: "st-col" + (w.acc === null ? " is-small" : ""), tabindex: w.n ? "0" : null, role: w.n ? "img" : null, "aria-label": w.n ? label : null }, [
        svg("title", null, [label]),
        svg("rect", { x: x - 4, y: top, width: bw + 8, height: base - top, class: "st-hit" })
      ]);
      if (w.n) {
        const v = w.acc === null ? w.ok / w.n : w.acc;
        const h = Math.max(4, base - yOf(v));
        // 4 px rounding only at the top end (square at the axis)
        g.appendChild(svg("path", { class: "st-bar", d: "M" + x + " " + base + "V" + (base - h + 4) + "Q" + x + " " + (base - h) + " " + (x + 4) + " " + (base - h) + "H" + (x + bw - 4) + "Q" + (x + bw) + " " + (base - h) + " " + (x + bw) + " " + (base - h + 4) + "V" + base + "Z" }));
      }
      g.appendChild(svg("text", { x: x + bw / 2, y: base + 16, "text-anchor": "middle", class: "st-axis" }, [fmt(w.start)]));
      g.appendChild(svg("text", { x: x + bw / 2, y: base + 32, "text-anchor": "middle", class: "st-axis st-n" }, [w.n ? "n=" + w.n : ""]));
      return g;
    });
    const chart = svg("svg", { class: "st-chart", viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": "Weekly accuracy over the last 12 weeks" },
      grid.concat([svg("line", { x1: left, x2: right, y1: base, y2: base, class: "st-baseline" })]).concat(cols));
    const table = el("details", { class: "st-table" }, [
      el("summary", null, "Show as a table"),
      el("div", { class: "md-table" }, el("div", { class: "md-table-wrap" }, el("table", null, [
        el("thead", null, el("tr", null, [el("th", { text: "Week of" }), el("th", { text: "Attempts" }), el("th", { text: "Accuracy" })])),
        el("tbody", null, weeks.map(function (w) {
          return el("tr", null, [el("td", { text: fmt(w.start) }), el("td", { class: "num", text: String(w.n) }), el("td", { text: w.n ? (w.acc === null ? "not enough data" : pct(w.acc)) : "—" })]);
        }))
      ])))
    ]);
    return tile("12-week trend", "st-trend", any ? [
      el("p", { class: "tool-note", text: "Accuracy week by week. Under each column, the number of attempts (n) – a lighter column means fewer than 5 attempts, so the result is only approximate." }),
      el("div", { class: "st-chart-wrap" }, chart),
      table
    ] : [emptyNote("No answers in the last 12 weeks.")], "st-wide");
  }

  // ---------- 6. Activity (heat map) ----------

  function activityTile(today) {
    const days = pd().activityDays();
    const grid = S().activityGrid(days, today, 12);
    const active = grid.reduce(function (s, col) { return s + col.filter(function (c) { return c.active; }).length; }, 0);
    const st = learn().streak(days, today);
    const streak = st.current;
    const cells = el("div", { class: "st-heat", role: "img", "aria-label": "Activity map of 12 weeks: " + active + " study days of " + (12 * 7) + "." });
    WEEKDAYS.forEach(function (d, r) {
      cells.appendChild(el("span", { class: "st-heat-day", style: "grid-row:" + (r + 1), "aria-hidden": "true", text: r % 2 === 0 ? d : "" }));
    });
    grid.forEach(function (col, c) {
      col.forEach(function (cell, r) {
        const label = LM.fmt.dayMonth(cell.day) + (cell.future ? "" : cell.active ? " – study day" : " – no study");
        cells.appendChild(el("span", {
          class: "st-cell" + (cell.active ? " is-on" : "") + (cell.future ? " is-future" : "") + (cell.day === today ? " is-today" : ""),
          style: "grid-row:" + (r + 1) + ";grid-column:" + (c + 2), title: label, "aria-hidden": "true"
        }));
      });
    });
    return tile("Activity", "st-activity", [
      el("p", { class: "st-activity-sum" }, [
        el("strong", { class: "num", text: String(active) }), " study " + (active === 1 ? "day" : "days") + " in the last 12 weeks",
        streak ? " · streak: " + plural(streak, "day") : "",
        st.longest > 1 ? " · longest streak: " + plural(st.longest, "day") : ""
      ]),
      el("div", { class: "st-heat-wrap" }, cells),
      el("p", { class: "st-legend", "aria-hidden": "true" }, [
        el("span", { class: "st-cell is-on" }), " study day ", el("span", { class: "st-cell" }), " no study"
      ])
    ]);
  }

  // ---------- 7. Mistake log ----------

  function journalTile(today) {
    const all = pd().entries();
    // State from the "My mistakes" cards (flashcard schedule), not from the old review field
    const isMastered = function (e) { const i = LM.cards ? LM.cards.mistakeInfo(e) : null; return !!(i && i.mastered); };
    const active = all.filter(function (e) { return !isMastered(e); });
    const due = LM.reviewQueue ? LM.reviewQueue.breakdown().due.mistake : 0;
    const mastered = all.length - active.length;
    const count = function (key) {
      const m = {};
      active.forEach(function (e) { const k = e[key]; if (k) m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).map(function (k) { return { k: k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
    };
    const cats = count("category"), topics = count("itemId");
    const stat = function (label, n, href) {
      return el("div", { class: "st-stat" }, [el("p", { class: "st-stat-label", text: label }), href && n ? el("a", { class: "st-stat-value", href: href, text: String(n) }) : el("p", { class: "st-stat-value", text: String(n) })]);
    };
    return tile("Mistake log", "st-journal", all.length ? [
      el("div", { class: "st-stats is-three" }, [stat("Active", active.length), stat("Due today", due, "#/review/session?only=mistakes"), stat("Mastered", mastered)]),
      cats.length ? el("p", { class: "st-tops" }, [el("span", { class: "review-label", text: "Most common categories: " }), cats.map(function (c) { return c.k + " (" + c.n + ")"; }).join(", ")]) : null,
      topics.length ? el("p", { class: "st-tops" }, [el("span", { class: "review-label", text: "Most common topics: " })].concat(topics.map(function (t, i) {
        const info = topic(t.k);
        return [i ? ", " : "", info ? el("a", { href: info.href, text: info.title }) : t.k, " (" + t.n + ")"];
      }))) : null,
      el("p", null, el("a", { class: "btn btn-secondary btn-small", href: "#/review/mistakes" }, "Open My mistakes"))
    ] : [emptyNote("The log is empty. Mistakes from exercises land here by themselves – you can turn this off in the profile menu.")]);
  }

  // =====================================================================

  function render() {
    const view = document.getElementById("view");
    const today = learn().today();
    const rec = pd().attempts();
    view.className = "view tool-view st-view";
    view.dataset.file = HASH;
    view.replaceChildren();
    document.title = "Stats · " + LM.APP.appTitle;
    const hasData = rec.items.length || Object.keys(rec.aggregates).length;
    view.appendChild(LM.ui.pageHead({ eyebrow: "Your progress · Stats", title: "Stats", lead: "Your answers in exercises, accuracy and activity. Only your own data – no comparisons with others." }));
    if (!hasData) {
      view.appendChild(LM.ui.emptyState({
        art: "empty-log", title: "Your stats will show up here", hint: "Do your first exercise set – every answer counts. After a few sets you will see which topics go best and which are worth reviewing.",
        action: el("a", { class: "btn btn-primary", href: "#/practice" }, LM.ui.withIcon("dumbbell", "Go to Practice"))
      }));
    }
    const grid = el("div", { class: "st-grid-layout" });
    if (hasData) {
      grid.appendChild(summaryTile(rec, today));
      grid.appendChild(topicsTile(rec));
      grid.appendChild(typesLevelsTile(rec));
      grid.appendChild(weakTile(rec));
      grid.appendChild(trendTile(rec, today));
    }
    grid.appendChild(activityTile(today));
    grid.appendChild(journalTile(today));
    if (LM.cards) { const f = LM.cards.statsTile(); if (f) grid.appendChild(f); } // "Flashcards" section (spec 10, 5.5)
    if (LM.trail) { const z = LM.trail.statsTile(); if (z) grid.appendChild(z); } // "Trail" section (spec v7 13, 4.2)
    view.appendChild(grid);
    U.setScroll(0);
  }

  LM.statsPage = { HASH: HASH, parseRoute: parseRoute, render: render };
})(window.LM);
