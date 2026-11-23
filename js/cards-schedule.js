/*
 * cards-schedule.js — the flashcard review schedule (spec 10, section 3; modelled on SM-2).
 * Pure logic: no DOM and no localStorage (tests: node tools/tests.js, vectors
 * tools/fixtures/scheduler-vectors.json, reference scripts/scheduler_ref.py of the reference app).
 *
 *   LM.cardsSchedule.schedule(card, grade, now, config?, opts?) → a new card (the input is unchanged)
 *     card   { state: new|learning|review|relearning, step, ease, interval (d), pendingInterval (d),
 *              lapses, reps, due (ms) }
 *     grade  "again" | "hard" | "good" | "easy" or 1–4
 *     now    timestamp in ms
 *     opts   { fuzz: true, random: () => [0, 1) } — ±5% spread of new intervals ≥ 3 d
 *            (off by default; randomness injected from outside)
 *   newCard(config?)                       a card in the "new" state
 *   preview(card, now, config?)            { again, hard, good, easy: { card, delay (ms) } } — preview of the ratings
 *   formatDelay(ms)                        "1 min", "10 min", "1 d", "3 d", "2 mo", "1.2 yr"
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const MIN = 60000;
  const DAY = 86400000;

  const DEFAULT_CONFIG = Object.freeze({
    learningSteps: [1, 10], relearnSteps: [10], graduatingInterval: 1, easyInterval: 4,
    startEase: 2.5, minEase: 1.3, maxEase: 2.8, hardMultiplier: 1.2, easyBonus: 1.3,
    lapseMultiplier: 0.5, maxInterval: 365
  });

  const GRADES = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
  const GRADE_NAMES = ["again", "hard", "good", "easy"];

  function cfgOf(config) { return Object.assign({}, DEFAULT_CONFIG, config || {}); }

  function newCard(config) {
    const c = cfgOf(config);
    return { state: "new", step: 0, ease: c.startEase, interval: 0, pendingInterval: 0, lapses: 0, reps: 0, due: 0 };
  }

  /** ease to 0.01 (as in the reference). */
  function r2(x) { return Math.round(x * 100) / 100; }

  function gradeName(grade) {
    const g = typeof grade === "number" ? GRADES[grade] : grade;
    if (GRADE_NAMES.indexOf(g) === -1) throw new Error("Unknown rating: " + grade);
    return g;
  }

  /**
   * ±5% spread (down to whole days) for intervals ≥ 3 d. Below 20 d that is 0 days, so "Good: 8 d" from the preview
   * is saved as 8 d (earlier a minimum of ±1 d turned 4 d into three and 3 d into two); from 20 d the spread is ±5%.
   */
  function fuzzed(days, opts) {
    if (!opts || !opts.fuzz || typeof opts.random !== "function" || days < 3) return days;
    const delta = Math.floor(days * 0.05);
    return Math.max(1, days + Math.round((opts.random() * 2 - 1) * delta));
  }

  function schedule(card, grade, now, config, opts) {
    const cfg = cfgOf(config);
    const g = gradeName(grade);
    const c = Object.assign({}, card);
    c.reps = (c.reps || 0) + 1;
    const ls = cfg.learningSteps, rs = cfg.relearnSteps;
    const cap = function (v) { return Math.min(cfg.maxInterval, v); };
    // New interval in reviews (with optional spread, always within the limit)
    const toReview = function (days) {
      const d = cap(fuzzed(days, opts));
      c.state = "review"; c.interval = d; c.step = 0; c.due = now + d * DAY;
    };

    if (c.state === "new" || c.state === "learning") {
      if (c.state === "new") { c.state = "learning"; c.step = 0; }
      if (g === "again") { c.step = 0; c.due = now + ls[0] * MIN; }
      else if (g === "hard") { c.due = now + ls[c.step] * MIN; }
      else if (g === "good") {
        if (c.step + 1 < ls.length) { c.step += 1; c.due = now + ls[c.step] * MIN; }
        else toReview(cfg.graduatingInterval);
      } else toReview(cfg.easyInterval);
    } else if (c.state === "review") {
      const iv = c.interval, e = c.ease;
      if (g === "again") {
        c.lapses = (c.lapses || 0) + 1;
        c.ease = r2(Math.max(cfg.minEase, e - 0.2));
        c.pendingInterval = Math.max(1, Math.round(iv * cfg.lapseMultiplier));
        c.state = "relearning"; c.step = 0; c.due = now + rs[0] * MIN;
      } else {
        const hardI = Math.max(iv + 1, Math.round(iv * cfg.hardMultiplier));
        const goodI = Math.max(hardI + 1, Math.round(iv * e));
        const easyI = Math.max(goodI + 1, Math.round(iv * e * cfg.easyBonus));
        let next;
        if (g === "hard") { c.ease = r2(Math.max(cfg.minEase, e - 0.15)); next = hardI; }
        else if (g === "good") next = goodI;
        else { c.ease = r2(Math.min(cfg.maxEase, e + 0.15)); next = easyI; }
        toReview(next);
      }
    } else { // relearning
      if (g === "again") { c.step = 0; c.due = now + rs[0] * MIN; }
      else if (g === "hard") { c.due = now + rs[c.step] * MIN; }
      else if (g === "good") {
        if (c.step + 1 < rs.length) { c.step += 1; c.due = now + rs[c.step] * MIN; }
        else toReview(c.pendingInterval);
      } else toReview(c.pendingInterval + 1);
    }
    return c;
  }

  /** Preview of the four ratings: the new card and the time to the next review (no spread). */
  function preview(card, now, config) {
    const out = {};
    GRADE_NAMES.forEach(function (g) {
      const next = schedule(card, g, now, config);
      out[g] = { card: next, delay: next.due - now };
    });
    return out;
  }

  /** Human-readable interval: minutes, hours, days, months, years (English abbreviations). */
  function formatDelay(ms) {
    const min = Math.round(ms / MIN);
    if (min < 60) return Math.max(1, min) + " min";
    if (ms < DAY) return Math.round(ms / 3600000) + " h";
    const days = Math.round(ms / DAY);
    if (days < 31) return days + " d";
    if (days < 365) return (Math.round(days / 30.4 * 10) / 10).toString() + " mo";
    return (Math.round(days / 365 * 10) / 10).toString() + " yr";
  }

  LM.cardsSchedule = {
    MIN: MIN, DAY: DAY, DEFAULT_CONFIG: DEFAULT_CONFIG, GRADES: GRADE_NAMES,
    newCard: newCard, schedule: schedule, preview: preview, formatDelay: formatDelay
  };
})(window.LM);
