/*
 * lab-logic.js — pure logic of the Tense & Mood Lab (spec 06 E7, spec 09 rule 2). No DOM: tested in tools/tests.js,
 * used by js/lab.js (view) and tools/validate-content.js (lab validators).
 *
 * Data (LM.LAB, generated from content/lab/*.json):
 *   axes       { columns: [{ id, label }], rows: [{ id, label }] }   the map grid; nothing about it is fixed in code
 *   cards      tense / mood cards: column, row, name, nameEn, level, summary, formation [{ label, text }],
 *              uses [{ label, text, en }], signals, scenes, traps, contrasts [{ with, rule, examples }], topicIds, setTags
 *   contrasts  contrast cards: id, level, summary, sides [2 × { name, nameEn, rules [{ label, text, examples [{ text, en }] }] }],
 *              tip, traps, topicIds, quiz { items: 4 multiple-choice items }
 *   trees      decision trees: id, title, intro, level, start, nodes { id: { question, help, options [{ label, next }
 *              | { label, result: [card or contrast ids], answer, why, example: { text, en } }] } }
 *
 * Routes:
 *   #/lab                       map                 #/lab/contrasts            contrast cards
 *   #/lab/<card id>             card                #/lab/contrast/<id>        one contrast card
 *   #/lab/pick                  decision trees      #/lab/pick/<tree id>       one tree
 *   #/lab/compare[/<a>/<b>]     compare two cards
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const RESERVED = ["pick", "compare", "contrasts", "contrast"];
  const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const KINDS = ["point", "range", "open-left", "open-right", "repeat", "result", "marker"];
  const QUIZ_SIZE = 4;

  function empty() { return { axes: { columns: [], rows: [] }, cards: [], contrasts: [], trees: [] }; }
  function data(lab) { return lab || empty(); }
  function byId(list, id) { return (list || []).find(function (x) { return x && x.id === id; }) || null; }

  // =====================================================================
  // ROUTES
  // =====================================================================

  function parseRoute(hash) {
    const m = /^#\/lab(?:\/([a-z0-9-]+)(?:\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?)?)?\/?$/.exec(hash || "");
    if (!m) return null;
    const a = m[1], b = m[2], c = m[3];
    if (!a) return { tab: "map" };
    if (a === "compare") return { tab: "compare", a: b || null, b: c || null };
    if (c) return null;
    if (a === "pick") return { tab: "pick", id: b || null };
    if (a === "contrasts") return b ? null : { tab: "contrasts", id: null };
    if (a === "contrast") return b ? { tab: "contrasts", id: b } : { tab: "contrasts", id: null };
    if (b) return null;
    return { tab: "card", id: a };
  }

  function routeOf(kind, id) {
    if (kind === "contrast") return "#/lab/contrast/" + id;
    if (kind === "tree") return "#/lab/pick/" + id;
    return "#/lab/" + id;
  }

  // =====================================================================
  // LOOKUPS
  // =====================================================================

  function card(lab, id) { return byId(data(lab).cards, id); }
  function contrast(lab, id) { return byId(data(lab).contrasts, id); }
  function tree(lab, id) { return byId(data(lab).trees, id); }

  /** A card or a contrast card by id: { kind: "card" | "contrast", item, route } or null. */
  function entry(lab, id) {
    const c = card(lab, id);
    if (c) return { kind: "card", item: c, route: routeOf("card", id) };
    const k = contrast(lab, id);
    if (k) return { kind: "contrast", item: k, route: routeOf("contrast", id) };
    return null;
  }

  /** Title of a contrast card: "<side 1> vs <side 2>". */
  function contrastTitle(k) { return (k.sides || []).map(function (s) { return s.name; }).join(" vs "); }

  /**
   * The map grid: { columns, rows, cells } with cells[row][column] = cards in file order.
   * Cards with a column or row outside the axes are left out (the validator reports them).
   */
  function grid(lab) {
    const d = data(lab);
    const columns = (d.axes && d.axes.columns) || [], rows = (d.axes && d.axes.rows) || [];
    const cells = rows.map(function (r) {
      return columns.map(function (c) { return d.cards.filter(function (x) { return x.row === r.id && x.column === c.id; }); });
    });
    return { columns: columns, rows: rows, cells: cells };
  }

  /** 1-based position of a column (its colour tone: tone 1 … tone 3, the rest repeat). */
  function toneOf(lab, columnId) {
    const cols = (data(lab).axes || {}).columns || [];
    const i = cols.findIndex(function (c) { return c.id === columnId; });
    return i === -1 ? 1 : (i % 3) + 1;
  }

  function axisLabel(lab, axis, id) {
    const a = byId(((data(lab).axes || {})[axis]) || [], id);
    return a ? a.label : id;
  }

  /** Contrast rules written for the pair (on either card), each with the card it was written on. */
  function diffs(a, b) {
    const out = [];
    (a.contrasts || []).forEach(function (c) { if (c.with === b.id) out.push({ from: a, rule: c.rule, examples: c.examples || [] }); });
    (b.contrasts || []).forEach(function (c) { if (c.with === a.id) out.push({ from: b, rule: c.rule, examples: c.examples || [] }); });
    return out;
  }

  /** The default pair of the Compare tab: a (or the first card), b (its first contrast, else the next card). */
  function comparePair(lab, aId, bId, fallbackId) {
    const cards = data(lab).cards;
    if (cards.length < 2) return null;
    const a = card(lab, aId) || card(lab, fallbackId) || cards[0];
    const first = (a.contrasts || []).map(function (c) { return card(lab, c.with); }).filter(Boolean)[0];
    let b = card(lab, bId) || first || cards.find(function (x) { return x.id !== a.id; });
    if (b.id === a.id) b = cards.find(function (x) { return x.id !== a.id; });
    return { a: a, b: b };
  }

  /** Contrast cards that share a topic with a card (shown on the card page). */
  function relatedContrasts(lab, c) {
    const topics = c.topicIds || [];
    return data(lab).contrasts.filter(function (k) { return (k.topicIds || []).some(function (t) { return topics.indexOf(t) !== -1; }); });
  }

  // =====================================================================
  // DECISION TREES
  // =====================================================================

  /**
   * Walks a tree by the chosen option indexes.
   * Returns { nodeId, node, result, steps: [{ nodeId, node, option }] }: node is the open question (null at a result),
   * result is the chosen option with a result. An index that does not exist ends the walk at that node.
   */
  function walk(t, choices) {
    const steps = [];
    let nodeId = t.start, node = t.nodes[nodeId] || null, result = null;
    for (let i = 0; i < (choices || []).length && node; i++) {
      const option = (node.options || [])[choices[i]];
      if (!option) break;
      steps.push({ nodeId: nodeId, node: node, option: option });
      if (option.result) { result = option; node = null; nodeId = null; break; }
      nodeId = option.next;
      node = t.nodes[nodeId] || null;
    }
    return { nodeId: nodeId, node: node, result: result, steps: steps };
  }

  /** Every path of a tree to a result: [[option labels…, result option]] (search text, tests). */
  function paths(t) {
    const out = [];
    (function go(id, trail, seen) {
      const n = t.nodes[id];
      if (!n || seen.indexOf(id) !== -1) return;
      (n.options || []).forEach(function (o) {
        if (o.result) out.push(trail.concat([o]));
        else go(o.next, trail.concat([o]), seen.concat([id]));
      });
    })(t.start, [], []);
    return out;
  }

  // =====================================================================
  // VALIDATION (structure; the target-language charset and the quiz items are checked by tools/validate-content.js)
  // =====================================================================

  function validate(lab, topics) {
    const d = data(lab);
    const errors = [], warnings = [];
    const err = function (w, m) { errors.push(w + ": " + m); };
    const warn = function (w, m) { warnings.push(w + ": " + m); };
    const text = function (x) { return typeof x === "string" && x.trim() !== ""; };
    const list = function (x) { return Array.isArray(x) && x.length > 0; };
    const topicOk = function (w, ids) {
      if (!list(ids)) { err(w, "missing topicIds"); return; }
      ids.forEach(function (t) { if (topics && !topics[t]) err(w, "topicId " + JSON.stringify(t) + " not in syllabus"); });
    };
    const ids = {};
    const idOk = function (w, id) {
      if (!text(id) || !ID.test(id)) { err(w, "id must be lower-case words joined by hyphens"); return; }
      if (RESERVED.indexOf(id) !== -1) err(w, "id " + JSON.stringify(id) + " is a reserved route word (" + RESERVED.join(", ") + ")");
      if (ids[id]) err(w, "duplicate id " + JSON.stringify(id) + " (card and contrast ids share one route space)");
      ids[id] = true;
    };

    // axes
    const axes = d.axes || {};
    ["columns", "rows"].forEach(function (k) {
      const a = axes[k];
      if (!list(a)) { err("axes", k + " missing"); return; }
      const seen = {};
      a.forEach(function (x, i) {
        if (!x || !text(x.id) || !text(x.label)) err("axes." + k + "[" + i + "]", "id and label required");
        else if (seen[x.id]) err("axes." + k, "duplicate id " + x.id);
        else seen[x.id] = true;
      });
    });
    const cols = ((axes.columns || []).map(function (x) { return x && x.id; }));
    const rows = ((axes.rows || []).map(function (x) { return x && x.id; }));

    // cards
    (d.cards || []).forEach(function (c, i) {
      const w = "card " + (c && c.id ? c.id : "#" + (i + 1));
      idOk(w, c.id);
      ["name", "nameEn", "summary"].forEach(function (k) { if (!text(c[k])) err(w, "missing " + k); });
      if (LEVELS.indexOf(c.level) === -1) err(w, "level must be one of " + LEVELS.join(", "));
      if (cols.indexOf(c.column) === -1 || rows.indexOf(c.row) === -1) err(w, "column/row not in axes");
      if (!list(c.formation)) err(w, "missing formation");
      else c.formation.forEach(function (f, j) { if (!f || !text(f.label) || !text(f.text)) err(w, "formation[" + j + "]: label and text required"); });
      if (!list(c.uses)) err(w, "missing uses");
      else c.uses.forEach(function (u, j) { if (!u || !text(u.label) || !text(u.text) || !text(u.en)) err(w, "uses[" + j + "]: label, text and en required"); });
      if (!list(c.traps)) err(w, "missing traps");
      if (c.signals != null && !Array.isArray(c.signals)) err(w, "signals must be a list");
      if (!list(c.scenes)) err(w, "missing scenes (at least one timeline)");
      else {
        const sids = {};
        c.scenes.forEach(function (s, j) {
          const sw = w + " scene " + (s && s.id ? s.id : "#" + (j + 1));
          if (!s || !text(s.id) || !text(s.label) || !text(s.description)) { err(sw, "id, label and description required"); return; }
          if (sids[s.id]) err(sw, "duplicate scene id");
          sids[s.id] = true;
          if (!list(s.elements)) { err(sw, "no elements"); return; }
          s.elements.forEach(function (e, k) { sceneElement(sw + " element " + (k + 1), e, err); });
        });
      }
      (c.contrasts || []).forEach(function (k, j) {
        if (!k || !text(k.with) || !text(k.rule)) { err(w, "contrasts[" + j + "]: with and rule required"); return; }
        if (k.with === c.id) err(w, "contrasts[" + j + "]: a card cannot contrast with itself");
        else if (!byId(d.cards, k.with)) warn(w, "contrast with " + JSON.stringify(k.with) + ": no such card yet (shown without the Compare button)");
      });
      topicOk(w, c.topicIds);
      if (c.setTags != null && !Array.isArray(c.setTags)) err(w, "setTags must be a list");
    });

    // contrast cards
    (d.contrasts || []).forEach(function (k, i) {
      const w = "contrast " + (k && k.id ? k.id : "#" + (i + 1));
      idOk(w, k.id);
      if (!text(k.summary)) err(w, "missing summary");
      if (LEVELS.indexOf(k.level) === -1) err(w, "level must be one of " + LEVELS.join(", "));
      if (!Array.isArray(k.sides) || k.sides.length !== 2) err(w, "exactly two sides");
      else k.sides.forEach(function (s, j) {
        const sw = w + " side " + (j + 1);
        if (!s || !text(s.name) || !text(s.nameEn)) { err(sw, "name and nameEn required"); return; }
        if (!list(s.rules)) { err(sw, "at least one rule"); return; }
        s.rules.forEach(function (r, n) {
          if (!r || !text(r.text)) err(sw, "rule " + (n + 1) + ": text required");
          else if (!list(r.examples)) err(sw, "rule " + (n + 1) + ": at least one example");
          else r.examples.forEach(function (x) { if (!x || !text(x.text) || !text(x.en)) err(sw, "rule " + (n + 1) + ": every example needs text and en"); });
        });
      });
      if (!list(k.traps)) err(w, "missing traps");
      topicOk(w, k.topicIds);
      const items = k.quiz && k.quiz.items;
      if (!Array.isArray(items) || items.length !== QUIZ_SIZE) err(w, "quiz: exactly " + QUIZ_SIZE + " items");
      else {
        const seen = {};
        items.forEach(function (it, j) {
          if (!it || it.type !== "multiple-choice") err(w, "quiz item " + (j + 1) + ": multiple-choice only");
          if (!it || !text(it.id)) err(w, "quiz item " + (j + 1) + ": id required");
          else if (seen[it.id]) err(w, "quiz: duplicate item id " + it.id);
          else seen[it.id] = true;
        });
        const pos = items.map(function (it) { return it && it.correct; });
        if (new Set(pos).size === 1) warn(w, "quiz: the correct option is always in the same position");
      }
    });

    // trees
    const treeIds = {};
    (d.trees || []).forEach(function (t, i) {
      const w = "tree " + (t && t.id ? t.id : "#" + (i + 1));
      if (!text(t.id) || !ID.test(t.id)) err(w, "id must be lower-case words joined by hyphens");
      else if (treeIds[t.id]) err(w, "duplicate tree id");
      treeIds[t.id] = true;
      if (!text(t.title)) err(w, "missing title");
      if (LEVELS.indexOf(t.level) === -1) err(w, "level must be one of " + LEVELS.join(", "));
      const nodes = t.nodes || {};
      if (!nodes[t.start]) { err(w, "start node " + JSON.stringify(t.start) + " missing"); return; }
      Object.keys(nodes).forEach(function (id) {
        const n = nodes[id], nw = w + " node " + id;
        if (!n || !text(n.question)) err(nw, "question required");
        if (!n || !Array.isArray(n.options) || n.options.length < 2) { err(nw, "at least two options"); return; }
        n.options.forEach(function (o, j) {
          const ow = nw + " option " + (j + 1);
          if (!o || !text(o.label)) { err(ow, "label required"); return; }
          if (!!o.next === !!o.result) { err(ow, "exactly one of next and result"); return; }
          if (o.next && !nodes[o.next]) err(ow, "next node " + JSON.stringify(o.next) + " missing");
          if (o.result) {
            if (!list(o.result) && !text(o.answer)) err(ow, "result needs card / contrast ids or an answer");
            (Array.isArray(o.result) ? o.result : []).forEach(function (rid) { if (!byId(d.cards, rid) && !byId(d.contrasts, rid)) err(ow, "result " + JSON.stringify(rid) + " is not a card or a contrast card"); });
            if (!text(o.why)) err(ow, "why required at a result");
            if (o.example != null && (!text(o.example.text) || !text(o.example.en))) err(ow, "example needs text and en");
          }
        });
      });
      // reachability and cycles
      const reached = {};
      let cyclic = false;
      (function go(id, stack) {
        if (stack.indexOf(id) !== -1) { cyclic = true; return; }
        if (reached[id] || !nodes[id]) return;
        reached[id] = true;
        (nodes[id].options || []).forEach(function (o) { if (o && o.next) go(o.next, stack.concat([id])); });
      })(t.start, []);
      if (cyclic) err(w, "the tree has a cycle");
      Object.keys(nodes).forEach(function (id) { if (!reached[id]) warn(w, "node " + id + " cannot be reached from the start"); });
    });

    return { errors: errors, warnings: warnings };
  }

  function sceneElement(w, e, err) {
    const num = function (x) { return typeof x === "number" && x >= -1 && x <= 1; };
    if (!e || KINDS.indexOf(e.kind) === -1) { err(w, "kind must be one of " + KINDS.join(", ")); return; }
    if (["point", "result", "marker"].indexOf(e.kind) !== -1 && !num(e.at)) err(w, e.kind + ": at in -1 … 1");
    if (e.kind === "range" || e.kind === "repeat") {
      if (!num(e.from) || !num(e.to) || e.from >= e.to) err(w, e.kind + ": from < to, both in -1 … 1");
    }
    if (e.kind === "open-left" && !num(e.to)) err(w, "open-left: to in -1 … 1");
    if (e.kind === "open-right" && !num(e.from)) err(w, "open-right: from in -1 … 1");
    if (e.kind === "repeat" && e.count != null && !(Number.isInteger(e.count) && e.count >= 2 && e.count <= 9)) err(w, "repeat: count 2 … 9");
    if (e.kind === "marker" && !(typeof e.label === "string" && e.label.trim())) err(w, "marker: label required");
  }

  /** Target-language texts of the lab data (for the charset check): [{ where, text }]. */
  function targetTexts(lab) {
    const d = data(lab), out = [];
    const add = function (where, t) { if (typeof t === "string" && t) out.push({ where: where, text: t }); };
    (d.cards || []).forEach(function (c) {
      const w = "card " + c.id;
      add(w, c.name);
      (c.formation || []).forEach(function (f) { add(w + " formation", f && f.text); });
      (c.uses || []).forEach(function (u) { add(w + " uses", u && u.text); });
      (c.signals || []).forEach(function (s) { add(w + " signals", s); });
      (c.contrasts || []).forEach(function (k) { (k && k.examples || []).forEach(function (x) { add(w + " contrasts", x); }); });
    });
    (d.contrasts || []).forEach(function (k) {
      const w = "contrast " + k.id;
      (k.sides || []).forEach(function (s) {
        if (!s) return;
        add(w + " side", s.name);
        (s.rules || []).forEach(function (r) { (r && r.examples || []).forEach(function (x) { add(w + " example", x && x.text); }); });
      });
    });
    (d.trees || []).forEach(function (t) {
      Object.keys(t.nodes || {}).forEach(function (id) {
        ((t.nodes[id] || {}).options || []).forEach(function (o) {
          if (!o) return;
          add("tree " + t.id + " node " + id, o.answer);
          if (o.example) add("tree " + t.id + " node " + id, o.example.text);
        });
      });
    });
    return out;
  }

  LM.labLogic = {
    RESERVED: RESERVED,
    KINDS: KINDS,
    QUIZ_SIZE: QUIZ_SIZE,
    parseRoute: parseRoute,
    routeOf: routeOf,
    card: card,
    contrast: contrast,
    tree: tree,
    entry: entry,
    contrastTitle: contrastTitle,
    grid: grid,
    toneOf: toneOf,
    axisLabel: axisLabel,
    diffs: diffs,
    comparePair: comparePair,
    relatedContrasts: relatedContrasts,
    walk: walk,
    paths: paths,
    validate: validate,
    targetTexts: targetTexts
  };
})(window.LM);
