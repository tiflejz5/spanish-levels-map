/*
 * profile-data.js — learning data saved SEPARATELY FOR EACH PROFILE
 * (like "I know this"), under these localStorage keys:
 *
 *   slm.journal   { version: 1, profiles: { <profileId>: { entries: [entry…] } } }
 *   slm.activity  { version: 1, profiles: { <profileId>: { days: ["YYYY-MM-DD"…], lastPage } } }
 *   slm.placement { version: 1, profiles: { <profileId>: { last: result | null } } }
 *   slm.celebrated { version: 1, profiles: { <profileId>: { ids: ["first-known", …] } } }
 *                    — milestones already shown (each only once per profile, js/celebrate.js)
 *   slm.exercises { version: 1, profiles: { <profileId>: { sets: { <setId>: { best, last } }, lastMix: [itemId…] } } }
 *                    — exercise set results (exercise engine, js/exercise-engine.js);
 *                      best / last = { score, total, date }; recent — fractions of the last 5 results
 *                      ("I know this" suggestion); lastMix — items of the last mixed session;
 *                      dismissed: { <setId>: "YYYY-MM-DD" } — "I know this" suggestion refused
 *   slm.attempts  { version: 1, profiles: { <id>: { items: [attempt…], aggregates: { <itemId>: { n, ok, topic, type, level } } } } }
 *                    — attempts log: every answer in exercises (buffer of 3000, older ones in aggregates; js/learning-stats.js)
 *   slm.autojournal { version: 1, profiles: { <id>: { items: { <itemId>: { entryId, created, wrongCount, lastWrongAt, returned } } } } }
 *                    — mistake log entries added automatically from items (slm.journal format unchanged;
 *                      the entry is linked by ref = "ex:<itemId>")
 *   slm.prefs { version: 1, profiles: { <id>: { autoJournal: true|false, selectionMenu: true|false, highlightWords: true|false } } } — learning settings
 *                    (selectionMenu and highlightWords — "My words", pack v6; a missing field = the default value)
 *   slm.notes     { version: 1, profiles: { <id>: { items: { <page key>: { text, updatedAt, title, route } } } } }
 *                    — your own notes (plain text, at most 10,000 characters)
 *   slm.exams     { version: 1, profiles: { <id>: { exams: { <examId>: { examDate, drafts: { <task>: text }, tasks: { <page>: { <n>: true } },
 *                    choices: { <choice group>: <task> } } } } } }  (choices: choosing one of two tasks;
 *                    a missing field → {})
 *                    — exams of the registry (js/exam-core.js), one shape for all exams
 *   slm.speaking  { version: 1, profiles: { <id>: { sessions: [ { day, exam, part: 1–4, scores: { <criterion>: 1–5 } } ] } } }
 *                    — session history of the speaking trainer (self-assessment, js/speaking-trainer.js; newest last, at most 500)
 *                    Optional (pack v6, spec 18): a session with full: true ("Whole exam" mode) and in the profile record
 *                    seen: { "<exam>:<part>": [ "<card id>", … ] } — cards already drawn in the current cycle (drawing without repeats).
 *                    A record without these fields is valid.
 *   slm.finals { version: 1, profiles: { <id>: { levels: { "A1": { passedAt: "YYYY-MM-DD" | null, best: { score, total, date }, last: { score, total, date } } } } } }
 *                    — level final tests A1–C2 and the "level passed" stamps (js/final.js, pack v6);
 *                      passedAt = day of the first pass (the stamp stays after a later fail);
 *                      this is NOT slm.placement (the placement test)
 *   slm.phrases   { version: 1, profiles: { <id>: { starred: [ "opinion-05", … ] } } }
 *                    — favorite phrases from the writing phrase bank (js/writing-phrases.js, pack v6); phrase id from content/writing/phrases.json
 *
 * Mistake log entry:
 *   { id, createdAt: "YYYY-MM-DD", context, myAnswer, correct, rule, source,
 *     category, itemId, ref, review: { stage, due, mastered } }
 *   ref — key of the item the entry comes from (e.g. "ex:a1-verbs-gustar-1-03"),
 *         used to find duplicates.
 *
 * Study streak: ONLY the list of activity days is saved; LM.learn.streak computes
 * the streak. All data goes into the export and is cleared
 * by "Reset data". Every localStorage access is in try/catch.
 */
/*
 * STORAGE KEY REGISTRY (spec 02 §5) — LM.storage, defined at the end of this file.
 * Every localStorage key of the app is listed in REGISTRY; export, import, reset and profile deletion
 * walk the registry, so a new key is covered by adding one entry (tools/tests.js checks this).
 * Keys are LM.APP.storagePrefix + id ("slm."), which keeps this app apart from the owner's other apps
 * on the same GitHub Pages origin. Schemas start at version 1; there are no migrations (D3).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;

  const PREFIX = (LM.APP && LM.APP.storagePrefix) || "slm.";
  // Per-profile learning data kept by this file: kind → key id (key = PREFIX + id)
  const KIND_IDS = { journal: "journal", activity: "activity", levelTest: "placement", celebrated: "celebrated", exercises: "exercises",
    attempts: "attempts", autojournal: "autojournal", prefs: "prefs", notes: "notes",
    exams: "exams", speaking: "speaking", levelTests: "finals", phrases: "phrases" };
  const KEYS = {};
  Object.keys(KIND_IDS).forEach(function (kind) { KEYS[kind] = PREFIX + KIND_IDS[kind]; });
  const VERSION = 1;

  const CATEGORIES = ["Use of English", "Reading", "Writing", "Listening", "Speaking", "Grammar", "Vocabulary", "Other"];
  const CAT_GRAMMAR = CATEGORIES[5], CAT_VOCABULARY = CATEGORIES[6], CAT_OTHER = CATEGORIES[7];

  /** Mistake-log category of a syllabus topic: vocabulary → vocabulary, verbs and grammar → grammar, else other. */
  function journalCategoryOf(topicId) {
    const t = topicId && LM.syl ? LM.syl.topic(topicId) : null;
    if (!t) return CAT_OTHER;
    return t.category === "vocabulary" ? CAT_VOCABULARY : t.category === "verbs" || t.category === "grammar" ? CAT_GRAMMAR : CAT_OTHER;
  }

  // Length limits (also on import)
  const LIMITS = {
    context: 2000, myAnswer: 1000, correct: 1000, rule: 2000, source: 200,
    ref: 300, itemId: 120, id: 80, entries: 5000, days: 4000, title: 200, hash: 300, answers: 60
  };

  function learn() { return LM.learn; }
  function app() { return LM.app; }

  // ---------- localStorage ----------

  const memory = {};

  function load(kind) {
    if (memory[kind]) return memory[kind];
    let raw = null;
    try { raw = window.localStorage.getItem(KEYS[kind]); } catch (e) { raw = null; }
    let data = null;
    try { data = raw ? normalizeStore(kind, JSON.parse(raw)) : null; } catch (e) {
      // A damaged save: put a copy aside and start empty
      try { window.localStorage.setItem(KEYS[kind] + ".corrupt", raw); } catch (e2) { /* nothing to do */ }
      data = null;
    }
    memory[kind] = data || { version: VERSION, profiles: {} };
    return memory[kind];
  }

  function save(kind) {
    if (LM.state && LM.state.storageOk === false) return;
    try {
      window.localStorage.setItem(KEYS[kind], JSON.stringify(load(kind)));
    } catch (e) {
      if (app() && app().reportSaveError) app().reportSaveError("Your learning data was not saved! The browser storage is full or not available.");
    }
  }

  function activeId() {
    const p = app() && app().getActiveProfile();
    return p ? p.id : null;
  }

  /** The record of a kind for a profile (created when missing). */
  function record(kind, pid) {
    const store = load(kind);
    if (!pid) return emptyRecord(kind);
    if (!U.isPlainObject(store.profiles[pid])) store.profiles[pid] = emptyRecord(kind);
    return store.profiles[pid];
  }

  function emptyRecord(kind) {
    if (kind === "journal") return { entries: [] };
    if (kind === "activity") return { days: [], lastPage: null };
    if (kind === "celebrated") return { ids: [] };
    if (kind === "exercises") return { sets: {}, lastMix: [], dismissed: {} };
    if (kind === "attempts") return { items: [], aggregates: {} };
    if (kind === "autojournal") return { items: {} };
    if (kind === "prefs") return { autoJournal: true, selectionMenu: true, highlightWords: false };
    if (kind === "notes") return { items: {} };
    if (kind === "exams") return { exams: {} };
    if (kind === "speaking") return { sessions: [] };
    if (kind === "levelTests") return { levels: {} };
    if (kind === "phrases") return { starred: [] };
    return { last: null };
  }

  // ---------- Validation (saving and import) ----------

  function text(value, max) {
    if (typeof value !== "string") return "";
    return value.slice(0, max);
  }

  function normalizeReview(raw, fallbackDay) {
    const steps = learn().REVIEW_STEPS;
    if (!U.isPlainObject(raw)) return learn().newReview(fallbackDay);
    const stage = Number.isInteger(raw.stage) ? Math.max(0, Math.min(steps.length - 1, raw.stage)) : 0;
    const due = learn().isDay(raw.due) ? raw.due : learn().addDays(fallbackDay, steps[0]);
    return { stage: stage, due: due, mastered: raw.mastered === true };
  }

  /** A clean copy of an entry, or null when required fields are missing. */
  function normalizeEntry(raw) {
    if (!U.isPlainObject(raw)) return null;
    const context = text(raw.context, LIMITS.context).trim();
    const correct = text(raw.correct, LIMITS.correct).trim();
    if (!context || !correct) return null;
    const createdAt = learn().isDay(raw.createdAt) ? raw.createdAt : learn().today();
    const id = text(raw.id, LIMITS.id).trim() || U.uid("err");
    return {
      id: id,
      createdAt: createdAt,
      context: context,
      myAnswer: text(raw.myAnswer, LIMITS.myAnswer).trim(),
      correct: correct,
      rule: text(raw.rule, LIMITS.rule).trim(),
      source: text(raw.source, LIMITS.source).trim(),
      category: CATEGORIES.indexOf(raw.category) !== -1 ? raw.category : CAT_OTHER,
      itemId: text(raw.itemId, LIMITS.itemId).trim(),
      ref: text(raw.ref, LIMITS.ref).trim(),
      review: normalizeReview(raw.review, createdAt)
    };
  }

  function normalizeLastPage(raw) {
    if (!U.isPlainObject(raw)) return null;
    const hash = text(raw.hash, LIMITS.hash);
    if (!/^#\/[^\s<>"]*$/.test(hash)) return null;
    return { hash: hash, title: text(raw.title, LIMITS.title) };
  }

  function normalizeTestResult(raw) {
    if (!U.isPlainObject(raw)) return null;
    const levels = learn().LEVELS;
    if (!learn().isDay(raw.date) || levels.indexOf(raw.level) === -1) return null;
    const answers = (Array.isArray(raw.answers) ? raw.answers : []).slice(0, LIMITS.answers)
      .filter(U.isPlainObject)
      .map(function (a) {
        return {
          id: text(a.id, LIMITS.id),
          level: levels.indexOf(a.level) !== -1 ? a.level : "A1",
          chosen: Number.isInteger(a.chosen) && a.chosen >= -1 && a.chosen < 20 ? a.chosen : -1,
          correct: a.correct === true
        };
      });
    return { date: raw.date, level: raw.level, answers: answers };
  }

  function normalizeRecord(kind, raw) {
    if (!U.isPlainObject(raw)) return emptyRecord(kind);
    if (kind === "journal") {
      const seen = new Set();
      const entries = (Array.isArray(raw.entries) ? raw.entries : []).slice(0, LIMITS.entries)
        .map(normalizeEntry)
        .filter(function (e) {
          if (!e) return false;
          if (seen.has(e.id)) e.id = U.uid("err");
          seen.add(e.id);
          return true;
        });
      return { entries: entries };
    }
    if (kind === "activity") {
      const days = Array.from(new Set((Array.isArray(raw.days) ? raw.days : []).filter(learn().isDay))).sort().slice(-LIMITS.days);
      return { days: days, lastPage: normalizeLastPage(raw.lastPage) };
    }
    if (kind === "celebrated") {
      const ids = (Array.isArray(raw.ids) ? raw.ids : [])
        .filter(function (x) { return typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x); });
      return { ids: Array.from(new Set(ids)).slice(0, 200) };
    }
    if (kind === "exercises") {
      const sets = {};
      const src = U.isPlainObject(raw.sets) ? raw.sets : {};
      Object.keys(src).slice(0, 2000).forEach(function (id) {
        if (!EX_ID.test(id) || !U.isPlainObject(src[id])) return;
        const best = normalizeScore(src[id].best), last = normalizeScore(src[id].last);
        const recent = (Array.isArray(src[id].recent) ? src[id].recent : [])
          .filter(function (x) { return typeof x === "number" && x >= 0 && x <= 1; }).slice(-5);
        if (best || last) sets[id] = { best: best || last, last: last || best, recent: recent };
      });
      const lastMix = (Array.isArray(raw.lastMix) ? raw.lastMix : [])
        .filter(function (x) { return typeof x === "string" && EX_ID.test(x); }).slice(0, 100);
      const dismissed = {};
      if (U.isPlainObject(raw.dismissed)) Object.keys(raw.dismissed).slice(0, 2000).forEach(function (id) {
        if (EX_ID.test(id) && learn().isDay(raw.dismissed[id])) dismissed[id] = raw.dismissed[id];
      });
      return { sets: sets, lastMix: lastMix, dismissed: dismissed };
    }
    if (kind === "attempts") {
      const items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeAttempt).filter(Boolean).slice(-LM.stats.MAX_ATTEMPTS);
      const aggregates = {};
      if (U.isPlainObject(raw.aggregates)) Object.keys(raw.aggregates).slice(0, 20000).forEach(function (id) {
        const g = raw.aggregates[id];
        if (!EX_ID.test(id) || !U.isPlainObject(g) || !Number.isInteger(g.n) || !Number.isInteger(g.ok) || g.n < 1 || g.ok < 0 || g.ok > g.n) return;
        aggregates[id] = { n: g.n, ok: g.ok, topic: optId(g.topic), type: ATTEMPT_TYPES.indexOf(g.type) !== -1 ? g.type : null, level: learn().LEVELS.indexOf(g.level) !== -1 ? g.level : null };
      });
      return { items: items, aggregates: aggregates };
    }
    if (kind === "autojournal") {
      const items = {};
      if (U.isPlainObject(raw.items)) Object.keys(raw.items).slice(0, 5000).forEach(function (id) {
        const m = raw.items[id];
        if (!EX_ID.test(id) || !U.isPlainObject(m) || typeof m.entryId !== "string") return;
        items[id] = {
          entryId: text(m.entryId, LIMITS.id),
          created: learn().isDay(m.created) ? m.created : learn().today(),
          wrongCount: Number.isInteger(m.wrongCount) && m.wrongCount > 0 ? Math.min(m.wrongCount, 9999) : 1,
          lastWrongAt: learn().isDay(m.lastWrongAt) ? m.lastWrongAt : null,
          returned: m.returned === true
        };
      });
      return { items: items };
    }
    if (kind === "levelTests") {
      const levels = {};
      if (U.isPlainObject(raw.levels)) learn().LEVELS.forEach(function (lvl) {
        const src = raw.levels[lvl];
        if (!U.isPlainObject(src)) return;
        const best = normalizeScore(src.best), last = normalizeScore(src.last);
        if (!best && !last) return;
        levels[lvl] = { passedAt: learn().isDay(src.passedAt) ? src.passedAt : null, best: best || last, last: last || best };
      });
      return { levels: levels };
    }
    if (kind === "phrases") {
      const seen = {};
      const starred = [];
      (Array.isArray(raw.starred) ? raw.starred : []).forEach(function (id) {
        if (typeof id !== "string" || !PHRASE_ID.test(id) || seen[id] || starred.length >= PHRASE_MAX) return;
        seen[id] = true;
        starred.push(id);
      });
      return { starred: starred };
    }
    if (kind === "prefs") return { autoJournal: raw.autoJournal !== false, selectionMenu: raw.selectionMenu !== false, highlightWords: raw.highlightWords === true };
    if (kind === "speaking") {
      const out = { sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).slice(-SPEAKING_MAX).map(normalizeSpeakingSession).filter(Boolean) };
      const seen = normalizeSeen(raw.seen);
      if (seen) out.seen = seen;
      return out;
    }
    if (kind === "exams") {
      const exams = {};
      if (U.isPlainObject(raw.exams)) Object.keys(raw.exams).slice(0, 20).forEach(function (id) {
        if (!EX_ID.test(id)) return;
        exams[id] = normalizeExam(raw.exams[id]);
      });
      const out = { exams: exams };
      // Optional manual pin/unpin of an exam: { "<examId>": "pinned" | "hidden" }
      if (U.isPlainObject(raw.my)) {
        const my = {};
        Object.keys(raw.my).slice(0, 20).forEach(function (id) {
          if (EX_ID.test(id) && (raw.my[id] === "pinned" || raw.my[id] === "hidden")) my[id] = raw.my[id];
        });
        if (Object.keys(my).length) out.my = my;
      }
      return out;
    }
    if (kind === "notes") {
      const items = {};
      if (U.isPlainObject(raw.items)) Object.keys(raw.items).slice(0, 2000).forEach(function (key) {
        const n = raw.items[key];
        if (!NOTE_KEY.test(key) || !U.isPlainObject(n)) return;
        const body = text(n.text, NOTE_MAX);
        if (!body.trim()) return;
        items[key] = { text: body, updatedAt: typeof n.updatedAt === "string" && !isNaN(Date.parse(n.updatedAt)) ? n.updatedAt : new Date().toISOString(),
          title: text(n.title, LIMITS.title), route: /^#\/[^\s<>"]*$/.test(n.route || "") ? text(n.route, LIMITS.hash) : "" };
      });
      return { items: items };
    }
    return { last: normalizeTestResult(raw.last) };
  }

  const EX_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
  const PHRASE_ID = /^[a-z0-9][a-z0-9-]{0,59}$/;
  const PHRASE_MAX = 500;
  const NOTE_KEY = /^[a-z0-9][a-z0-9:_-]{0,119}$/;
  const NOTE_MAX = 10000;
  const ATTEMPT_TYPES = ["multiple-choice", "reorder", "find-error", "short-answer", "gap-fill", "match", "transformation", "translate", "dictation"];
  const ATTEMPT_MODES = ["learn", "exam", "mix", "weak", "review"];

  /** Data of one exam: date, writing trainer drafts, ticked lists on pages, chosen tasks in choice groups. */
  function normalizeExam(raw) {
    const out = { examDate: "", drafts: {}, tasks: {}, choices: {} };
    if (!U.isPlainObject(raw)) return out;
    if (learn().isDay(raw.examDate)) out.examDate = raw.examDate;
    if (U.isPlainObject(raw.drafts)) Object.keys(raw.drafts).slice(0, 200).forEach(function (k) {
      if (EX_ID.test(k) && typeof raw.drafts[k] === "string" && raw.drafts[k]) out.drafts[k] = raw.drafts[k].slice(0, 5000);
    });
    if (U.isPlainObject(raw.tasks)) Object.keys(raw.tasks).slice(0, 200).forEach(function (page) {
      if (!EX_ID.test(page) || !U.isPlainObject(raw.tasks[page])) return;
      const t = {};
      Object.keys(raw.tasks[page]).slice(0, 200).forEach(function (i) { if (/^\d{1,3}$/.test(i)) t[i] = raw.tasks[page][i] === true; });
      out.tasks[page] = t;
    });
    if (U.isPlainObject(raw.choices)) Object.keys(raw.choices).slice(0, 20).forEach(function (g) {
      if (/^[A-Za-z0-9]{1,10}$/.test(g) && typeof raw.choices[g] === "string" && EX_ID.test(raw.choices[g])) out.choices[g] = raw.choices[g];
    });
    return out;
  }

  function optId(v) { return typeof v === "string" && EX_ID.test(v) ? v : null; }

  const SPEAKING_MAX = 500;
  const SEEN_KEY = /^[a-z0-9][a-z0-9-]{0,99}:[a-z0-9][a-z0-9-]{0,29}$/;
  const SEEN_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
  const SEEN_KEYS_MAX = 40;
  const SEEN_IDS_MAX = 200;

  /** Seen cards of the speaking trainer: { "<exam>:<part>": [id, …] } or null when there are none (optional field). */
  function normalizeSeen(raw) {
    if (!U.isPlainObject(raw)) return null;
    const out = {};
    let n = 0;
    Object.keys(raw).forEach(function (k) {
      if (n >= SEEN_KEYS_MAX || !SEEN_KEY.test(k) || !Array.isArray(raw[k])) return;
      const ids = [];
      raw[k].forEach(function (id) { if (typeof id === "string" && SEEN_ID.test(id) && ids.indexOf(id) === -1 && ids.length < SEEN_IDS_MAX) ids.push(id); });
      if (ids.length) { out[k] = ids; n++; }
    });
    return n ? out : null;
  }
  /** Speaking trainer session: day, exam, part 1–4, ratings 1–5 (up to 8 criteria), or null. */
  function normalizeSpeakingSession(raw) {
    if (!U.isPlainObject(raw) || !learn().isDay(raw.day) || !EX_ID.test(raw.exam || "")) return null;
    if (!Number.isInteger(raw.part) || raw.part < 1 || raw.part > 4) return null;
    const scores = {};
    if (U.isPlainObject(raw.scores)) Object.keys(raw.scores).slice(0, 8).forEach(function (k) {
      const v = raw.scores[k];
      if (/^[a-z]{1,20}$/.test(k) && Number.isInteger(v) && v >= 1 && v <= 5) scores[k] = v;
    });
    if (!Object.keys(scores).length) return null;
    const session = { day: raw.day, exam: raw.exam, part: raw.part, scores: scores };
    if (raw.full === true) session.full = true; // "Whole exam" mode (optional)
    return session;
  }

  /** An attempt (attempts log), or null for a wrong format. */
  function normalizeAttempt(raw) {
    if (!U.isPlainObject(raw) || !EX_ID.test(raw.itemId || "") || !learn().isDay(raw.day)) return null;
    const out = {
      t: typeof raw.t === "string" && !isNaN(Date.parse(raw.t)) ? raw.t : raw.day + "T12:00:00.000Z",
      day: raw.day,
      itemId: raw.itemId,
      setId: optId(raw.setId),
      topic: optId(raw.topic),
      level: learn().LEVELS.indexOf(raw.level) !== -1 ? raw.level : null,
      type: ATTEMPT_TYPES.indexOf(raw.type) !== -1 ? raw.type : null,
      tags: (Array.isArray(raw.tags) ? raw.tags : []).filter(function (x) { return typeof x === "string" && x.length <= 40; }).slice(0, 10),
      correct: raw.correct === true,
      mode: ATTEMPT_MODES.indexOf(raw.mode) !== -1 ? raw.mode : "learn",
      answer: text(raw.answer, 200)
    };
    // Optional (items worth several points, pack v6): points ≤ max ≤ 20
    if (Number.isInteger(raw.max) && raw.max > 0 && raw.max <= 20 && Number.isInteger(raw.points) && raw.points >= 0 && raw.points <= raw.max) {
      out.points = raw.points;
      out.max = raw.max;
    }
    return out;
  }

  /** A set result { score, total, date }, or null. */
  function normalizeScore(raw) {
    if (!U.isPlainObject(raw)) return null;
    const total = Number.isInteger(raw.total) && raw.total > 0 && raw.total <= 500 ? raw.total : 0;
    if (!total || !Number.isInteger(raw.score) || raw.score < 0 || raw.score > total || !learn().isDay(raw.date)) return null;
    return { score: raw.score, total: total, date: raw.date };
  }

  /** { version, profiles: { id: record } } → a clean copy (an exception for a wrong format). */
  function normalizeStore(kind, raw) {
    if (!U.isPlainObject(raw) || !U.isPlainObject(raw.profiles)) throw new Error("Wrong data format (" + KEYS[kind] + ").");
    if (typeof raw.version !== "number" || raw.version > VERSION) throw new Error("Unsupported data version (" + KEYS[kind] + ").");
    const profiles = {};
    Object.keys(raw.profiles).slice(0, 500).forEach(function (pid) {
      if (typeof pid === "string" && pid.length <= LIMITS.id) profiles[pid] = normalizeRecord(kind, raw.profiles[pid]);
    });
    return { version: VERSION, profiles: profiles };
  }

  // =====================================================================
  // MISTAKE LOG
  // =====================================================================

  function entries() { return record("journal", activeId()).entries; }

  function getEntry(id) {
    return entries().find(function (e) { return e.id === id; }) || null;
  }

  /** Adds an entry (fields already checked). Returns the saved entry. */
  function addEntry(fields) {
    const today = learn().today();
    const entry = normalizeEntry(Object.assign({}, fields, { id: U.uid("err"), createdAt: today, review: learn().newReview(today) }));
    if (!entry || !activeId()) return null;
    entries().unshift(entry);
    save("journal");
    markActivity();
    if (LM.cards) LM.cards.autoAddFromJournal(entry); // every entry gets a "My mistakes" card at once (pack v8)
    return entry;
  }

  function updateEntry(id, fields) {
    const list = entries();
    const i = list.findIndex(function (e) { return e.id === id; });
    if (i === -1) return null;
    const merged = normalizeEntry(Object.assign({}, list[i], fields, { id: id, createdAt: list[i].createdAt, review: list[i].review }));
    if (!merged) return null;
    list[i] = merged;
    save("journal");
    if (LM.cards) LM.cards.journalUpdated(merged);
    return merged;
  }

  function removeEntry(id) {
    const list = entries();
    const i = list.findIndex(function (e) { return e.id === id; });
    if (i === -1) return;
    const gone = list.splice(i, 1)[0];
    save("journal");
    if (LM.cards) LM.cards.journalRemoved(gone);
  }

  /** Review result: known = true ("I knew it") / false ("Wrong again"). */
  function reviewEntry(id, known) {
    const e = getEntry(id);
    if (!e) return null;
    const today = learn().today();
    e.review = known ? learn().reviewKnown(e.review, today) : learn().reviewAgain(e.review, today);
    save("journal");
    return e;
  }

  function dueEntries() {
    const today = learn().today();
    return entries().filter(function (e) { return learn().isDue(e.review, today); })
      .sort(function (a, b) { return a.review.due < b.review.due ? -1 : a.review.due > b.review.due ? 1 : 0; });
  }

  function dueCount() { return activeId() ? dueEntries().length : 0; }

  /** Answer comparison for finding duplicates (case and spaces do not matter). */
  function sameAnswer(a, b) {
    const n = function (s) { return String(s || "").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim(); };
    return n(a) === n(b);
  }

  /** An existing entry from the same item with the same wrong answer (or null). */
  function findDuplicate(ref, myAnswer) {
    if (!ref) return null;
    return entries().find(function (e) { return e.ref === ref && sameAnswer(e.myAnswer, myAnswer); }) || null;
  }

  // =====================================================================
  // ACTIVITY (streak) AND "CONTINUE"
  // =====================================================================

  /** Saves today as a study day of the active profile. */
  function markActivity() {
    const pid = activeId();
    if (!pid) return;
    const rec = record("activity", pid);
    const today = learn().today();
    if (rec.days.indexOf(today) !== -1) return;
    rec.days.push(today);
    if (rec.days.length > LIMITS.days) rec.days.splice(0, rec.days.length - LIMITS.days);
    save("activity");
    if (LM.celebrate) LM.celebrate.check(); // a new study day may complete a streak milestone
  }

  function activityDays() { return record("activity", activeId()).days.slice(); }

  /** The last opened topic page (for "Continue" on "Today"). */
  function setLastPage(hash, title) {
    const pid = activeId();
    if (!pid) return;
    const page = normalizeLastPage({ hash: hash, title: title });
    const rec = record("activity", pid);
    if (!page || (rec.lastPage && rec.lastPage.hash === page.hash && rec.lastPage.title === page.title)) return;
    rec.lastPage = page;
    save("activity");
  }

  function lastPage() { return record("activity", activeId()).lastPage; }

  // =====================================================================
  // PLACEMENT TEST
  // =====================================================================

  function lastTest() { return record("levelTest", activeId()).last; }

  function saveTest(result) {
    const pid = activeId();
    if (!pid) return null;
    const clean = normalizeTestResult(result);
    record("levelTest", pid).last = clean;
    save("levelTest");
    return clean;
  }

  // =====================================================================
  // MILESTONES (celebrations already shown)
  // =====================================================================

  /** Set of shown milestones of the active profile, or null when the profile has no record yet. */
  function celebrated() {
    const pid = activeId();
    if (!pid) return null;
    const rec = load("celebrated").profiles[pid];
    return U.isPlainObject(rec) ? rec.ids.slice() : null;
  }

  function addCelebrated(ids) {
    const pid = activeId();
    if (!pid) return;
    const rec = record("celebrated", pid);
    ids.forEach(function (id) { if (rec.ids.indexOf(id) === -1) rec.ids.push(id); });
    save("celebrated");
  }

  // =====================================================================
  // EXERCISE SET RESULTS
  // =====================================================================

  /** { best, last } of a set for the active profile, or null. */
  function setScore(setId) {
    const pid = activeId();
    if (!pid) return null;
    const rec = load("exercises").profiles[pid];
    return rec && rec.sets[setId] ? { best: rec.sets[setId].best, last: rec.sets[setId].last } : null;
  }

  /** Saves the result of a finished session: last always, best when the percentage is higher; recent — the last 5 results. */
  function saveSetScore(setId, score, total) {
    const pid = activeId();
    if (!pid || !EX_ID.test(setId)) return null;
    const clean = normalizeScore({ score: score, total: total, date: learn().today() });
    if (!clean) return null;
    const rec = record("exercises", pid);
    const prev = rec.sets[setId];
    const better = !prev || clean.score / clean.total > prev.best.score / prev.best.total;
    const recent = (prev && prev.recent ? prev.recent : []).concat(clean.score / clean.total).slice(-5);
    rec.sets[setId] = { best: better ? clean : prev.best, last: clean, recent: recent };
    save("exercises");
    return { best: rec.sets[setId].best, last: clean, recent: recent.slice(), improved: !!prev && better };
  }

  // =====================================================================
  // LEVEL FINAL TESTS (pack v6, spec 13 section 2.4)
  // =====================================================================

  /** { passedAt, best, last } of the level final test of the active profile, or null. */
  function finalResult(level) {
    const pid = activeId();
    const rec = pid ? load("levelTests").profiles[pid] : null;
    const r = rec && rec.levels[level];
    return r ? { passedAt: r.passedAt, best: Object.assign({}, r.best), last: Object.assign({}, r.last) } : null;
  }

  /** Passed levels of the active profile: { "A1": "YYYY-MM-DD", … }. */
  function passedLevels() {
    const pid = activeId();
    const rec = pid ? load("levelTests").profiles[pid] : null;
    const out = {};
    if (rec) Object.keys(rec.levels).forEach(function (lvl) { if (rec.levels[lvl].passedAt) out[lvl] = rec.levels[lvl].passedAt; });
    return out;
  }

  /**
   * Saves a final test result: last always, best (higher percentage), day of the first pass.
   * res: { score, total, passed }. Returns { passed, firstPass, passedAt, best, last } or null.
   */
  function saveFinalResult(level, res) {
    const pid = activeId();
    if (!pid || learn().LEVELS.indexOf(level) === -1 || !res) return null;
    const clean = normalizeScore({ score: res.score, total: res.total, date: learn().today() });
    if (!clean) return null;
    const rec = record("levelTests", pid);
    const prev = rec.levels[level];
    const better = !prev || clean.score / clean.total > prev.best.score / prev.best.total;
    const firstPass = !!res.passed && !(prev && prev.passedAt);
    rec.levels[level] = {
      passedAt: prev && prev.passedAt ? prev.passedAt : res.passed ? clean.date : null,
      best: better ? clean : prev.best,
      last: clean
    };
    save("levelTests");
    return { passed: !!res.passed, firstPass: firstPass, passedAt: rec.levels[level].passedAt, best: Object.assign({}, rec.levels[level].best), last: clean };
  }

  // ---------- Favorite phrases (writing phrase bank, slm.phrases) ----------

  /** Ids of the active profile's favorite phrases (a copy). */
  function starredPhrases() {
    const pid = activeId();
    const rec = pid ? load("phrases").profiles[pid] : null;
    return rec ? rec.starred.slice() : [];
  }

  /** Toggles a phrase's star; returns true when the phrase is now a favorite (false also without a profile or with full storage). */
  function togglePhraseStar(id) {
    const pid = activeId();
    if (!pid || typeof id !== "string" || !PHRASE_ID.test(id)) return false;
    const rec = record("phrases", pid);
    const i = rec.starred.indexOf(id);
    if (i !== -1) { rec.starred.splice(i, 1); save("phrases"); return false; }
    if (rec.starred.length >= PHRASE_MAX) return false;
    rec.starred.push(id);
    save("phrases");
    return true;
  }

  /** Day the "I know this" suggestion was refused for a set (or null), and saving a refusal. */
  function knownDismissed(setId) {
    const pid = activeId();
    const rec = pid ? load("exercises").profiles[pid] : null;
    return rec && rec.dismissed ? rec.dismissed[setId] || null : null;
  }

  function dismissKnown(setId) {
    const pid = activeId();
    if (!pid || !EX_ID.test(setId)) return;
    const rec = record("exercises", pid);
    rec.dismissed = rec.dismissed || {};
    rec.dismissed[setId] = learn().today();
    save("exercises");
  }

  // =====================================================================
  // ATTEMPTS LOG
  // =====================================================================

  /** Attempts record of the active profile (for stats; do not modify). */
  function attempts() { return record("attempts", activeId()); }

  /** Saves one answer (after every item). */
  function addAttempt(fields) {
    const pid = activeId();
    if (!pid) return null;
    const now = new Date();
    const a = normalizeAttempt(Object.assign({ t: now.toISOString(), day: learn().today() }, fields));
    if (!a) return null;
    LM.stats.pushAttempt(record("attempts", pid), a);
    save("attempts");
    return a;
  }

  // =====================================================================
  // LEARNING SETTINGS
  // =====================================================================

  function prefs() { return Object.assign({}, record("prefs", activeId())); }

  function setPref(key, value) {
    const pid = activeId();
    if (!pid) return;
    const rec = record("prefs", pid);
    if (key === "autoJournal") rec.autoJournal = value !== false;
    if (key === "selectionMenu") rec.selectionMenu = value !== false;   // menu on text selection (My words), on by default
    if (key === "highlightWords") rec.highlightWords = value === true;  // underlining saved words, off by default
    save("prefs");
  }

  // =====================================================================
  // AUTOMATIC MISTAKE LOG ENTRIES (spec 03, point 2)
  // =====================================================================

  function autoMeta() { return record("autojournal", activeId()).items; }

  /** The log entry created from an item (field ref = "ex:<itemId>"), or null. */
  function entryForItem(itemId) {
    const ref = "ex:" + itemId;
    return entries().find(function (e) { return e.ref === ref; }) || null;
  }

  function isAutoEntry(entry) {
    if (!entry || entry.ref.indexOf("ex:") !== 0) return false;
    const m = autoMeta()[entry.ref.slice(3)];
    return !!m && m.entryId === entry.id;
  }

  function autoCountToday() {
    const today = learn().today(), meta = autoMeta();
    return Object.keys(meta).filter(function (k) { return meta[k].created === today; }).length;
  }

  /**
   * A wrong answer → an entry in the log (no duplicates). fields — fields of the entry (context, answers, rule…).
   * Returns { action, entry, undo } or null (turned off in the settings / no profile).
   */
  function recordWrong(itemId, fields) {
    const pid = activeId();
    if (!pid || !EX_ID.test(itemId) || !prefs().autoJournal) return null;
    const today = learn().today();
    const existing = entryForItem(itemId);
    const plan = LM.stats.planWrong(existing, { today: today, autoToday: autoCountToday() });
    const meta = autoMeta();
    if (plan.action === "limit") return { action: "limit" };
    if (plan.action === "create") {
      const entry = addEntry(Object.assign({}, fields, { ref: "ex:" + itemId }));
      if (!entry) return null;
      meta[itemId] = { entryId: entry.id, created: today, wrongCount: 1, lastWrongAt: today, returned: false };
      save("autojournal");
      return { action: "create", entry: entry, undo: { kind: "create", itemId: itemId, entryId: entry.id } };
    }
    // update / reopen: no new entry; remember the state for "Undo"
    const before = { review: Object.assign({}, existing.review), meta: meta[itemId] ? Object.assign({}, meta[itemId]) : null };
    existing.review = plan.review;
    const m = meta[itemId] || { entryId: existing.id, created: existing.createdAt, wrongCount: 0, lastWrongAt: null, returned: false };
    m.wrongCount++;
    m.lastWrongAt = today;
    if (plan.action === "reopen") m.returned = true;
    meta[itemId] = m;
    save("journal");
    save("autojournal");
    if (LM.cards) LM.cards.journalWrong(existing); // the card comes back tomorrow
    return { action: plan.action, entry: existing, undo: { kind: "update", itemId: itemId, entryId: existing.id, before: before } };
  }

  /** A right answer: the card of this item's entry, when due today or overdue, gets "Good" (flashcard schedule). */
  function recordCorrect(itemId) {
    const entry = activeId() ? entryForItem(itemId) : null;
    if (!entry || !LM.cards || !LM.cards.journalCorrect(entry)) return null;
    return { action: "review", entry: entry };
  }

  /** "Undo" for the result of recordWrong (one or a list). */
  function undoAuto(undo) {
    if (!undo) return;
    const meta = autoMeta();
    if (undo.kind === "create") {
      removeEntry(undo.entryId);
      if (meta[undo.itemId] && meta[undo.itemId].entryId === undo.entryId) delete meta[undo.itemId];
    } else {
      const e = getEntry(undo.entryId);
      if (e) e.review = undo.before.review;
      if (undo.before.meta) meta[undo.itemId] = undo.before.meta; else delete meta[undo.itemId];
      save("journal");
    }
    save("autojournal");
  }

  /** "Delete all automatic entries": deletes the entries added automatically (manual ones stay). Returns the number. */
  function removeAllAuto() {
    const meta = autoMeta();
    const ids = new Set(Object.keys(meta).map(function (k) { return meta[k].entryId; }));
    const list = entries();
    const before = list.length;
    const removed = [];
    for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) removed.push(list.splice(i, 1)[0]);
    record("autojournal", activeId()).items = {};
    save("journal");
    save("autojournal");
    if (LM.cards) removed.forEach(function (e) { LM.cards.journalRemoved(e); });
    return before - list.length;
  }

  function autoInfo(entry) {
    if (!isAutoEntry(entry)) return null;
    return Object.assign({}, autoMeta()[entry.ref.slice(3)]);
  }

  // =====================================================================
  // EXAMS (spec 05) — data of the active profile for an exam
  // =====================================================================

  /** The exam object { examDate, drafts, tasks, choices } (created when missing; without a profile — temporary). */
  function examData(examId) {
    const pid = activeId();
    if (!pid || !EX_ID.test(examId)) return normalizeExam(null);
    const rec = record("exams", pid);
    if (!rec.exams[examId]) rec.exams[examId] = normalizeExam(null);
    return rec.exams[examId];
  }

  function saveExams() { save("exams"); }

  /** Manual pins of exams of the active profile: { id: "pinned" | "hidden" } (a copy; a missing field = empty). */
  function examMy() {
    const pid = activeId();
    if (!pid) return {};
    return Object.assign({}, record("exams", pid).my || {});
  }

  /** value: "pinned" | "hidden" | null (back to automatic). */
  function setExamMy(examId, value) {
    const pid = activeId();
    if (!pid || !EX_ID.test(examId)) return false;
    const rec = record("exams", pid);
    const my = Object.assign({}, rec.my || {});
    if (value === "pinned" || value === "hidden") my[examId] = value; else delete my[examId];
    if (Object.keys(my).length) rec.my = my; else delete rec.my;
    save("exams");
    return true;
  }

  // =====================================================================
  // SPEAKING TRAINER (spec 09, section 5) — session history with self-assessment
  // =====================================================================

  /** Sessions of the active profile for an exam (newest last). */
  function speakingSessions(examId) {
    if (!activeId()) return [];
    return record("speaking", activeId()).sessions.filter(function (s) { return s.exam === examId; });
  }

  /** Ids of cards seen in the current drawing cycle for the key "<exam>:<part>" (a copy; a missing field = empty). */
  function speakingSeen(key) {
    if (!activeId() || !SEEN_KEY.test(key || "")) return [];
    const seen = record("speaking", activeId()).seen;
    return seen && seen[key] ? seen[key].slice() : [];
  }

  /** Remembers a card as seen (ids = null clears the cycle). Returns false without a profile or with a wrong key. */
  function markSpeakingSeen(key, id) {
    if (!activeId() || !SEEN_KEY.test(key || "")) return false;
    const rec = record("speaking", activeId());
    if (id === null) {
      if (rec.seen) { delete rec.seen[key]; if (!Object.keys(rec.seen).length) delete rec.seen; }
    } else {
      if (typeof id !== "string" || !SEEN_ID.test(id)) return false;
      rec.seen = rec.seen || {};
      const list = rec.seen[key] || (rec.seen[key] = []);
      if (list.indexOf(id) === -1) list.push(id);
      if (list.length > SEEN_IDS_MAX) list.splice(0, list.length - SEEN_IDS_MAX);
    }
    save("speaking");
    return true;
  }

  /** Saves a session { exam, part, scores }. Returns the saved session or null (no profile / wrong format). */
  function addSpeakingSession(fields) {
    if (!activeId()) return null;
    const s = normalizeSpeakingSession(Object.assign({}, fields, { day: learn().today() }));
    if (!s) return null;
    const list = record("speaking", activeId()).sessions;
    list.push(s);
    if (list.length > SPEAKING_MAX) list.splice(0, list.length - SPEAKING_MAX);
    save("speaking");
    markActivity();
    return s;
  }

  // =====================================================================
  // NOTES (spec 04, part B)
  // =====================================================================

  function notes() { return record("notes", activeId()).items; }

  function getNote(key) { return activeId() && notes()[key] ? Object.assign({}, notes()[key]) : null; }

  /** Saves a page note; empty text = delete. */
  function setNote(key, value, meta) {
    const pid = activeId();
    if (!pid || !NOTE_KEY.test(key)) return null;
    const items = record("notes", pid).items;
    const body = String(value || "").slice(0, NOTE_MAX);
    if (!body.trim()) { delete items[key]; save("notes"); return null; }
    items[key] = { text: body, updatedAt: new Date().toISOString(), title: text((meta && meta.title) || (items[key] && items[key].title) || "", LIMITS.title),
      route: /^#\/[^\s<>"]*$/.test((meta && meta.route) || "") ? text(meta.route, LIMITS.hash) : (items[key] ? items[key].route : "") };
    save("notes");
    return Object.assign({}, items[key]);
  }

  function removeNote(key) { setNote(key, ""); }

  /** List of notes [{ key, text, updatedAt, title, route }], most recently changed first. */
  function noteList() {
    const items = activeId() ? notes() : {};
    return Object.keys(items).map(function (k) { return Object.assign({ key: k }, items[k]); })
      .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0; });
  }

  /** Number of sets (and mixes) with a saved result for the active profile. */
  function solvedSetCount() {
    const pid = activeId();
    const rec = pid ? load("exercises").profiles[pid] : null;
    return rec ? Object.keys(rec.sets).length : 0;
  }

  function lastMix() {
    const pid = activeId();
    const rec = pid ? load("exercises").profiles[pid] : null;
    return rec ? rec.lastMix.slice() : [];
  }

  function setLastMix(ids) {
    const pid = activeId();
    if (!pid) return;
    record("exercises", pid).lastMix = ids.filter(function (x) { return EX_ID.test(x); }).slice(0, 100);
    save("exercises");
  }

  // =====================================================================
  // STORAGE KEY REGISTRY AND BACKUP FILE (spec 02 §5)
  // =====================================================================
  //   scope "device"   — one key for the device, not exported (reset: true → removed by "Reset data")
  //   scope "app"      — one key for all profiles (the profile list itself), exported
  //   scope "profiles" — one key holding { profiles: { <profileId>: record } }, exported
  //   scope "profile"  — one key per profile (prefix + profileId), exported
  // Exported entries name a handler with exportData() / parseImport(raw) / applyImport(parsed, profileIds) /
  // clearAll() and, for per-profile data, removeProfile(pid).

  const BACKUP_VERSION = 1;

  function kindHandler(kind) {
    return {
      exportData: function () { return JSON.parse(JSON.stringify(load(kind))); },
      parseImport: function (raw) {
        if (raw === undefined || raw === null) return null;
        try { return normalizeStore(kind, raw); } catch (e) { throw new Error("Part \"" + KIND_IDS[kind] + "\": " + e.message); }
      },
      applyImport: function (parsed, profileIds) {
        // A part missing from the file keeps this browser's data (pruned to the imported profiles)
        if (parsed) memory[kind] = parsed; else load(kind);
        const keep = new Set(profileIds);
        Object.keys(memory[kind].profiles).forEach(function (pid) { if (!keep.has(pid)) delete memory[kind].profiles[pid]; });
        save(kind);
      },
      clearAll: function () {
        memory[kind] = { version: VERSION, profiles: {} };
        try { window.localStorage.removeItem(KEYS[kind]); window.localStorage.removeItem(KEYS[kind] + ".corrupt"); } catch (e) { /* no access */ }
      },
      removeProfile: function (pid) {
        const store = load(kind);
        if (store.profiles[pid]) { delete store.profiles[pid]; save(kind); }
      }
    };
  }

  const REGISTRY = [
    { id: "theme", scope: "device" },
    { id: "sidebar", scope: "device" },
    { id: "ui", scope: "device", reset: true },
    { id: "search-recent", scope: "device", reset: true },
    { id: "profiles", scope: "app", handler: function () { return LM.store && LM.store.profilesHandler; } }
  ].concat(Object.keys(KIND_IDS).map(function (kind) {
    const h = kindHandler(kind);
    return { id: KIND_IDS[kind], scope: "profiles", kind: kind, handler: function () { return h; } };
  })).concat([
    { id: "cards", scope: "profile", handler: function () { return LM.cardsStore; } },
    { id: "trail", scope: "profile", handler: function () { return LM.trailStore; } }
  ]);
  REGISTRY.forEach(function (e) { if (e.scope === "profile") e.prefix = PREFIX + e.id + "."; else e.key = PREFIX + e.id; });

  function entry(id) {
    const e = REGISTRY.find(function (x) { return x.id === id; });
    if (!e) throw new Error("Unknown storage key id: " + id);
    return e;
  }
  /** Key of a single-key entry, e.g. key("theme") → "slm.theme". */
  function key(id) { return entry(id).key; }
  /** Key of a per-profile entry, e.g. profileKey("cards", "p_1") → "slm.cards.p_1". */
  function profileKey(id, pid) { return entry(id).prefix + pid; }
  /** Profile ids that have a per-profile key of this entry in localStorage (corrupt-data copies excluded). */
  function storedProfileIds(id) {
    const prefix = entry(id).prefix, out = [];
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.indexOf(prefix) === 0 && !/\.corrupt$/.test(k)) out.push(k.slice(prefix.length));
      }
    } catch (e) { /* no access */ }
    return out;
  }
  function exported() { return REGISTRY.filter(function (e) { return e.scope !== "device"; }); }
  function handlerOf(e) {
    const h = e.handler && e.handler();
    if (!h) throw new Error("No handler for storage entry " + e.id);
    return h;
  }

  /** The backup file: { app, kind: "backup", version, exportedAt, data: { <entry id>: … } }. */
  function exportBackup() {
    const data = {};
    exported().forEach(function (e) { data[e.id] = handlerOf(e).exportData(); });
    return { app: LM.APP.exportName, kind: "backup", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: data };
  }

  /** File name of a backup made today: spanish-levels-map-YYYY-MM-DD.json */
  function backupFileName() { return LM.APP.exportName + "-" + U.dateStamp() + ".json"; }

  /**
   * Checks a parsed backup file. Returns { <entry id>: parsed part | null } or throws an Error whose message is shown
   * to the user. A file of another app is refused (spec 02 §5); a missing part means "no data of that kind".
   */
  function parseBackup(obj) {
    if (!U.isPlainObject(obj)) throw new Error("The file does not contain data of this app.");
    if (obj.app !== LM.APP.exportName) {
      throw new Error("This file is not a " + LM.APP.appTitle + " backup" +
        (typeof obj.app === "string" && obj.app ? " (it comes from \"" + obj.app + "\")" : "") + ", so it cannot be imported here.");
    }
    if (obj.kind !== "backup" || !U.isPlainObject(obj.data)) throw new Error("The backup file is incomplete.");
    if (typeof obj.version !== "number" || obj.version > BACKUP_VERSION) throw new Error("The file comes from a newer version of the app. Update the page and try again.");
    const out = {};
    exported().forEach(function (e) { out[e.id] = handlerOf(e).parseImport(obj.data[e.id]); });
    if (!out.profiles) throw new Error("The backup has no profile list.");
    return out;
  }

  /** Replaces everything with a parsed backup. The profile list goes first; data of profiles not in it is dropped. */
  function applyBackup(parsed) {
    const ids = parsed.profiles.profiles.map(function (p) { return p.id; });
    exported().forEach(function (e) { handlerOf(e).applyImport(parsed[e.id], ids); });
  }

  /** "Reset data": every exported entry and the device entries marked reset (theme and sidebar stay). */
  function resetAll() {
    exported().forEach(function (e) { handlerOf(e).clearAll(); });
    REGISTRY.forEach(function (e) {
      if (e.scope === "device" && e.reset) { try { window.localStorage.removeItem(e.key); } catch (err) { /* no access */ } }
    });
  }

  /** Deleting a profile removes its data from every per-profile entry. */
  function deleteProfile(pid) {
    exported().forEach(function (e) { if (e.scope !== "app") handlerOf(e).removeProfile(pid); });
  }

  LM.storage = {
    PREFIX: PREFIX, BACKUP_VERSION: BACKUP_VERSION, REGISTRY: REGISTRY,
    key: key, profileKey: profileKey, storedProfileIds: storedProfileIds,
    exportBackup: exportBackup, backupFileName: backupFileName, parseBackup: parseBackup, applyBackup: applyBackup,
    resetAll: resetAll, deleteProfile: deleteProfile
  };

  LM.profileData = {
    KEYS: KEYS,
    CATEGORIES: CATEGORIES, CAT_OTHER: CAT_OTHER,
    journalCategoryOf: journalCategoryOf,
    LIMITS: LIMITS,
    normalizeEntry: normalizeEntry,
    entries: entries,
    getEntry: getEntry,
    addEntry: addEntry,
    updateEntry: updateEntry,
    removeEntry: removeEntry,
    reviewEntry: reviewEntry,
    dueEntries: dueEntries,
    dueCount: dueCount,
    findDuplicate: findDuplicate,
    markActivity: markActivity,
    activityDays: activityDays,
    setLastPage: setLastPage,
    lastPage: lastPage,
    lastTest: lastTest,
    celebrated: celebrated,
    addCelebrated: addCelebrated,
    saveTest: saveTest,
    finalResult: finalResult,
    starredPhrases: starredPhrases,
    togglePhraseStar: togglePhraseStar,
    passedLevels: passedLevels,
    saveFinalResult: saveFinalResult,
    setScore: setScore,
    saveSetScore: saveSetScore,
    lastMix: lastMix,
    setLastMix: setLastMix,
    knownDismissed: knownDismissed,
    solvedSetCount: solvedSetCount,
    dismissKnown: dismissKnown,
    attempts: attempts,
    addAttempt: addAttempt,
    prefs: prefs,
    setPref: setPref,
    entryForItem: entryForItem,
    isAutoEntry: isAutoEntry,
    autoInfo: autoInfo,
    autoCountToday: autoCountToday,
    recordWrong: recordWrong,
    recordCorrect: recordCorrect,
    undoAuto: undoAuto,
    removeAllAuto: removeAllAuto,
    NOTE_MAX: NOTE_MAX,
    examData: examData,
    saveExams: saveExams,
    examMy: examMy,
    setExamMy: setExamMy,
    speakingSessions: speakingSessions,
    addSpeakingSession: addSpeakingSession,
    speakingSeen: speakingSeen,
    markSpeakingSeen: markSpeakingSeen,
    getNote: getNote,
    setNote: setNote,
    removeNote: removeNote,
    noteList: noteList
  };

  // One function to mark a study day, available across the app
  LM.markActivity = markActivity;
})(window.LM);
