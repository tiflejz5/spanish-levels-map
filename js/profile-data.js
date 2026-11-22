/*
 * profile-data.js — dane nauki zapisywane OSOBNO DLA KAŻDEGO PROFILU
 * (tak jak „Umiem”), pod nowymi kluczami localStorage:
 *
 *   slm.journal   { version: 1, profiles: { <idProfilu>: { entries: [wpis…] } } }
 *   slm.activity  { version: 1, profiles: { <idProfilu>: { days: ["RRRR-MM-DD"…], lastPage } } }
 *   slm.placement { version: 1, profiles: { <idProfilu>: { last: wynik | null } } }
 *   slm.celebrated { version: 1, profiles: { <idProfilu>: { ids: ["first-umiem", …] } } }
 *                    — kamienie milowe już pokazane (każdy tylko raz na profil, js/celebrate.js)
 *   slm.exercises { version: 1, profiles: { <idProfilu>: { sets: { <idZestawu>: { best, last } }, lastMix: [idZadania…] } } }
 *                    — wyniki zestawów ćwiczeń (silnik zadań, js/exercise-engine.js);
 *                      best / last = { score, total, date }; recent — ułamki ostatnich 5 wyników
 *                      (sugestia „Umiem”); lastMix — zadania ostatniej sesji mieszanej;
 *                      dismissed: { <idZestawu>: "RRRR-MM-DD" } — odmowa sugestii „Umiem”
 *   slm.attempts  { version: 1, profiles: { <id>: { items: [podejście…], aggregates: { <idZadania>: { n, ok, topic, type, level } } } } }
 *                    — dziennik podejść: każda odpowiedź w zadaniach (bufor 3000, starsze w agregatach; js/learning-stats.js)
 *   slm.autojournal { version: 1, profiles: { <id>: { items: { <idZadania>: { entryId, created, wrongCount, lastWrongAt, returned } } } } }
 *                    — wpisy dziennika błędów dodane automatycznie z zadań (format slm.journal bez zmian;
 *                      wpis łączy pole ref = "ex:<idZadania>")
 *   slm.prefs { version: 1, profiles: { <id>: { autoJournal: true|false, selectionMenu: true|false, highlightWords: true|false } } } — ustawienia nauki
 *                    (selectionMenu i highlightWords — „Moje słowa”, paczka v6; brak pola w starych danych = domyślna wartość)
 *   slm.notes     { version: 1, profiles: { <id>: { items: { <klucz strony>: { text, updatedAt, title, route } } } } }
 *                    — własne notatki (zwykły tekst, maks. 10 000 znaków)
 *   slm.exams     { version: 1, profiles: { <id>: { exams: { <idEgzaminu>: { examDate, drafts: { <zadanie>: tekst }, tasks: { <strona>: { <nr>: true } },
 *                    choices: { <grupa wyboru>: <zadanie> } } } } } }  (choices: wybór jednego z dwóch zadań, matura rozszerzona;
 *                    w starszych danych brak pola → {})
 *                    — exams of the registry (js/exam-core.js), one shape for all exams
 *   slm.speaking  { version: 1, profiles: { <id>: { sessions: [ { day, exam, part: 1–4, scores: { <kryterium>: 1–5 } } ] } } }
 *                    — historia sesji trenera Speaking (samoocena, js/speaking-trainer.js; najnowsze na końcu, maks. 500)
 *                    Opcjonalnie (paczka v6, spec 18): sesja z polem full: true (tryb „Cały egzamin”) oraz w rekordzie profilu
 *                    seen: { "<egzamin>:<część>": [ "<id karty>", … ] } — karty już wylosowane w bieżącym cyklu (losowanie bez powtórek).
 *                    Stary zapis bez tych pól jest poprawny.
 *   slm.finals { version: 1, profiles: { <id>: { levels: { "A1": { passedAt: "RRRR-MM-DD" | null, best: { score, total, date }, last: { score, total, date } } } } } }
 *                    — testy końcowe poziomów A1–C2 i znaczki „poziom zaliczony” (js/final.js, paczka v6);
 *                      passedAt = dzień pierwszego zaliczenia (znaczek zostaje po późniejszej porażce);
 *                      to NIE jest slm.placement (szybki test poziomu)
 *   slm.phrases   { version: 1, profiles: { <id>: { starred: [ "opinia-05", … ] } } }
 *                    — ulubione zwroty z banku zwrotów do pisania (js/writing-phrases.js, paczka v6); id zwrotu z dane/pisanie/zwroty.json
 *
 * Wpis dziennika błędów:
 *   { id, createdAt: "RRRR-MM-DD", context, myAnswer, correct, rule, source,
 *     category, itemId, ref, review: { stage, due, mastered } }
 *   ref — klucz zadania, z którego pochodzi wpis (np. "c1:uoe-p4-warunki:3"),
 *         służy do wykrywania duplikatów.
 *
 * Seria nauki: zapisujemy WYŁĄCZNIE listę dni aktywności; serię liczy
 * LM.learn.streak. Wszystkie dane trafiają do eksportu i są czyszczone
 * przez „Resetuj dane”. Każdy dostęp do localStorage jest w try/catch.
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

  const CATEGORIES = ["Use of English", "Reading", "Writing", "Listening", "Speaking", "Gramatyka", "Słownictwo", "Inne"];
  const CAT_GRAMMAR = CATEGORIES[5], CAT_VOCABULARY = CATEGORIES[6], CAT_OTHER = CATEGORIES[7];

  /** Mistake-log category of a syllabus topic: vocabulary → vocabulary, verbs and grammar → grammar, else other. */
  function journalCategoryOf(topicId) {
    const t = topicId && LM.syl ? LM.syl.topic(topicId) : null;
    if (!t) return CAT_OTHER;
    return t.category === "vocabulary" ? CAT_VOCABULARY : t.category === "verbs" || t.category === "grammar" ? CAT_GRAMMAR : CAT_OTHER;
  }

  // Limity długości (także przy imporcie)
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
      // Uszkodzony zapis: odkładamy kopię i zaczynamy od pustego
      try { window.localStorage.setItem(KEYS[kind] + ".corrupt", raw); } catch (e2) { /* trudno */ }
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
      if (app() && app().reportSaveError) app().reportSaveError("Nie zapisano danych nauki! Brak miejsca albo dostępu do pamięci przeglądarki.");
    }
  }

  function activeId() {
    const p = app() && app().getActiveProfile();
    return p ? p.id : null;
  }

  /** Rekord danego rodzaju dla profilu (tworzony, jeśli go brakuje). */
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

  // ---------- Walidacja (zapis i import) ----------

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

  /** Czysta kopia wpisu albo null, gdy brakuje pól wymaganych. */
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
      category: CATEGORIES.indexOf(raw.category) !== -1 ? raw.category : "Inne",
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
      // Opcjonalne ręczne przypięcie/odpięcie egzaminu (też C1): { "<idEgzaminu>": "pinned" | "hidden" }
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

  /** Dane jednego egzaminu: data, szkice trenera pisania, odhaczone listy na stronach, wybrane zadania w grupach wyboru. */
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

  /** Widziane karty trenera Speaking: { "<egzamin>:<część>": [id, …] } albo null, gdy nic nie ma (pole opcjonalne). */
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
  /** Sesja trenera Speaking: dzień, egzamin, część 1–4, oceny 1–5 (do 8 kryteriów) albo null. */
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
    if (raw.full === true) session.full = true; // tryb „Cały egzamin” (opcjonalne)
    return session;
  }

  /** Podejście (dziennik podejść) albo null przy złym formacie. */
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
    // Opcjonalnie (zadania za kilka punktów, paczka v6): points ≤ max ≤ 20
    if (Number.isInteger(raw.max) && raw.max > 0 && raw.max <= 20 && Number.isInteger(raw.points) && raw.points >= 0 && raw.points <= raw.max) {
      out.points = raw.points;
      out.max = raw.max;
    }
    return out;
  }

  /** Wynik zestawu { score, total, date } albo null. */
  function normalizeScore(raw) {
    if (!U.isPlainObject(raw)) return null;
    const total = Number.isInteger(raw.total) && raw.total > 0 && raw.total <= 500 ? raw.total : 0;
    if (!total || !Number.isInteger(raw.score) || raw.score < 0 || raw.score > total || !learn().isDay(raw.date)) return null;
    return { score: raw.score, total: total, date: raw.date };
  }

  /** { version, profiles: { id: rekord } } → czysta kopia (wyjątek przy złym formacie). */
  function normalizeStore(kind, raw) {
    if (!U.isPlainObject(raw) || !U.isPlainObject(raw.profiles)) throw new Error("Nieprawidłowy format danych (" + KEYS[kind] + ").");
    if (typeof raw.version !== "number" || raw.version > VERSION) throw new Error("Nieobsługiwana wersja danych (" + KEYS[kind] + ").");
    const profiles = {};
    Object.keys(raw.profiles).slice(0, 500).forEach(function (pid) {
      if (typeof pid === "string" && pid.length <= LIMITS.id) profiles[pid] = normalizeRecord(kind, raw.profiles[pid]);
    });
    return { version: VERSION, profiles: profiles };
  }

  // =====================================================================
  // DZIENNIK BŁĘDÓW
  // =====================================================================

  function entries() { return record("journal", activeId()).entries; }

  function getEntry(id) {
    return entries().find(function (e) { return e.id === id; }) || null;
  }

  /** Dodaje wpis (pola już sprawdzone). Zwraca zapisany wpis. */
  function addEntry(fields) {
    const today = learn().today();
    const entry = normalizeEntry(Object.assign({}, fields, { id: U.uid("err"), createdAt: today, review: learn().newReview(today) }));
    if (!entry || !activeId()) return null;
    entries().unshift(entry);
    save("journal");
    markActivity();
    if (LM.cards) LM.cards.autoAddFromJournal(entry); // każdy wpis ma kartę „Moje błędy” od razu (paczka v8)
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

  /** Wynik powtórki: known = true („Wiedziałem(am)”) / false („Znowu błąd”). */
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

  /** Porównanie odpowiedzi przy wykrywaniu duplikatów (wielkość liter i spacje bez znaczenia). */
  function sameAnswer(a, b) {
    const n = function (s) { return String(s || "").toLocaleLowerCase("pl").replace(/\s+/g, " ").trim(); };
    return n(a) === n(b);
  }

  /** Istniejący wpis z tego samego zadania z tą samą błędną odpowiedzią (albo null). */
  function findDuplicate(ref, myAnswer) {
    if (!ref) return null;
    return entries().find(function (e) { return e.ref === ref && sameAnswer(e.myAnswer, myAnswer); }) || null;
  }

  // =====================================================================
  // AKTYWNOŚĆ (seria) I „KONTYNUUJ”
  // =====================================================================

  /** Zapisuje dzisiejszy dzień jako dzień nauki aktywnego profilu. */
  function markActivity() {
    const pid = activeId();
    if (!pid) return;
    const rec = record("activity", pid);
    const today = learn().today();
    if (rec.days.indexOf(today) !== -1) return;
    rec.days.push(today);
    if (rec.days.length > LIMITS.days) rec.days.splice(0, rec.days.length - LIMITS.days);
    save("activity");
    if (LM.celebrate) LM.celebrate.check(); // nowy dzień nauki może zamknąć kamień milowy serii
  }

  function activityDays() { return record("activity", activeId()).days.slice(); }

  /** Ostatnio otwarta podstrona (do „Kontynuuj” na stronie „Dziś”). */
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
  // TEST POZIOMU
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
  // KAMIENIE MILOWE (już pokazane celebracje)
  // =====================================================================

  /** Zbiór pokazanych kamieni milowych aktywnego profilu albo null, gdy profil nie ma jeszcze zapisu. */
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
  // WYNIKI ZESTAWÓW ĆWICZEŃ
  // =====================================================================

  /** { best, last } zestawu dla aktywnego profilu albo null. */
  function setScore(setId) {
    const pid = activeId();
    if (!pid) return null;
    const rec = load("exercises").profiles[pid];
    return rec && rec.sets[setId] ? { best: rec.sets[setId].best, last: rec.sets[setId].last } : null;
  }

  /** Zapisuje wynik ukończonej sesji: ostatni zawsze, najlepszy, gdy procent jest wyższy; recent — ostatnie 5 wyników. */
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
  // TESTY KOŃCOWE POZIOMÓW (paczka v6, spec 13 sekcja 2.4)
  // =====================================================================

  /** { passedAt, best, last } testu końcowego poziomu aktywnego profilu albo null. */
  function finalResult(level) {
    const pid = activeId();
    const rec = pid ? load("levelTests").profiles[pid] : null;
    const r = rec && rec.levels[level];
    return r ? { passedAt: r.passedAt, best: Object.assign({}, r.best), last: Object.assign({}, r.last) } : null;
  }

  /** Zaliczone poziomy aktywnego profilu: { "A1": "RRRR-MM-DD", … }. */
  function passedLevels() {
    const pid = activeId();
    const rec = pid ? load("levelTests").profiles[pid] : null;
    const out = {};
    if (rec) Object.keys(rec.levels).forEach(function (lvl) { if (rec.levels[lvl].passedAt) out[lvl] = rec.levels[lvl].passedAt; });
    return out;
  }

  /**
   * Zapisuje wynik testu końcowego: ostatni zawsze, najlepszy (wyższy procent), dzień pierwszego zaliczenia.
   * res: { score, total, passed }. Zwraca { passed, firstPass, passedAt, best, last } albo null.
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

  // ---------- Ulubione zwroty (bank zwrotów do pisania, slm.phrases) ----------

  /** Id ulubionych zwrotów aktywnego profilu (kopia). */
  function starredPhrases() {
    const pid = activeId();
    const rec = pid ? load("phrases").profiles[pid] : null;
    return rec ? rec.starred.slice() : [];
  }

  /** Przełącza gwiazdkę zwrotu; zwraca true, gdy zwrot jest teraz ulubiony (false także bez profilu albo przy braku miejsca). */
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

  /** Dzień odmowy sugestii „Umiem” dla zestawu (albo null) i zapis odmowy. */
  function umiemDismissed(setId) {
    const pid = activeId();
    const rec = pid ? load("exercises").profiles[pid] : null;
    return rec && rec.dismissed ? rec.dismissed[setId] || null : null;
  }

  function dismissUmiem(setId) {
    const pid = activeId();
    if (!pid || !EX_ID.test(setId)) return;
    const rec = record("exercises", pid);
    rec.dismissed = rec.dismissed || {};
    rec.dismissed[setId] = learn().today();
    save("exercises");
  }

  // =====================================================================
  // DZIENNIK PODEJŚĆ
  // =====================================================================

  /** Rekord podejść aktywnego profilu (do statystyk; nie modyfikuj). */
  function attempts() { return record("attempts", activeId()); }

  /** Zapisuje jedną odpowiedź (po każdym zadaniu). */
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
  // USTAWIENIA NAUKI
  // =====================================================================

  function prefs() { return Object.assign({}, record("prefs", activeId())); }

  function setPref(key, value) {
    const pid = activeId();
    if (!pid) return;
    const rec = record("prefs", pid);
    if (key === "autoJournal") rec.autoJournal = value !== false;
    if (key === "selectionMenu") rec.selectionMenu = value !== false;   // menu przy zaznaczeniu tekstu (Moje słowa), domyślnie włączone
    if (key === "highlightWords") rec.highlightWords = value === true;  // podkreślanie zapisanych słów, domyślnie wyłączone
    save("prefs");
  }

  // =====================================================================
  // AUTOMATYCZNE WPISY DZIENNIKA BŁĘDÓW (spec 03, pkt 2)
  // =====================================================================

  function autoMeta() { return record("autojournal", activeId()).items; }

  /** Wpis dziennika powstały z zadania (pole ref = "ex:<idZadania>") albo null. */
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
   * Błędna odpowiedź → wpis w dzienniku (bez duplikatów). fields — pola wpisu (kontekst, odpowiedzi, reguła…).
   * Zwraca { action, entry, undo } albo null (wyłączone w ustawieniach / brak profilu).
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
    // update / reopen: bez nowego wpisu; zapamiętujemy stan do „Cofnij”
    const before = { review: Object.assign({}, existing.review), meta: meta[itemId] ? Object.assign({}, meta[itemId]) : null };
    existing.review = plan.review;
    const m = meta[itemId] || { entryId: existing.id, created: existing.createdAt, wrongCount: 0, lastWrongAt: null, returned: false };
    m.wrongCount++;
    m.lastWrongAt = today;
    if (plan.action === "reopen") m.returned = true;
    meta[itemId] = m;
    save("journal");
    save("autojournal");
    if (LM.cards) LM.cards.journalWrong(existing); // karta wraca na jutro
    return { action: plan.action, entry: existing, undo: { kind: "update", itemId: itemId, entryId: existing.id, before: before } };
  }

  /** Poprawna odpowiedź: karta wpisu tego zadania, jeśli jest na dziś lub zaległa, dostaje „Dobrze” (harmonogram fiszek). */
  function recordCorrect(itemId) {
    const entry = activeId() ? entryForItem(itemId) : null;
    if (!entry || !LM.cards || !LM.cards.journalCorrect(entry)) return null;
    return { action: "review", entry: entry };
  }

  /** „Cofnij” dla wyniku recordWrong (pojedynczo albo listy). */
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

  /** „Usuń wszystkie automatyczne”: usuwa wpisy dodane automatycznie (ręczne zostają). Zwraca liczbę. */
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
  // EGZAMINY (spec 05) — dane aktywnego profilu dla egzaminu
  // =====================================================================

  /** Obiekt egzaminu { examDate, drafts, tasks, choices } (tworzony, gdy brak; bez profilu — tymczasowy). */
  function examData(examId) {
    const pid = activeId();
    if (!pid || !EX_ID.test(examId)) return normalizeExam(null);
    const rec = record("exams", pid);
    if (!rec.exams[examId]) rec.exams[examId] = normalizeExam(null);
    return rec.exams[examId];
  }

  function saveExams() { save("exams"); }

  /** Ręczne przypięcia egzaminów aktywnego profilu: { id: "pinned" | "hidden" } (kopia; brak pola = pusto). */
  function examMy() {
    const pid = activeId();
    if (!pid) return {};
    return Object.assign({}, record("exams", pid).my || {});
  }

  /** value: "pinned" | "hidden" | null (powrót do automatu). */
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
  // TRENER SPEAKING (spec 09, sekcja 5) — historia sesji z samooceną
  // =====================================================================

  /** Sesje aktywnego profilu dla egzaminu (najnowsze na końcu). */
  function speakingSessions(examId) {
    if (!activeId()) return [];
    return record("speaking", activeId()).sessions.filter(function (s) { return s.exam === examId; });
  }

  /** Id kart widzianych w bieżącym cyklu losowania dla klucza „<egzamin>:<część>” (kopia; brak pola = pusto). */
  function speakingSeen(key) {
    if (!activeId() || !SEEN_KEY.test(key || "")) return [];
    const seen = record("speaking", activeId()).seen;
    return seen && seen[key] ? seen[key].slice() : [];
  }

  /** Zapamiętuje kartę jako widzianą (ids = null czyści cykl). Zwraca false bez profilu albo przy złym kluczu. */
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

  /** Zapisuje sesję { exam, part, scores }. Zwraca zapisaną sesję albo null (brak profilu / zły format). */
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
  // NOTATKI (spec 04, część B)
  // =====================================================================

  function notes() { return record("notes", activeId()).items; }

  function getNote(key) { return activeId() && notes()[key] ? Object.assign({}, notes()[key]) : null; }

  /** Zapisuje notatkę strony; pusta treść = usunięcie. */
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

  /** Lista notatek [{ key, text, updatedAt, title, route }] od ostatnio zmienianych. */
  function noteList() {
    const items = activeId() ? notes() : {};
    return Object.keys(items).map(function (k) { return Object.assign({ key: k }, items[k]); })
      .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0; });
  }

  /** Liczba zestawów (i mixów) z zapisanym wynikiem aktywnego profilu. */
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
    CATEGORIES: CATEGORIES,
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
    umiemDismissed: umiemDismissed,
    solvedSetCount: solvedSetCount,
    dismissUmiem: dismissUmiem,
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

  // Jedna funkcja do zaznaczania dnia nauki, dostępna w całej aplikacji
  LM.markActivity = markActivity;
})(window.LM);
