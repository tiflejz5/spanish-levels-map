/*
 * practice-hub.js — "Practice" (#/practice, spec 02, part B):
 *   1. Topic sets (content/exercises/topics.json) by level and category, with a level filter,
 *   2. Mixed sets: ready ones (content/exercises/mixes.json) and the generator,
 *   3. Weak-spot practice (spec 03, point 5): topics with ≥ 5 attempts and accuracy < 70%.
 *
 * Generator: level (range), topics (chips by category, an "All verb topics" shortcut),
 * item types (no dictation when the browser has no voice), count (10/15/20), mode. Drawing: LM.exLogic.pickMix (evenly over
 * topics, without items of the last mixed session when the pool is big enough; ≤ 2 of the same
 * type in a row) with weights from the attempts log: accuracy < 60% × 2, never seen × 1.5.
 * LM.exercises.startCustom starts the session (route #/practice/session).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const COUNTS = [10, 15, 20];

  function ex() { return LM.exercises; }
  function pd() { return LM.profileData; }

  // Page state (in the tab's memory)
  const filter = { level: "" };
  const gen = { from: "A1", to: "C2", topics: null, types: null, count: 10, mode: "learn", message: "" };

  /** Syllabus categories ({ verbs: "Verbs: tenses and moods", … }). */
  function categories() { return (LM.SYLLABUS && LM.SYLLABUS.categories) || {}; }

  /** Topic by id: { id, level, category, title, href }. */
  function topicMeta(id) {
    const t = LM.syl.topic(id);
    if (!t) return null;
    const info = ex().topicInfo(id);
    return { id: id, level: t.level, category: t.category, title: info ? info.title : t.title, href: info ? info.href : null };
  }

  function levelIn(level, from, to) {
    const i = LEVELS.indexOf(level);
    return i >= LEVELS.indexOf(from) && i <= LEVELS.indexOf(to);
  }

  function chip(label, on, onclick, extra) {
    return el("button", Object.assign({
      type: "button", class: "chip-btn" + (on ? " is-active" : ""), "aria-pressed": on ? "true" : "false", onclick: onclick
    }, extra || {}), [on ? LM.icon("check", { size: 16 }) : null, label]);
  }

  function rerender(focusSel) {
    const scroll = U.getScroll();
    render();
    U.setScroll(scroll);
    if (focusSel) setTimeout(function () { const n = document.querySelector(focusSel); if (n) n.focus({ preventScroll: true }); }, 0);
  }

  // =====================================================================
  // SECTION 1: TOPIC SETS
  // =====================================================================

  function topicSets(index) {
    const cats = categories();
    const byLevel = {};
    Object.keys(index.topics).forEach(function (t) {
      const meta = topicMeta(t);
      const level = meta ? meta.level : "A1";
      const cat = meta ? meta.category : "other";
      index.topics[t].forEach(function (id) {
        const set = index.sets[id];
        if (!set) return;
        byLevel[level] = byLevel[level] || {};
        (byLevel[level][cat] = byLevel[level][cat] || []).push(set);
      });
    });
    const levels = LEVELS.filter(function (l) { return byLevel[l]; });
    const shown = levels.filter(function (l) { return !filter.level || filter.level === l; });

    return el("section", { class: "hub-section", "aria-labelledby": "hub-topics" }, [
      el("h2", { class: "section-title", id: "hub-topics", text: "Topic sets" }),
      el("p", { class: "tool-note", text: "Each set checks one topic of the handbook. Your best and last results are saved in your profile." }),
      levels.length > 1 ? el("div", { class: "chip-filter hub-filter", role: "group", "aria-label": "Level" },
        [chip("All", !filter.level, function () { filter.level = ""; rerender(".hub-filter .is-active"); })].concat(levels.map(function (l) {
          return chip(l, filter.level === l, function () { filter.level = l; rerender(".hub-filter .is-active"); }, { class: "chip-btn lvl-" + l + (filter.level === l ? " is-active" : "") });
        }))) : null,
      levels.length ? el("div", { class: "hub-levels" }, shown.map(function (l) {
        return el("section", { class: "hub-level lvl-" + l, "aria-labelledby": "hub-l-" + l }, [
          el("h3", { class: "hub-level-title", id: "hub-l-" + l }, [el("span", { class: "chip is-level lvl-" + l, text: l }), levelName(l)]),
          el("div", null, Object.keys(byLevel[l]).map(function (c) {
            return el("div", { class: "hub-cat" }, [
              el("h4", { class: "hub-cat-title", text: cats[c] || c }),
              el("div", { class: "ex-set-grid" }, byLevel[l][c].map(ex().setCard))
            ]);
          }))
        ]);
      })) : el("p", { class: "empty-state-text", text: "There are no exercise sets yet." })
    ]);
  }

  function levelName(id) {
    return LM.syl.landName(id);
  }

  // =====================================================================
  // SECTION 2: MIXED SETS + GENERATOR
  // =====================================================================

  function mixCard(m, index) {
    const score = pd().setScore(m.id);
    const types = m.types && m.types.length ? m.types.map(function (t) { return ex().TYPE_SHORT[t]; }).join(", ") : "all item types";
    const topics = m.topics.map(topicMeta).filter(Boolean);
    const withSets = m.topics.filter(function (t) { return index.topics[t]; }).length;
    return el("article", { class: "card ex-set-card hub-mix" }, [
      el("p", { class: "hub-mix-level" }, [LM.icon("shuffle", { size: 16 }), el("span", { text: m.level })]),
      el("h3", { class: "ex-set-title", text: m.title }),
      el("p", { class: "ex-set-meta", text: m.description }),
      el("p", { class: "ex-set-meta", text: LM.plural(m.count || 10, "item") + " · " + types + " · topics: " + topics.length + (withSets < m.topics.length ? " (with items: " + withSets + ")" : "") }),
      el("p", { class: "ex-set-score" + (score ? "" : " is-empty") }, score
        ? [el("span", null, ["Best: ", el("strong", { class: "num", text: score.best.score + "/" + score.best.total })]), el("span", null, ["Last: ", el("span", { class: "num", text: score.last.score + "/" + score.last.total })])]
        : "Not done yet"),
      el("a", { class: "btn btn-primary btn-small", href: ex().BASE + "/mix/" + m.id, "aria-label": "Start: " + m.title }, LM.ui.withIcon("play", "Start"))
    ]);
  }

  /** Topics with sets in the chosen level range, grouped by category. */
  function availableTopics(index) {
    return Object.keys(index.topics).map(topicMeta).filter(function (t) { return t && levelIn(t.level, gen.from, gen.to); });
  }

  function availableTypes(index) {
    const types = {};
    Object.keys(index.sets).forEach(function (id) { Object.keys(index.sets[id].types).forEach(function (t) { types[t] = true; }); });
    // Dictation only with a voice in the browser
    if (!LM.speech.available()) delete types.dictation;
    return LM.exLogic.TYPES.filter(function (t) { return types[t]; });
  }

  function generator(index) {
    const topics = availableTopics(index);
    const ids = topics.map(function (t) { return t.id; });
    if (gen.topics === null) gen.topics = ids.slice(); // all by default
    gen.topics = gen.topics.filter(function (t) { return ids.indexOf(t) !== -1; });
    const types = availableTypes(index);
    if (gen.types === null) gen.types = types.slice();
    const cats = categories();
    const byCat = {};
    topics.forEach(function (t) { (byCat[t.category] = byCat[t.category] || []).push(t); });

    const levelSelect = function (key, label) {
      const s = el("select", { class: "field", id: "gen-" + key, onchange: function () {
        gen[key] = s.value;
        if (LEVELS.indexOf(gen.from) > LEVELS.indexOf(gen.to)) { if (key === "from") gen.to = gen.from; else gen.from = gen.to; }
        gen.topics = null; // new range: select all topics of the range
        rerender("#gen-" + key);
      } }, LEVELS.map(function (l) { return el("option", { value: l, text: l }); }));
      s.value = gen[key];
      return el("div", { class: "hub-gen-level" }, [el("label", { class: "field-label", for: "gen-" + key, text: label }), s]);
    };

    const toggle = function (list, value) {
      const i = list.indexOf(value);
      if (i === -1) list.push(value); else list.splice(i, 1);
    };

    const verbTopics = topics.filter(function (t) { return t.category === "verbs"; }).map(function (t) { return t.id; });

    return el("form", { class: "card hub-gen", "aria-labelledby": "hub-gen-title", onsubmit: function (e) { e.preventDefault(); generate(index); } }, [
      el("h3", { class: "hub-gen-title", id: "hub-gen-title" }, [el("span", { "aria-hidden": "true" }, LM.icon("shuffle", { size: 20 })), "Make your own set"]),
      el("fieldset", { class: "hub-gen-row" }, [
        el("legend", { class: "field-label", text: "Level" }),
        el("div", { class: "hub-gen-levels" }, [levelSelect("from", "from"), levelSelect("to", "to")])
      ]),
      el("fieldset", { class: "hub-gen-row" }, [
        el("legend", { class: "field-label", text: "Topics (" + gen.topics.length + " of " + topics.length + ")" }),
        topics.length ? el("div", { class: "hub-gen-shortcuts" }, [
          verbTopics.length ? el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { gen.topics = verbTopics.slice(); rerender(".hub-gen-shortcuts .btn"); } }, "All verb topics") : null,
          el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { gen.topics = ids.slice(); rerender(".hub-gen-shortcuts .btn"); } }, "Select all"),
          el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { gen.topics = []; rerender(".hub-gen-shortcuts .btn"); } }, "Clear")
        ]) : el("p", { class: "tool-note", text: "There are no sets in this level range yet." }),
        el("div", null, Object.keys(byCat).map(function (c) {
          return el("div", { class: "hub-gen-cat" }, [
            el("p", { class: "hub-gen-cat-title", text: cats[c] || c }),
            el("div", { class: "chip-filter", role: "group", "aria-label": cats[c] || c }, byCat[c].map(function (t) {
              const on = gen.topics.indexOf(t.id) !== -1;
              return chip(t.level + " · " + t.title, on, function () { toggle(gen.topics, t.id); rerender("[data-topic='" + t.id + "']"); }, { "data-topic": t.id, class: "chip-btn lvl-" + t.level + (on ? " is-active" : "") });
            }))
          ]);
        }))
      ]),
      el("fieldset", { class: "hub-gen-row" }, [
        el("legend", { class: "field-label", text: "Item types" }),
        el("div", { class: "chip-filter", role: "group" }, types.map(function (t) {
          const on = gen.types.indexOf(t) !== -1;
          return chip(ex().TYPE_SHORT[t], on, function () { toggle(gen.types, t); rerender("[data-type='" + t + "']"); }, { "data-type": t });
        }))
      ]),
      el("div", { class: "hub-gen-two" }, [
        el("fieldset", { class: "hub-gen-row" }, [
          el("legend", { class: "field-label", text: "Number of items" }),
          el("div", { class: "hub-radios" }, COUNTS.map(function (n) {
            return el("label", { class: "hub-radio" + (gen.count === n ? " is-chosen" : "") }, [
              el("input", { type: "radio", name: "gen-count", value: String(n), checked: gen.count === n, onchange: function () { gen.count = n; rerender("input[name=gen-count][value='" + n + "']"); } }),
              el("span", { text: String(n) })
            ]);
          }))
        ]),
        el("fieldset", { class: "hub-gen-row" }, [
          el("legend", { class: "field-label", text: "Mode" }),
          el("div", { class: "hub-radios" }, [["learn", "Learn"], ["exam", "Exam"]].map(function (m) {
            return el("label", { class: "hub-radio" + (gen.mode === m[0] ? " is-chosen" : "") }, [
              el("input", { type: "radio", name: "gen-mode", value: m[0], checked: gen.mode === m[0], onchange: function () { gen.mode = m[0]; rerender("input[name=gen-mode][value='" + m[0] + "']"); } }),
              el("span", { text: m[1] })
            ]);
          }))
        ])
      ]),
      el("p", { class: "hub-gen-msg", role: "status", "aria-live": "polite", text: gen.message }),
      el("div", { class: "tool-actions" }, el("button", { type: "submit", class: "btn btn-primary" }, LM.ui.withIcon("shuffle", "Draw a set")))
    ]);
  }

  /** Draws a set from the form and starts the session. */
  function generate(index) {
    const msg = document.querySelector(".hub-gen-msg");
    const say = function (text) { gen.message = text; if (msg) msg.textContent = text; };
    if (!gen.topics.length) return say("Choose at least one topic.");
    if (!gen.types.length) return say("Choose at least one item type.");
    say("Drawing…");
    const topics = gen.topics.slice(), types = gen.types.slice(), from = gen.from, to = gen.to, count = gen.count, mode = gen.mode;
    function pick() {
      return ex().loadTopicItems(topics).then(function (pool) {
        pool = ex().playablePool(pool).filter(function (it) { return !it.level || levelIn(it.level, from, to); });
        const res = LM.exLogic.pickMix(pool, { count: count, types: types, exclude: pd().lastMix(), weight: LM.stats.mixWeight(pd().attempts()) });
        return res;
      });
    }
    // "Draw a new set" on the result screen draws again with the same settings
    function launch(res, autostart) {
      const short = res.items.length < count;
      ex().startCustom({
        title: "Mixed set",
        intro: (short ? "There are only " + LM.plural(res.available, "matching item") + " for now, so the set has " + res.items.length + " instead of " + count + ". " : "") +
          "Topics: " + topics.length + ", level " + (from === to ? from : from + "–" + to) + ".",
        items: res.items,
        mode: mode,
        repick: function () { pick().then(function (again) { launch(again, true); }); },
        autostart: !!autostart
      });
    }
    pick().then(function (res) {
      if (!res.items.length) return say("No items for this choice. Change the topics or the item types.");
      gen.message = "";
      launch(res);
    });
  }

  // =====================================================================
  // SECTION 3: WEAK-SPOT PRACTICE
  // =====================================================================

  function weakCard() {
    const weak = LM.stats.weakTopics(pd().attempts());
    return el("div", { class: "card hub-soon hub-weak" }, [
      el("span", { class: "hub-soon-icon", "aria-hidden": "true" }, LM.icon("target", { size: 22 })),
      el("div", null, weak.length ? [
        el("p", { class: "hub-soon-title" }, [el("strong", { text: "What you find hardest:" })]),
        el("ul", { class: "hub-weak-list" }, weak.map(function (w) {
          const t = ex().topicInfo(w.key);
          return el("li", null, [t ? el("a", { href: t.href, text: t.title }) : w.key, el("span", { class: "tool-note", text: " – " + Math.round(w.acc * 100) + "% of " + LM.plural(w.n, "attempt") })]);
        })),
        el("p", { class: "tool-note", text: "12 items from these topics; the ones you missed lately come up more often." }),
        el("a", { class: "btn btn-primary", href: ex().BASE + "/weak" }, LM.ui.withIcon("target", "Start practice"))
      ] : [
        el("p", { class: "hub-soon-title" }, [el("strong", { text: "No weak spots so far" })]),
        el("p", { class: "tool-note", text: "Do a few sets and you will see what to work on. This practice appears when a topic has at least 5 attempts and accuracy below 70%." })
      ])
    ]);
  }

  // =====================================================================
  // DRAWING
  // =====================================================================

  function render(route) {
    const view = document.getElementById("view");
    view.className = "view tool-view hub-view";
    view.dataset.file = ex().BASE;
    view.replaceChildren(LM.ui.pageHead({ eyebrow: "Learn · Practice", title: "Practice", lead: "Exercise sets for each topic, ready mixed sets and sets you draw yourself. Multiple choice, put in order, find the mistake, fill the gaps, match pairs, rewrite the sentence, translate and dictation – in Learn mode or Exam mode. Results count in points." }));
    document.title = "Practice · " + LM.APP.appTitle;
    ex().loadIndex().then(function (index) {
      const now = ex().parseRoute(location.hash);
      if (!now || now.kind !== "hub") return; // the page changed in the meantime
      U.appendChildren(view, [
        topicSets(index),
        el("section", { class: "hub-section", id: "mixes", "aria-labelledby": "hub-mixes" }, [
          el("h2", { class: "section-title", id: "hub-mixes", text: "Mixed sets" }),
          el("p", { class: "tool-note", text: "Items from several topics at once – with no hint which tense or structure you need." }),
          index.mixes.length ? el("div", { class: "ex-set-grid" }, index.mixes.map(function (m) { return mixCard(m, index); })) : null,
          generator(index)
        ]),
        el("section", { class: "hub-section", "aria-labelledby": "hub-weak" }, [
          el("h2", { class: "section-title", id: "hub-weak", text: "Weak-spot practice" }),
          weakCard()
        ])
      ]);
      if (route && route.section === "mixes") {
        const sec = document.getElementById("mixes");
        if (sec) { sec.scrollIntoView({ block: "start" }); sec.setAttribute("tabindex", "-1"); sec.focus({ preventScroll: true }); }
      }
    });
  }

  LM.practiceHub = { render: render };
})(window.LM);
