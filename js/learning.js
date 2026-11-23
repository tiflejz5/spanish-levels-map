/*
 * learning.js — pure learning logic (no DOM and no localStorage), so it can be
 * tested in Node: node tools/tests.js
 *
 *   today()            — today's LOCAL day "YYYY-MM-DD" (replaceable in tests)
 *   REVIEW_STEPS       — review intervals in days, e.g. [1, 3, 7]
 *   reviews            — newReview, reviewKnown, reviewAgain, isDue
 *   study streak       — streak (current and longest), lastDays (the week dots)
 *   placement test     — TEST_LENGTH, START_LEVEL, nextLevelIndex, pickQuestion, resultLevelIndex
 *
 * Dates are always days of the user's calendar (no hours, no time zones).
 */
(function (root) {
  "use strict";

  const LM = root.LM = root.LM || {};

  // Intervals of the next reviews (in days). Change the array to change the schedule.
  const REVIEW_STEPS = [1, 3, 7];

  const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function pad(n) { return String(n).padStart(2, "0"); }

  function fromDate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** Date "YYYY-MM-DD" → Date (local noon, so a clock change does not move the day). */
  function toDate(day) {
    const m = DAY_RE.exec(day || "");
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  }

  function isDay(value) {
    const d = toDate(value);
    return !!d && fromDate(d) === value;
  }

  /** Adds n days to a date "YYYY-MM-DD". */
  function addDays(day, n) {
    const d = toDate(day);
    d.setDate(d.getDate() + n);
    return fromDate(d);
  }

  /** Number of days from a to b (b − a). */
  function diffDays(a, b) {
    return Math.round((toDate(b) - toDate(a)) / 86400000);
  }

  const learn = {
    REVIEW_STEPS: REVIEW_STEPS,
    isDay: isDay,
    addDays: addDays,
    diffDays: diffDays,

    /** The user's today. In tests: LM.learn.today = () => "2026-01-01". */
    today: function () { return fromDate(new Date()); },

    // ---------- Reviews ----------
    //   review = { stage, due, mastered }
    //   stage  — index in REVIEW_STEPS (the interval after which the review is "due")

    /** State of a new entry: the first review tomorrow. */
    newReview: function (today) {
      return { stage: 0, due: addDays(today, REVIEW_STEPS[0]), mastered: false };
    },

    /** "I knew it": next stage; after the last one — mastered. */
    reviewKnown: function (review, today) {
      const next = review.stage + 1;
      if (next >= REVIEW_STEPS.length) return { stage: review.stage, due: review.due, mastered: true };
      return { stage: next, due: addDays(today, REVIEW_STEPS[next]), mastered: false };
    },

    /** "Wrong again": back to the first stage (tomorrow). */
    reviewAgain: function (review, today) {
      return { stage: 0, due: addDays(today, REVIEW_STEPS[0]), mastered: false };
    },

    /** Due today (also overdue — with no penalty). */
    isDue: function (review, today) {
      return !review.mastered && review.due <= today;
    },

    // ---------- Study streak ----------

    /**
     * days — list of activity days (any order, may repeat).
     * current: the streak ending today or yesterday (a day without activity
     * "is still going", so the streak does not vanish during the day).
     */
    streak: function (days, today) {
      const set = new Set((days || []).filter(isDay));
      const sorted = Array.from(set).filter(function (d) { return d <= today; }).sort();
      let longest = 0;
      let run = 0;
      let prev = null;
      sorted.forEach(function (d) {
        run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
        if (run > longest) longest = run;
        prev = d;
      });
      let current = 0;
      let cursor = set.has(today) ? today : addDays(today, -1);
      while (set.has(cursor)) { current++; cursor = addDays(cursor, -1); }
      return { current: current, longest: longest, activeToday: set.has(today) };
    },

    /** The last n days (oldest to today): [{ day, active }]. */
    lastDays: function (days, today, n) {
      const set = new Set(days || []);
      const out = [];
      for (let i = (n || 7) - 1; i >= 0; i--) {
        const d = addDays(today, -i);
        out.push({ day: d, active: set.has(d) });
      }
      return out;
    },

    /**
     * "Map covered" on Today: the average of the levels' percentages (stats: [{ id, percent }] in order A1…C2),
     * rounded to a whole number, and the bar segments: [{ id, percent }] (percent 0–100, clipped when out of range).
     */
    mapProgress: function (stats) {
      const segments = (stats || []).map(function (s) {
        const p = Number(s.percent);
        return { id: s.id, percent: isFinite(p) ? Math.max(0, Math.min(100, p)) : 0 };
      });
      const sum = segments.reduce(function (t, s) { return t + s.percent; }, 0);
      return { percent: segments.length ? Math.round(sum / segments.length) : 0, segments: segments };
    },

    /**
     * Neighbours of a topic in the level list (syllabus order, topics with a page only).
     * ids — topic ids of the level in order, id — the current one. → { prev, next } (an id or null; unknown topic: both null).
     */
    topicNeighbors: function (ids, id) {
      const i = (ids || []).indexOf(id);
      if (i === -1) return { prev: null, next: null };
      return { prev: i > 0 ? ids[i - 1] : null, next: i < ids.length - 1 ? ids[i + 1] : null };
    },

    // ---------- Placement test (adaptive) ----------

    LEVELS: ["A1", "A2", "B1", "B2", "C1", "C2"],
    TEST_LENGTH: 12,
    START_LEVEL: "A2",
    RESULT_WINDOW: 6,

    /** Right answer → one level up (at most C2), wrong → down (at least A1). */
    nextLevelIndex: function (index, correct) {
      return Math.max(0, Math.min(learn.LEVELS.length - 1, index + (correct ? 1 : -1)));
    },

    /**
     * Draws a question from level levelIndex without repeats (used: Set of ids).
     * When the level's pool runs out, it takes a question from the nearest level;
     * at the same distance first in the direction the test is moving
     * (preferUp = true after a right answer → up, otherwise → down).
     * random() → [0, 1). Returns a question or null when there are no questions left.
     * opts (optional, spec v6 13 section 1.3):
     *   avoidIds   — ids from the previous attempt (Set or array): skipped when the level's pool allows it,
     *   skillCounts — { grammar: n, vocabulary: n, reading: n } in this attempt: picks the skill
     *                 that appeared least (tie → random), then a random question of it.
     * A question without a skill counts as grammar.
     */
    pickQuestion: function (questions, levelIndex, used, random, preferUp, opts) {
      const rnd = random || Math.random;
      const L = learn.LEVELS;
      for (let dist = 0; dist < L.length; dist++) {
        const candidates = dist === 0 ? [levelIndex]
          : preferUp ? [levelIndex + dist, levelIndex - dist] : [levelIndex - dist, levelIndex + dist];
        for (const idx of candidates) {
          if (idx < 0 || idx >= L.length) continue;
          const pool = questions.filter(function (q) { return q.level === L[idx] && !used.has(q.id); });
          if (pool.length) return opts ? learn.pickBalanced(pool, opts, rnd) : pool[Math.floor(rnd() * pool.length)];
        }
      }
      return null;
    },

    /** Skill of a question (without a skill field — grammar). */
    skillOf: function (q) { return q.skill || "grammar"; },

    /** Choice from the level's pool: first without questions of the previous attempt, then the rarest skill. */
    pickBalanced: function (pool, opts, rnd) {
      const avoid = opts.avoidIds ? new Set(opts.avoidIds) : null;
      let list = pool;
      if (avoid) {
        const fresh = list.filter(function (q) { return !avoid.has(q.id); });
        if (fresh.length) list = fresh;
      }
      if (opts.skillCounts) {
        const counts = opts.skillCounts;
        const skills = [];
        list.forEach(function (q) { const s = learn.skillOf(q); if (skills.indexOf(s) === -1) skills.push(s); });
        const min = Math.min.apply(null, skills.map(function (s) { return counts[s] || 0; }));
        const rarest = skills.filter(function (s) { return (counts[s] || 0) === min; });
        const skill = rarest[Math.floor(rnd() * rarest.length)];
        list = list.filter(function (q) { return learn.skillOf(q) === skill; });
      }
      return list[Math.floor(rnd() * list.length)];
    },

    /** Result: the average level index of the last 6 questions, rounded down. */
    resultLevelIndex: function (askedLevelIndexes) {
      const last = askedLevelIndexes.slice(-learn.RESULT_WINDOW);
      if (!last.length) return 0;
      const sum = last.reduce(function (s, x) { return s + x; }, 0);
      return Math.floor(sum / last.length);
    }
  };

  LM.learn = learn;
})(typeof window !== "undefined" ? window : globalThis);
