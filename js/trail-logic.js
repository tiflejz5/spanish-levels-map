/*
 * trail-logic.js — pure trail logic (spec v7 13): no DOM and no localStorage (tests: node tools/tests.js).
 *
 *   emptyState(), sanitizeState(raw)     profile state slm.trail.<id> { version, start, stops, reviews }; a wrong format → exception
 *   statusOf(stop, state, env)           { status: "done" | "skipped" | "open", via }  (section 3.1)
 *   buildTrail(data, state, env)         the whole trail with order and statuses, lands before the start as "skipped";
 *                                        data = LM.TRAIL (generated from the syllabus by tools/build/trail.js, spec 06 E9);
 *                                        a level with status "soon" gives nodes with status "soon" that never become current,
 *                                        and the start is moved back to the last available level (spec 06 E1)
 *   currentStop(trail)                   the first stop not passed from the start, or null
 *   levelProgress(trail, level)          { done, total, percent } — land progress = passed stops / all
 *   unitProgress(trail, unitId)          { done, total, index, count } of a unit
 *   pickReview(review, src, rng)         { source: "quiz" | "set" | "final" | null, items } — drawing a checkpoint with fallbacks (3.4)
 *   effectiveStart(state, testLevel)     the start: manual > placement test > default A1 (3.2)
 *   quizAverage(state)                   average quiz result in % (Stats)
 *
 *   env = { isKnown(itemId) → bool, setPercent(setId) → a number 0–100 or null }
 *   src = { quizItems(stopId) → [item], setItems(setId) → [item], finalItems(level) → [item], stops: {id: stop} }
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const VERSION = 1;
  // Level order comes from the syllabus (js/syllabus.js sets LM.LEVEL_IDS); the fallback serves the unit tests
  const LEVELS = (LM.LEVEL_IDS && LM.LEVEL_IDS.length ? LM.LEVEL_IDS : ["A1", "A2", "B1", "B2", "C1", "C2"]).slice();
  const PASS_QUIZ = 3;      // of 4 questions
  const PASS_SET_PERCENT = 80;
  const VIA = ["quiz", "known", "skip", "set"];
  const SOURCES = ["test", "manual", "default"];
  const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

  function emptyState() { return { version: VERSION, start: null, stops: {}, reviews: {} }; }

  function isoOrEmpty(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 30) : ""; }
  function int(v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max ? Math.floor(v) : null; }

  /** State from localStorage or an import → a valid state; a wrong format or an unknown version → exception. */
  function sanitizeState(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Wrong trail data format.");
    if (raw.version !== VERSION) throw new Error("Unsupported trail data version (" + raw.version + ").");
    const out = emptyState();
    const s = raw.start;
    if (s && typeof s === "object" && LEVELS.indexOf(s.level) !== -1) {
      out.start = { level: s.level, source: SOURCES.indexOf(s.source) !== -1 ? s.source : "manual", at: isoOrEmpty(s.at) };
    }
    const stops = raw.stops && typeof raw.stops === "object" && !Array.isArray(raw.stops) ? raw.stops : {};
    Object.keys(stops).slice(0, 1000).forEach(function (id) {
      const x = stops[id];
      if (!ID.test(id) || !x || typeof x !== "object") return;
      const via = VIA.indexOf(x.via) !== -1 ? x.via : null;
      if (!via) return;
      const rec = { done: via !== "skip" && x.done === true, via: via, at: isoOrEmpty(x.at) };
      const best = int(x.best, 0, 10);
      if (best !== null) rec.best = best;
      out.stops[id] = rec;
    });
    const reviews = raw.reviews && typeof raw.reviews === "object" && !Array.isArray(raw.reviews) ? raw.reviews : {};
    Object.keys(reviews).slice(0, 200).forEach(function (id) {
      const x = reviews[id];
      if (!ID.test(id) || !x || typeof x !== "object") return;
      const of = int(x.of, 1, 20), best = int(x.best, 0, 20);
      if (of === null || best === null || best > of) return;
      out.reviews[id] = { best: best, of: of, at: isoOrEmpty(x.at) };
    });
    return out;
  }

  /** Stop (lesson) → passed / skipped / open (section 3.1). Checkpoints: passed after one attempt, the result never blocks. */
  function statusOf(stop, state, env) {
    if (stop.type === "review") return state.reviews[stop.id] ? { status: "done", via: "review" } : { status: "open", via: null };
    const rec = state.stops[stop.id];
    if (rec && rec.via === "quiz" && typeof rec.best === "number" && rec.best >= PASS_QUIZ) return { status: "done", via: "quiz" };
    if (stop.items && stop.items.length && stop.items.every(function (id) { return env.isKnown(id); })) return { status: "done", via: "known" };
    if (!stop.quiz && stop.set) {
      const p = env.setPercent(stop.set);
      if (typeof p === "number" && p >= PASS_SET_PERCENT) return { status: "done", via: "set" };
    }
    if (rec && rec.via === "skip") return { status: "skipped", via: "skip" };
    return { status: "open", via: null };
  }

  function levelIndex(level) { return LEVELS.indexOf(level); }

  /**
   * The trail as a flat list of nodes with order and statuses. Lands before the start: stops not passed
   * get "skipped" (via "start"). Returns { nodes, startIndex, current }.
   */
  function buildTrail(data, state, env, startLevel) {
    let start = levelIndex(startLevel || (state.start && state.start.level) || "A1");
    let lastAvailable = -1;
    data.levels.forEach(function (lv) { if (lv.status !== "soon") lastAvailable = Math.max(lastAvailable, levelIndex(lv.level)); });
    if (lastAvailable !== -1 && start > lastAvailable) start = lastAvailable;
    const nodes = [];
    let lesson = 0;
    data.levels.forEach(function (lv) {
      const li = levelIndex(lv.level); // level number A1…C2 (test data may not have all of them)
      const soon = lv.status === "soon";
      let inLevel = 0;
      const total = lv.units.reduce(function (a, u) { return a + u.stops.filter(function (s) { return s.type === "lesson"; }).length; }, 0);
      lv.units.forEach(function (u, ui) {
        let inUnit = 0;
        const unitTotal = u.stops.filter(function (s) { return s.type === "lesson"; }).length;
        u.stops.forEach(function (stop) {
          const st = soon ? { status: "soon", via: null } : statusOf(stop, state, env);
          let status = st.status, via = st.via;
          if (li < start && status === "open") { status = "skipped"; via = "start"; }
          const isLesson = stop.type === "lesson";
          if (isLesson) { inLevel++; inUnit++; lesson++; }
          nodes.push({
            id: stop.id, stop: stop, type: stop.type, status: status, via: via, level: lv.level, levelIndex: li, land: lv.land, soon: soon,
            unitId: u.id, unitIndex: ui, unitTitle: u.title, unitCount: lv.units.length,
            number: isLesson ? inLevel : null, levelTotal: total, inUnit: isLesson ? inUnit : null, unitTotal: unitTotal, global: isLesson ? lesson : null
          });
        });
      });
    });
    const current = nodes.find(function (n) { return n.type === "lesson" && n.status === "open" && n.levelIndex >= start; }) || null;
    nodes.forEach(function (n) { n.current = n === current; });
    return { nodes: nodes, startIndex: start, current: current };
  }

  function currentStop(trail) { return trail.current; }

  /** Land progress: passed stops / all (checkpoints are not counted). */
  function levelProgress(trail, level) {
    const lessons = trail.nodes.filter(function (n) { return n.type === "lesson" && n.level === level; });
    const done = lessons.filter(function (n) { return n.status === "done"; }).length;
    return { done: done, total: lessons.length, percent: lessons.length ? Math.round(100 * done / lessons.length) : 0 };
  }

  function unitProgress(trail, unitId) {
    const lessons = trail.nodes.filter(function (n) { return n.type === "lesson" && n.unitId === unitId; });
    const done = lessons.filter(function (n) { return n.status === "done"; }).length;
    const first = lessons[0];
    return { done: done, total: lessons.length, index: first ? first.unitIndex + 1 : 0, count: first ? first.unitCount : 0, title: first ? first.unitTitle : "" };
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /** One question from each stop in turn (round-robin), up to "size"; shuffled within the stops. */
  function spread(groups, size, rng) {
    const queues = groups.map(function (g) { return shuffle(g, rng); }).filter(function (g) { return g.length; });
    const out = [];
    let i = 0;
    while (out.length < size && queues.some(function (q) { return q.length; })) {
      const q = queues[i % queues.length];
      if (q.length) out.push(q.shift());
      i++;
    }
    return shuffle(out, rng);
  }

  /**
   * Checkpoint ("review" node): draws "size" questions from the quizzes of the stops in "from"; when they have none, from the sets "set";
   * when there are none either, from the level's final test questions; no sources → { source: null, items: [] } (the node is skipped).
   */
  function pickReview(review, src, rng) {
    rng = rng || Math.random;
    const size = review.size || 6;
    const from = review.from || [];
    const quiz = from.map(function (id) { return src.quizItems(id) || []; });
    if (quiz.some(function (g) { return g.length; })) return { source: "quiz", items: spread(quiz, size, rng) };
    const sets = from.map(function (id) { const s = src.stops[id]; return s && s.set ? (src.setItems(s.set) || []) : []; });
    if (sets.some(function (g) { return g.length; })) return { source: "set", items: spread(sets, size, rng) };
    const level = review.level || (from[0] && /^([a-c]\d)-/.exec(from[0]) ? /^([a-c]\d)-/.exec(from[0])[1].toUpperCase() : null);
    const fin = level ? (src.finalItems(level) || []) : [];
    if (fin.length) return { source: "final", items: shuffle(fin, rng).slice(0, size) };
    return { source: null, items: [] };
  }

  /** The start: chosen by hand or from the placement test (saved), otherwise from the last test, otherwise A1. */
  function effectiveStart(state, testLevel) {
    if (state && state.start && state.start.source !== "default") return state.start;
    if (testLevel && LEVELS.indexOf(testLevel) !== -1) return { level: testLevel, source: "test", at: "" };
    return (state && state.start) || { level: "A1", source: "default", at: "" };
  }

  /** Average result of passed and failed quizzes (best attempts) in %, or null. */
  function quizAverage(state, quizSize) {
    const size = quizSize || 4;
    const vals = Object.keys(state.stops).map(function (id) { const r = state.stops[id]; return r.via === "quiz" && typeof r.best === "number" ? r.best : null; })
      .filter(function (v) { return v !== null; });
    if (!vals.length) return null;
    return Math.round(100 * vals.reduce(function (a, b) { return a + b; }, 0) / (vals.length * size));
  }

  LM.trailLogic = {
    VERSION: VERSION, LEVELS: LEVELS, PASS_QUIZ: PASS_QUIZ, PASS_SET_PERCENT: PASS_SET_PERCENT,
    emptyState: emptyState, sanitizeState: sanitizeState, statusOf: statusOf, buildTrail: buildTrail, currentStop: currentStop,
    levelProgress: levelProgress, unitProgress: unitProgress, pickReview: pickReview, effectiveStart: effectiveStart, quizAverage: quizAverage
  };
})(window.LM);
