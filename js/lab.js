/*
 * lab.js — the Tense & Mood Lab view (spec 06 E7). Its title comes from LM.APP.lab.title.
 *
 * Everything language-specific comes from the data (LM.LAB, data/lab.js, loaded on demand): the grid axes, the cards,
 * the contrast cards and any number of decision trees. Pure logic: js/lab-logic.js (LM.labLogic). The timeline
 * drawing is the reusable js/timeline.js (LM.timeline).
 *
 * Tabs (each its own address; routes in js/lab-logic.js):
 *   Map        #/lab                     the grid (columns × rows from axes), contrast cards, decision trees
 *   Card       #/lab/<card id>           timeline scenes, formation rows, uses with listen buttons, signals, traps,
 *                                        contrasts, practice; notes button "lab:<id>"
 *   Contrasts  #/lab/contrasts, #/lab/contrast/<id>   two columns of rules with examples, mini quiz (4 items, exercise engine)
 *   Decide     #/lab/pick, #/lab/pick/<tree id>       decision trees (rules in the data, not AI)
 *   Compare    #/lab/compare[/<a>/<b>]   two cards side by side and the contrast rules written for the pair
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const BASE = "#/lab";

  function LL() { return LM.labLogic; }
  function lab() { return LM.LAB || null; }
  function tl() { return LM.timeline; }
  function tlang() { return LM.APP.targetLang; }

  // Tab state (memory of the tab)
  let lastCard = null;
  let lastContrast = null;
  const choicesOf = {}; // tree id → chosen option indexes

  function load() {
    if (LM.LAB) return Promise.resolve(LM.LAB);
    return LM.loadModule("data/lab.js").then(function () { return LM.LAB; }, function (e) { console.warn(e.message + " — run: npm run build"); return null; });
  }

  // =====================================================================
  // SHARED ELEMENTS
  // =====================================================================

  function listen(host, text, label) {
    if (!text || !LM.markdown || !LM.markdown.listenButton) return null;
    return LM.markdown.listenButton(host, function () { return text; }, label || "Listen: " + text);
  }

  /** A target-language line with a listen button: <p class="lab-say"><span lang>text</span>[button]</p>. */
  function sayLine(text, cls) {
    const p = el("p", { class: "lab-say" + (cls ? " " + cls : "") }, el("span", { lang: tlang(), text: text }));
    const b = listen(p, text);
    if (b) p.appendChild(b);
    return p;
  }

  function levelChip(level) { return el("span", { class: "chip is-level lvl-" + level, text: level }); }
  function toneClass(c) { return "lab-tone-" + LL().toneOf(lab(), c.column); }
  function section(title, body, cls) {
    return el("section", { class: "lab-block" + (cls ? " " + cls : "") }, [el("h3", { class: "lab-block-title", text: title }), body]);
  }
  function trapsBox(traps) {
    if (!traps || !traps.length) return null;
    return el("section", { class: "callout callout-trap lab-traps" }, [
      el("h3", { class: "callout-title" }, [el("span", { class: "callout-icon", "aria-hidden": "true" }, LM.icon("triangle-alert", { size: 20 })), LM.APP.mistakesHeading]),
      el("ul", null, traps.map(function (x) { return el("li", { text: x }); }))
    ]);
  }
  function notFound(view, text) {
    view.appendChild(el("div", { class: "empty-state" }, [
      el("p", { class: "empty-state-text", text: text }),
      el("p", null, el("a", { class: "btn btn-secondary", href: BASE }, "Back to the map"))
    ]));
  }
  /** "Name" of a contrast card with both sides in the target language: ser vs estar. */
  function contrastName(k) {
    const out = [];
    (k.sides || []).forEach(function (s, i) {
      if (i) out.push(" vs ");
      out.push(el("span", { lang: tlang(), text: s.name }));
    });
    return out;
  }

  function tabs(active) {
    const d = lab();
    const items = [
      { id: "map", label: "Map", icon: "layout-grid", href: BASE },
      { id: "card", label: "Card", icon: "notebook-text", href: BASE + "/" + (lastCard || (d && d.cards[0] ? d.cards[0].id : "")) },
      { id: "contrasts", label: "Contrasts", icon: "split", href: lastContrast ? LL().routeOf("contrast", lastContrast) : BASE + "/contrasts" },
      { id: "pick", label: "Decide", icon: "route", href: BASE + "/pick" },
      { id: "compare", label: "Compare", icon: "arrow-left-right", href: BASE + "/compare" }
    ];
    return el("nav", { class: "lab-tabs", "aria-label": LM.APP.lab.title + " tabs" }, el("ul", null, items.map(function (it) {
      const on = it.id === active;
      return el("li", null, el("a", { class: "lab-tab" + (on ? " is-active" : ""), href: it.href, "aria-current": on ? "page" : null }, [
        el("span", { "aria-hidden": "true" }, LM.icon(it.icon, { size: 18 })),
        el("span", { text: it.label })
      ]));
    })));
  }

  function header(active) {
    return [
      LM.ui.pageHead({ eyebrow: "Learn · " + LM.APP.lab.title, title: LM.APP.lab.title, lead: "Tenses and moods on a timeline. Compare them, check the tricky pairs and let a few questions show you which form fits.", className: "lab-head" }),
      tabs(active)
    ];
  }

  // =====================================================================
  // TAB: MAP
  // =====================================================================

  function tile(c) {
    return el("a", { class: "lab-tile lvl-" + c.level, href: LL().routeOf("card", c.id) }, [
      el("span", { class: "lab-tile-top" }, [el("span", { class: "lab-tile-name", lang: tlang(), text: c.name }), levelChip(c.level)]),
      el("span", { class: "lab-tile-note", text: c.nameEn }),
      c.uses && c.uses[0] ? el("span", { class: "lab-tile-ex", lang: tlang(), text: c.uses[0].text }) : null
    ]);
  }

  function contrastTile(k) {
    return el("a", { class: "lab-tile lvl-" + k.level, href: LL().routeOf("contrast", k.id) }, [
      el("span", { class: "lab-tile-top" }, [el("span", { class: "lab-tile-name" }, contrastName(k)), levelChip(k.level)]),
      el("span", { class: "lab-tile-note", text: k.summary })
    ]);
  }

  function treeTile(t) {
    return el("a", { class: "lab-tile lvl-" + t.level, href: LL().routeOf("tree", t.id) }, [
      el("span", { class: "lab-tile-top" }, [el("span", { class: "lab-tile-name", text: t.title }), levelChip(t.level)]),
      t.intro ? el("span", { class: "lab-tile-note", text: t.intro }) : null
    ]);
  }

  /** The grid as a table: column headers (time), row headers (mood), cells with tiles; a block per row under 760 px. */
  function gridTable(g) {
    return el("div", { class: "lab-grid-wrap" }, el("table", { class: "lab-grid", style: "--lab-cols:" + g.columns.length }, [
      el("caption", { class: "visually-hidden", text: "Map: " + g.columns.map(function (c) { return c.label; }).join(", ") + " by " + g.rows.map(function (r) { return r.label; }).join(", ") }),
      el("thead", null, el("tr", null, [el("td", { class: "lab-grid-corner" })].concat(g.columns.map(function (c, i) {
        return el("th", { scope: "col", class: "lab-col-title lab-tone-" + ((i % 3) + 1), text: c.label });
      })))),
      el("tbody", null, g.rows.map(function (r, ri) {
        return el("tr", null, [el("th", { scope: "row", class: "lab-row-title", text: r.label })].concat(g.columns.map(function (c, ci) {
          const list = g.cells[ri][ci];
          return el("td", { class: "lab-cell lab-tone-" + ((ci % 3) + 1), "data-label": c.label }, list.length
            ? el("ul", { class: "lab-cell-list" }, list.map(function (x) { return el("li", null, tile(x)); }))
            : el("span", { class: "lab-tile is-empty" }, el("span", { class: "lab-tile-note", text: "No card yet" })));
        })));
      }))
    ]));
  }

  function renderMap(view) {
    const d = lab();
    const g = LL().grid(d);
    view.appendChild(el("section", { class: "lab-section", "aria-labelledby": "lab-map-title" }, [
      el("h2", { class: "section-title", id: "lab-map-title", text: "Map" }),
      el("p", { class: "tool-note", text: "Columns are time, rows are mood. The code on a tile is the level where the form first appears. Open a tile to see the form on a timeline." }),
      gridTable(g)
    ]));
    if (d.contrasts.length) {
      view.appendChild(el("section", { class: "lab-section", "aria-labelledby": "lab-ctr-title" }, [
        el("h2", { class: "section-title", id: "lab-ctr-title", text: "Contrast cards" }),
        el("p", { class: "tool-note", text: "Pairs that are easy to mix up, rule by rule, with a short quiz." }),
        el("div", { class: "lab-forms" }, d.contrasts.map(contrastTile))
      ]));
    }
    if (d.trees.length) {
      view.appendChild(el("section", { class: "lab-section", "aria-labelledby": "lab-trees-title" }, [
        el("h2", { class: "section-title", id: "lab-trees-title", text: "Decide" }),
        el("p", { class: "tool-note", text: "Answer a few questions about your sentence and see which form fits." }),
        el("div", { class: "lab-forms" }, d.trees.map(treeTile))
      ]));
    }
  }

  // =====================================================================
  // TAB: CARD
  // =====================================================================

  function formationTable(c) {
    return el("div", { class: "md-table" }, el("div", { class: "md-table-wrap" }, el("table", { class: "lab-formation" }, [
      el("tbody", null, (c.formation || []).map(function (f) {
        return el("tr", null, [el("th", { scope: "row", text: f.label }), el("td", { lang: tlang(), text: f.text })]);
      }))
    ])));
  }

  function usesList(c) {
    return el("ul", { class: "lab-uses" }, c.uses.map(function (u) {
      return el("li", { class: "card lab-use" }, [
        el("p", { class: "lab-use-label", text: u.label }),
        sayLine(u.text, "lab-use-text"),
        el("p", { class: "lab-use-gloss", text: u.en })
      ]);
    }));
  }

  function renderCard(view, id) {
    const d = lab();
    const c = LL().card(d, id);
    if (!c) { notFound(view, "There is no such card in the Lab."); return; }
    lastCard = c.id;
    document.title = c.name + " · " + LM.APP.lab.title;
    const where = LL().axisLabel(d, "columns", c.column) + " · " + LL().axisLabel(d, "rows", c.row);
    const card = el("article", { class: "lab-card lvl-" + c.level + " " + toneClass(c), "aria-labelledby": "lab-card-title" });
    card.appendChild(el("header", { class: "card lab-card-head" }, [
      el("div", { class: "lab-card-top" }, [
        el("p", { class: "lab-card-eyebrow" }, [levelChip(c.level), el("span", { text: where })]),
        LM.notes ? LM.notes.button("lab:" + c.id, { title: LM.APP.lab.title + " · " + c.name, route: LL().routeOf("card", c.id) }) : null
      ]),
      el("h2", { class: "lab-card-title", id: "lab-card-title", lang: tlang(), text: c.name }),
      el("p", { class: "lab-card-gloss", text: c.nameEn }),
      el("p", { class: "lab-card-summary", text: c.summary })
    ]));
    card.appendChild(section("Timeline", tl().block({ id: c.id, title: c.name, scenes: c.scenes })));
    card.appendChild(section("Form", formationTable(c)));
    card.appendChild(section("Uses", usesList(c)));
    if (c.signals && c.signals.length) {
      card.appendChild(section("Signal words", el("ul", { class: "lab-signals" }, c.signals.map(function (s) {
        return el("li", null, el("span", { class: "chip", lang: tlang(), text: s }));
      }))));
    }
    const traps = trapsBox(c.traps);
    if (traps) card.appendChild(traps);
    if (c.contrasts && c.contrasts.length) {
      card.appendChild(section("Compare with…", el("ul", { class: "lab-contrasts" }, c.contrasts.map(function (k) {
        const other = LL().card(d, k.with);
        return el("li", { class: "card lab-contrast" }, [
          el("p", { class: "lab-contrast-head" }, [el("strong", { lang: tlang(), text: c.name }), " vs ", other ? el("strong", { lang: tlang(), text: other.name }) : el("span", { text: "a card that is not in the Lab yet" })]),
          el("p", { text: k.rule }),
          k.examples && k.examples.length ? el("ul", { class: "lab-contrast-ex" }, k.examples.map(function (x) { return el("li", null, sayLine(x)); })) : null,
          other ? el("a", { class: "btn btn-secondary btn-small", href: BASE + "/compare/" + c.id + "/" + other.id }, LM.ui.withIcon("arrow-left-right", "Compare side by side")) : null
        ]);
      }))));
    }
    const related = LL().relatedContrasts(d, c);
    if (related.length) card.appendChild(section("Contrast cards", el("div", { class: "lab-forms" }, related.map(contrastTile))));
    const practice = el("div", { class: "lab-practice" }, el("p", { class: "tool-note", text: "Loading sets…" }));
    card.appendChild(section("Practice", practice));
    fillPractice(practice, c.topicIds || []);
    view.appendChild(card);
  }

  /** Sets of the linked topics, mixed sets with those topics, and the topic pages. */
  function fillPractice(box, ids) {
    if (!LM.exercises) { box.replaceChildren(); return; }
    LM.exercises.loadIndex().then(function (index) {
      const setIds = [];
      ids.forEach(function (n) { (index.topics[n] || []).forEach(function (s) { if (setIds.indexOf(s) === -1) setIds.push(s); }); });
      const mixes = index.mixes.filter(function (m) { return m.topics.some(function (x) { return ids.indexOf(x) !== -1; }); });
      const pages = ids.map(LM.exercises.topicInfo).filter(Boolean);
      box.replaceChildren();
      U.appendChildren(box, [
        setIds.length ? el("div", { class: "ex-set-grid" }, setIds.map(function (s) { return index.sets[s]; }).filter(Boolean).map(LM.exercises.setCard))
          : el("p", { class: "tool-note", text: "Exercise sets for these topics are still being written." }),
        mixes.length ? el("p", { class: "lab-practice-links" }, mixes.map(function (m) {
          return el("a", { class: "btn btn-secondary", href: LM.exercises.BASE + "/mix/" + m.id }, LM.ui.withIcon("shuffle", "Mixed set: " + m.title));
        })) : null,
        pages.length ? el("p", { class: "lab-practice-links" }, pages.map(function (p) {
          return el("a", { class: "wiki-link wiki-chip lvl-" + p.level, href: p.href }, [LM.icon("notebook-text", { size: 14 }), el("span", { class: "wiki-chip-level", text: p.level }), el("span", { class: "wiki-chip-text", text: p.title })]);
        })) : null
      ]);
    });
  }

  // =====================================================================
  // TAB: CONTRASTS
  // =====================================================================

  function renderContrasts(view, id) {
    const d = lab();
    if (!id) {
      view.appendChild(el("section", { class: "lab-section", "aria-labelledby": "lab-ctr-title" }, [
        el("h2", { class: "section-title", id: "lab-ctr-title", text: "Contrast cards" }),
        d.contrasts.length ? el("div", { class: "lab-forms" }, d.contrasts.map(contrastTile)) : el("p", { class: "tool-note", text: "Contrast cards are still being written." })
      ]));
      return;
    }
    const k = LL().contrast(d, id);
    if (!k) { notFound(view, "There is no such contrast card in the Lab."); return; }
    lastContrast = k.id;
    document.title = LL().contrastTitle(k) + " · " + LM.APP.lab.title;
    const art = el("article", { class: "lab-card lab-ctr lvl-" + k.level, "aria-labelledby": "lab-card-title" });
    art.appendChild(el("header", { class: "card lab-card-head" }, [
      el("div", { class: "lab-card-top" }, [
        el("p", { class: "lab-card-eyebrow" }, [levelChip(k.level), el("span", { text: "Contrast card" })]),
        LM.notes ? LM.notes.button("lab:" + k.id, { title: LM.APP.lab.title + " · " + LL().contrastTitle(k), route: LL().routeOf("contrast", k.id) }) : null
      ]),
      el("h2", { class: "lab-card-title", id: "lab-card-title" }, contrastName(k)),
      el("p", { class: "lab-card-summary", text: k.summary })
    ]));
    art.appendChild(el("div", { class: "lab-sides" }, k.sides.map(function (s, i) {
      const hid = "lab-side-" + (i + 1);
      return el("section", { class: "card lab-side lab-tone-" + (i === 0 ? 1 : 3), "aria-labelledby": hid }, [
        el("h3", { class: "lab-side-title", id: hid }, [el("span", { lang: tlang(), text: s.name }), el("span", { class: "lab-side-gloss", text: s.nameEn })]),
        el("ul", { class: "lab-rules" }, s.rules.map(function (r) {
          return el("li", { class: "lab-rule" }, [
            r.label ? el("p", { class: "lab-use-label", text: r.label }) : null,
            el("p", { class: "lab-rule-text", text: r.text }),
            el("ul", { class: "lab-rule-ex" }, r.examples.map(function (x) {
              return el("li", null, [sayLine(x.text), el("p", { class: "lab-use-gloss", text: x.en })]);
            }))
          ]);
        }))
      ]);
    })));
    if (k.tip) art.appendChild(el("p", { class: "card lab-tip" }, [el("span", { class: "lab-tip-icon", "aria-hidden": "true" }, LM.icon("info", { size: 20 })), el("span", { text: k.tip })]));
    const traps = trapsBox(k.traps);
    if (traps) art.appendChild(traps);
    const items = (k.quiz && k.quiz.items) || [];
    if (items.length) {
      art.appendChild(section("Check yourself", el("div", { class: "card lab-quiz" }, [
        el("p", { text: LM.plural(items.length, "question") + " on this pair. Wrong answers go to your mistake log, like in any exercise." }),
        el("button", { type: "button", class: "btn btn-primary", onclick: function () { startQuiz(k); } }, LM.ui.withIcon("play", "Start the quiz"))
      ])));
    }
    const practice = el("div", { class: "lab-practice" }, el("p", { class: "tool-note", text: "Loading sets…" }));
    art.appendChild(section("Practice", practice));
    fillPractice(practice, k.topicIds || []);
    view.appendChild(art);
  }

  /** The mini quiz in the exercise engine (Learn mode), back to this card. */
  function startQuiz(k) {
    const items = k.quiz.items.map(function (it) {
      return Object.assign({ topic: (k.topicIds || [])[0] || null, level: k.level, setId: "lab-" + k.id, tags: ["lab"] }, it);
    });
    LM.exercises.startCustom({
      title: "Quiz: " + LL().contrastTitle(k), intro: k.summary, items: items, mode: "learn", autostart: true,
      back: { href: LL().routeOf("contrast", k.id), label: "Back to the contrast card" }
    });
  }

  // =====================================================================
  // TAB: DECIDE (decision trees)
  // =====================================================================

  function renderPick(view, id) {
    const d = lab();
    if (!d.trees.length) { view.appendChild(el("p", { class: "tool-note", text: "Decision trees are still being written." })); return; }
    const t = id ? LL().tree(d, id) : (d.trees.length === 1 ? d.trees[0] : null);
    if (!t && id) { notFound(view, "There is no such decision tree in the Lab."); return; }
    if (!t) {
      view.appendChild(el("section", { class: "lab-section", "aria-labelledby": "lab-trees-title" }, [
        el("h2", { class: "section-title", id: "lab-trees-title", text: "Decide" }),
        el("p", { class: "tool-note", text: "Pick a question. A few answers about your sentence lead to the form that fits." }),
        el("div", { class: "lab-forms" }, d.trees.map(treeTile))
      ]));
      return;
    }
    document.title = t.title + " · " + LM.APP.lab.title;
    const choices = choicesOf[t.id] || (choicesOf[t.id] = []);
    const w = LL().walk(t, choices);
    const crumbs = el("ol", { class: "lab-path", "aria-label": "Your choices" }, [el("li", { text: "Start" })].concat(w.steps.map(function (s) {
      return el("li", { text: s.option.label });
    })));
    const body = [];
    if (w.node) {
      body.push(el("h2", { class: "lab-question", id: "lab-q", tabindex: "-1", text: w.node.question }));
      if (w.node.help) body.push(el("p", { class: "tool-note", text: w.node.help }));
      body.push(el("ul", { class: "lab-answers", "aria-labelledby": "lab-q" }, w.node.options.map(function (o, i) {
        return el("li", null, el("button", {
          type: "button", class: "lab-answer",
          onclick: function () { choices.push(i); renderAgain("#lab-q, .lab-result-title"); }
        }, [el("span", { text: o.label }), el("span", { "aria-hidden": "true" }, LM.icon("chevron-right", { size: 18 }))]));
      })));
    } else if (w.result) {
      body.push.apply(body, resultBlock(d, w.result));
    }
    body.push(el("div", { class: "tool-actions" }, [
      choices.length ? el("button", { type: "button", class: "btn btn-secondary", onclick: function () { choices.pop(); renderAgain("#lab-q"); } }, LM.ui.withIcon("arrow-left", "Back")) : null,
      choices.length ? el("button", { type: "button", class: "btn btn-link", onclick: function () { choices.length = 0; renderAgain("#lab-q"); } }, LM.ui.withIcon("rotate-ccw", "Start over")) : null
    ]));
    view.appendChild(el("section", { class: "card lab-pick", "aria-labelledby": "lab-tree-title" }, [
      el("p", { class: "lab-pick-eyebrow" }, [levelChip(t.level), el("span", { id: "lab-tree-title", text: t.title })]),
      t.intro && !choices.length ? el("p", { class: "tool-note", text: t.intro }) : null,
      crumbs
    ].concat(body)));
    const others = d.trees.filter(function (x) { return x.id !== t.id; });
    if (others.length) view.appendChild(el("p", { class: "lab-practice-links" }, others.map(function (x) {
      return el("a", { class: "btn btn-secondary", href: LL().routeOf("tree", x.id) }, LM.ui.withIcon("route", x.title));
    })));
    view.appendChild(el("p", { class: "tool-note", text: "These are rules written in the data, not artificial intelligence: the same answers always lead to the same result." }));
  }

  /** The end of a path: the answer (target language), why, an example, then the linked cards. */
  function resultBlock(d, o) {
    const linked = (o.result || []).map(function (id) { return LL().entry(d, id); }).filter(Boolean);
    const cards = linked.filter(function (e) { return e.kind === "card"; });
    const out = [];
    if (o.answer) out.push(el("h2", { class: "lab-question lab-result-title", tabindex: "-1" }, ["Use ", el("span", { class: "lab-answer-word", lang: tlang(), text: o.answer })]));
    else if (cards.length) out.push(el("h2", { class: "lab-question lab-result-title", tabindex: "-1" }, cards.length > 1 ? "These fit:" : ["This fits: ", el("span", { lang: tlang(), text: cards[0].item.name })]));
    else out.push(el("h2", { class: "lab-question lab-result-title", tabindex: "-1", text: "Result" }));
    out.push(el("p", { class: "lab-why", text: o.why }));
    if (o.example) out.push(el("div", { class: "lab-result-ex" }, [sayLine(o.example.text), el("p", { class: "lab-use-gloss", text: o.example.en })]));
    if (linked.length) out.push(el("ul", { class: "lab-results" }, linked.map(function (e) {
      const x = e.item;
      if (e.kind === "contrast") {
        return el("li", { class: "card lab-result lvl-" + x.level }, [
          el("p", { class: "lab-result-name" }, [el("strong", null, contrastName(x)), " ", levelChip(x.level)]),
          el("p", { text: x.summary }),
          el("a", { class: "btn btn-primary btn-small", href: e.route }, LM.ui.withIcon("arrow-right", "Open the contrast card"))
        ]);
      }
      return el("li", { class: "card lab-result lvl-" + x.level + " " + toneClass(x) }, [
        el("p", { class: "lab-result-name" }, [el("strong", { lang: tlang(), text: x.name }), " ", levelChip(x.level)]),
        el("p", { text: x.summary }),
        x.uses[0] ? sayLine(x.uses[0].text) : null,
        el("a", { class: "btn btn-primary btn-small", href: e.route }, LM.ui.withIcon("arrow-right", "Open the card"))
      ]);
    })));
    return out;
  }

  function renderAgain(focusSel) {
    render(LL().parseRoute(location.hash));
    setTimeout(function () { const n = document.querySelector(focusSel); if (n) n.focus({ preventScroll: true }); }, 0);
  }

  // =====================================================================
  // TAB: COMPARE
  // =====================================================================

  function renderCompare(view, route) {
    const d = lab();
    const pair = LL().comparePair(d, route.a, route.b, lastCard);
    if (!pair) { view.appendChild(el("p", { class: "tool-note", text: "Comparing needs at least two cards." })); return; }
    const a = pair.a, b = pair.b;
    const select = function (id, value, label) {
      const s = el("select", { class: "field lab-select", id: id, onchange: function () {
        location.hash = BASE + "/compare/" + document.getElementById("lab-a").value + "/" + document.getElementById("lab-b").value;
      } }, d.cards.map(function (c) { return el("option", { value: c.id, text: c.name + " (" + c.nameEn + ", " + c.level + ")" }); }));
      s.value = value;
      return el("div", { class: "lab-select-wrap" }, [el("label", { class: "field-label", for: id, text: label }), s]);
    };
    view.appendChild(el("div", { class: "card lab-compare-pick" }, [
      select("lab-a", a.id, "First card"),
      el("span", { class: "lab-vs", "aria-hidden": "true" }, LM.icon("arrow-left-right", { size: 20 })),
      select("lab-b", b.id, "Second card")
    ]));
    const column = function (c) {
      return el("section", { class: "card lab-compare-col lvl-" + c.level + " " + toneClass(c), "aria-labelledby": "cmp-" + c.id }, [
        el("h2", { class: "lab-card-title", id: "cmp-" + c.id }, [el("span", { lang: tlang(), text: c.name }), " ", levelChip(c.level)]),
        el("p", { class: "lab-card-gloss", text: c.nameEn + " – " + c.summary }),
        tl().block({ id: c.id, title: c.name, scenes: c.scenes }, { noSwitch: true, animate: false, compact: true }),
        el("h3", { class: "lab-block-title", text: "Form" }),
        formationTable(c),
        el("h3", { class: "lab-block-title", text: "When to use it" }),
        el("ul", { class: "lab-when" }, c.uses.map(function (u) { return el("li", null, [el("strong", { text: u.label + ": " }), el("span", { lang: tlang(), text: u.text })]); })),
        c.traps && c.traps.length ? el("h3", { class: "lab-block-title", text: LM.APP.mistakesHeading }) : null,
        c.traps && c.traps.length ? el("ul", { class: "lab-when" }, c.traps.map(function (x) { return el("li", { text: x }); })) : null
      ]);
    };
    view.appendChild(el("div", { class: "lab-compare" }, [column(a), column(b)]));
    const rules = LL().diffs(a, b);
    view.appendChild(el("section", { class: "card lab-diff", "aria-labelledby": "lab-diff-title" }, [
      el("h2", { class: "section-title", id: "lab-diff-title", text: "Differences" }),
      rules.length ? el("div", { class: "md-table" }, el("div", { class: "md-table-wrap" }, el("table", null, [
        el("thead", null, el("tr", null, [el("th", { text: "Rule" }), el("th", { text: "Examples" })])),
        el("tbody", null, rules.map(function (r) {
          return el("tr", null, [el("td", { "data-label": "Rule", text: r.rule }), el("td", { "data-label": "Examples" }, r.examples.map(function (x) { return sayLine(x, "lab-diff-ex"); }))]);
        }))
      ]))) : el("p", { class: "tool-note", text: "No rule is written for this pair yet. Compare the timelines and the forms above." })
    ]));
    tl().animateAll(view);
  }

  // =====================================================================
  // DRAWING
  // =====================================================================

  /** Skeleton until data/lab.js is loaded (the grid size is not known yet: three bars). One "Loading…" message for screen readers. */
  function skeleton() {
    return el("div", { class: "lab-skeleton", "aria-busy": "true" }, [
      el("p", { class: "visually-hidden", role: "status", text: "Loading the Lab…" }),
      el("div", { class: "lab-skel-bar lab-skel-wide", "aria-hidden": "true" }),
      el("div", { class: "lab-skel-bar", "aria-hidden": "true" }),
      el("div", { class: "lab-skel-bar lab-skel-short", "aria-hidden": "true" })
    ]);
  }

  /** Preloads the Lab data ahead of time (browser idle, hovering a link), without drawing. */
  function prefetch() { if (!LM.LAB) load(); }

  function bindPrefetch() {
    const near = function (e) { const a = e.target && e.target.closest && e.target.closest('a[href^="' + BASE + '"]'); if (a) prefetch(); };
    ["pointerover", "focusin", "touchstart"].forEach(function (type) { document.addEventListener(type, near, { passive: true }); });
    const conn = navigator.connection;
    if (conn && conn.saveData) return; // data saver mode: only on demand
    const idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 2500); };
    idle(prefetch, { timeout: 5000 });
  }
  if (document.readyState === "complete") bindPrefetch();
  else window.addEventListener("load", bindPrefetch, { once: true });

  function render(route) {
    route = route || LL().parseRoute(location.hash) || { tab: "map" };
    const view = document.getElementById("view");
    view.className = "view tool-view lab-view";
    view.dataset.file = BASE;
    view.replaceChildren();
    document.title = LM.APP.lab.title + " · " + LM.APP.appTitle;
    header(route.tab).forEach(function (n) { view.appendChild(n); });
    if (!LM.LAB) {
      view.appendChild(skeleton());
      load().then(function (data) {
        if (!data) {
          const sk = view.querySelector(".lab-skeleton");
          if (sk) sk.remove();
          view.appendChild(el("p", { class: "tool-note", text: "Could not load the Lab data (data/lab.js)." }));
          return;
        }
        const now = LL().parseRoute(location.hash);
        if (now) render(now);
      });
      return;
    }
    if (route.tab === "map") renderMap(view);
    else if (route.tab === "card") renderCard(view, route.id);
    else if (route.tab === "contrasts") renderContrasts(view, route.id);
    else if (route.tab === "pick") renderPick(view, route.id);
    else renderCompare(view, route);
    view.dataset.labReady = route.tab;
  }

  LM.lab = { BASE: BASE, parseRoute: function (h) { return LL().parseRoute(h); }, render: render, load: load };
})(window.LM);
