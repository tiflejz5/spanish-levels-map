/*
 * learning-stats.js — pure logic of the attempts log, stats and automatic
 * reviews (no DOM and no localStorage; tests in tools/tests.js).
 * Specification of the reference app: pack v2 spec 03 (reviews and stats).
 *
 * Attempts record of a profile: { items: [attempt…], aggregates: { <itemId>: { n, ok, topic, type, level } } }
 * Attempt: { t, day, itemId, setId, topic, level, type, tags, correct, mode, answer }
 *
 * "Today" and the current time are passed as arguments (easy tests):
 * only view code calls LM.learn.today().
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const MAX_ATTEMPTS = 3000;
  const MIN_SAMPLE = 5;          // below: "not enough data", no percentage as a judgement
  const DAILY_AUTO_LIMIT = 30;   // automatic mistake log entries per day
  const KNOWN_THRESHOLD = 0.8;   // the last two attempts at a set ≥ 80%
  const KNOWN_SNOOZE_DAYS = 14;  // after "Not now", do not ask for 14 days

  function learn() { return LM.learn; }

  // =====================================================================
  // RING BUFFER AND COMPACTING
  // =====================================================================

  /** Adds an attempt; past the limit the oldest go into the aggregates (long-term stats stay). */
  function pushAttempt(rec, attempt, max) {
    rec.items.push(attempt);
    const over = rec.items.length - (max || MAX_ATTEMPTS);
    if (over > 0) rec.items.splice(0, over).forEach(function (old) { compact(rec.aggregates, old); });
    return rec;
  }

  function compact(agg, a) {
    const g = agg[a.itemId] || (agg[a.itemId] = { n: 0, ok: 0, topic: a.topic || null, type: a.type || null, level: a.level || null });
    g.n++;
    if (a.correct) g.ok++;
  }

  /** All data as rows { itemId, topic, type, level, n, ok } (attempts + aggregates). */
  function rows(rec) {
    const out = [];
    Object.keys(rec.aggregates || {}).forEach(function (id) {
      const g = rec.aggregates[id];
      out.push({ itemId: id, topic: g.topic, type: g.type, level: g.level, n: g.n, ok: g.ok });
    });
    (rec.items || []).forEach(function (a) {
      out.push({ itemId: a.itemId, topic: a.topic, type: a.type, level: a.level, n: 1, ok: a.correct ? 1 : 0 });
    });
    return out;
  }

  // =====================================================================
  // AGGREGATION
  // =====================================================================

  /** { key: { n, ok } } by field (topic | type | level | itemId). */
  function aggregate(rec, field) {
    const out = {};
    rows(rec).forEach(function (r) {
      const k = r[field];
      if (!k) return;
      const g = out[k] || (out[k] = { n: 0, ok: 0 });
      g.n += r.n;
      g.ok += r.ok;
    });
    return out;
  }

  /** Accuracy 0–1, or null for a small sample (< min). */
  function accuracy(g, min) {
    if (!g || g.n < (min === undefined ? MIN_SAMPLE : min)) return null;
    return g.ok / g.n;
  }

  /** List sorted from the weakest: [{ key, n, ok, acc }], only with a sample ≥ min. */
  function ranked(rec, field, min) {
    const agg = aggregate(rec, field);
    return Object.keys(agg).map(function (k) { return { key: k, n: agg[k].n, ok: agg[k].ok, acc: accuracy(agg[k], min) }; })
      .filter(function (x) { return x.acc !== null; })
      .sort(function (a, b) { return a.acc - b.acc || b.n - a.n || (a.key < b.key ? -1 : 1); });
  }

  /** Topics for weak-spot practice: ≥ 5 attempts, accuracy < 70%, up to the 3 weakest. */
  function weakTopics(rec, opts) {
    opts = opts || {};
    const maxAcc = opts.maxAcc === undefined ? 0.7 : opts.maxAcc;
    return ranked(rec, "topic", opts.minN || MIN_SAMPLE).filter(function (x) { return x.acc < maxAcc; }).slice(0, opts.limit || 3);
  }

  /** Summary: answers in 7 / 30 days / in total, overall accuracy and for 7 days. */
  function summary(rec, today) {
    const d7 = learn().addDays(today, -6), d30 = learn().addDays(today, -29);
    let n7 = 0, ok7 = 0, n30 = 0, n = 0, ok = 0;
    rows(rec).forEach(function (r) { n += r.n; ok += r.ok; });
    (rec.items || []).forEach(function (a) {
      if (a.day >= d7 && a.day <= today) { n7++; if (a.correct) ok7++; }
      if (a.day >= d30 && a.day <= today) n30++;
    });
    return { n7: n7, n30: n30, n: n, acc: accuracy({ n: n, ok: ok }), acc7: accuracy({ n: n7, ok: ok7 }) };
  }

  /** Monday of the week that contains the day. */
  function weekStart(day) {
    const d = new Date(day + "T12:00:00");
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    return learn().addDays(day, -dow);
  }

  /** Weekly accuracy of the last "weeks" weeks (oldest first): [{ start, n, ok, acc }]. */
  function weekly(rec, today, weeks) {
    weeks = weeks || 12;
    const first = learn().addDays(weekStart(today), -7 * (weeks - 1));
    const out = [];
    for (let i = 0; i < weeks; i++) out.push({ start: learn().addDays(first, 7 * i), n: 0, ok: 0 });
    (rec.items || []).forEach(function (a) {
      if (a.day < first || a.day > today) return;
      const i = Math.floor(learn().diffDays(first, a.day) / 7);
      if (out[i]) { out[i].n++; if (a.correct) out[i].ok++; }
    });
    out.forEach(function (w) { w.acc = accuracy(w); });
    return out;
  }

  /** Activity map: "weeks" columns × 7 days (Mon–Sun), oldest first. */
  function activityGrid(days, today, weeks) {
    weeks = weeks || 12;
    const set = new Set(days || []);
    const first = learn().addDays(weekStart(today), -7 * (weeks - 1));
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const day = learn().addDays(first, w * 7 + d);
        col.push({ day: day, active: set.has(day), future: day > today });
      }
      out.push(col);
    }
    return out;
  }

  // =====================================================================
  // DRAW WEIGHTS
  // =====================================================================

  /** Mixed generator (spec 02, B.3 point 5): accuracy < 60% → 2, never seen → 1.5, others → 1. */
  function mixWeight(rec) {
    const agg = aggregate(rec, "itemId");
    return function (item) {
      const g = agg[item.id];
      if (!g || !g.n) return 1.5;
      return g.ok / g.n < 0.6 ? 2 : 1;
    };
  }

  /** Weak-spot practice (spec 03, point 5): no right answer in the last 14 days → 2, others → 1. */
  function weakWeight(rec, today, days) {
    const since = learn().addDays(today, -((days || 14) - 1));
    const solved = new Set();
    (rec.items || []).forEach(function (a) { if (a.correct && a.day >= since) solved.add(a.itemId); });
    return function (item) { return solved.has(item.id) ? 1 : 2; };
  }

  // =====================================================================
  // "I KNOW THIS" SUGGESTION
  // =====================================================================

  /**
   * recent: results of a set, oldest first [fraction 0–1]; opts: { isKnown, dismissedDay, today }.
   * The last two ≥ 80%, the topic is not marked "I know this", no refusal in the last 14 days.
   */
  function suggestKnown(recent, opts) {
    if (!recent || recent.length < 2 || opts.isKnown) return false;
    const last = recent.slice(-2);
    if (!last.every(function (r) { return r >= KNOWN_THRESHOLD; })) return false;
    if (opts.dismissedDay && learn().diffDays(opts.dismissedDay, opts.today) < KNOWN_SNOOZE_DAYS) return false;
    return true;
  }

  // =====================================================================
  // AUTOMATIC MISTAKE LOG
  // =====================================================================

  /**
   * What to do after a WRONG answer. entry — the existing entry for this item, or null.
   * ctx: { today, autoToday (number of automatic entries today), limit }.
   *   create  — new entry,
   *   update  — active entry: no duplicate; stage > 0 → back to stage 1 (review tomorrow),
   *   reopen  — mastered entry: restarts at stage 1, marked "came back",
   *   limit   — the log is full for today (the mistake stays only in the attempts).
   */
  function planWrong(entry, ctx) {
    if (entry) {
      if (entry.review.mastered) return { action: "reopen", review: learn().newReview(ctx.today) };
      return { action: "update", review: entry.review.stage > 0 ? learn().newReview(ctx.today) : entry.review };
    }
    if (ctx.autoToday >= (ctx.limit || DAILY_AUTO_LIMIT)) return { action: "limit" };
    return { action: "create" };
  }

  /** After a RIGHT answer: an active entry due today or overdue → passed as "I knew it". */
  function planCorrect(entry, today) {
    if (!entry || entry.review.mastered || !learn().isDue(entry.review, today)) return null;
    return { action: "review", review: learn().reviewKnown(entry.review, today) };
  }

  LM.stats = {
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    MIN_SAMPLE: MIN_SAMPLE,
    DAILY_AUTO_LIMIT: DAILY_AUTO_LIMIT,
    pushAttempt: pushAttempt,
    rows: rows,
    aggregate: aggregate,
    accuracy: accuracy,
    ranked: ranked,
    weakTopics: weakTopics,
    summary: summary,
    weekStart: weekStart,
    weekly: weekly,
    activityGrid: activityGrid,
    mixWeight: mixWeight,
    weakWeight: weakWeight,
    suggestKnown: suggestKnown,
    planWrong: planWrong,
    planCorrect: planCorrect
  };
})(window.LM);
