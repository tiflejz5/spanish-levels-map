/*
 * cards-logic.js — pure flashcard logic (spec 10): no DOM and no localStorage, tests in tools/tests.js.
 * The schedule is separate: js/cards-schedule.js.
 *
 *   normalize(s)                       answer comparison (2.1): lower case, spaces, ’ → ', no punctuation at the edges
 *   levenshtein(a, b)
 *   checkAnswer(input, accepted, opts) LM.exLogic.match → { result: exact|accents|ending|typo|wrong|empty, suggested, expected, near, lenient }
 *   parseCloze(text)                   { ok, before, answers, after, error } — exactly one gap {{a|b}}
 *   fromAnki(text), toAnki(text, hint) {{c1::x}} ↔ {{x}}
 *   answersOf(card), frontText(card)
 *   studyDay(ms, hour?)                "YYYY-MM-DD" of the study day (the boundary is 04:00 local time)
 *   dayStart(day, hour?)               ms of the start of a study day
 *   buildQueue(opts)                   session queue (3.4): learning → reviews (limit) → new (limit)
 *   pickNext(pool, queue, now)         the next card in a session (learning due within 20 min comes back)
 *   deckStats(cards, stateMap, now)    { new, learning, mastered, review, suspended, total }
 *   parseDelimited(text)               TSV/CSV rows (tab or ";" separator, RFC 4180 quotes)
 *   importCards(text, opts)            { cards, rejected: [{ line, reason }], total } — import preview
 *   exportTsv(cards)                   TSV compatible with the Anki import (front, back, tags; cloze as {{c1::…}})
 *   extractSentence(block, selection)  context sentence (≤ 220 characters); makeCloze(sentence, word) → sentence with {{word}} or null
 *   wordFromSelection(text), isTarget(text), wordKey(word), makeWordCard({ selection, sentence, hint, source, day })
 *   sanitizeWordFields(card)           word, source, addedAt, examples on saving and import (spec v6 14)
 *   exportWordsCsv(cards)              "My words" to CSV: word; meaning; sentence; source
 *   sanitizeState(raw)                 state from localStorage / import → a valid state or an exception
 *   emptyState(), pruneDaily(daily, keep?)
 *   daily: { <day>: { new, reviews (reviews of cards in the review state), again, good (Good+Easy), answers (all ratings), minutes } }
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const VERSION = 1;
  const MAX_FIELD = 500;
  const MAX_IMPORT = 2000;
  const DAY_HOUR = 4;           // boundary of the study day
  const LEARN_AHEAD = 20 * 60000; // learning cards due within 20 min may come back in the session
  const TYPES = ["basic", "cloze", "typed"];
  const STATES = ["new", "learning", "review", "relearning"];
  const DEFAULT_SETTINGS = { newPerDay: 10, reviewsPerDay: 100, typeAnswerFirst: false, enabledDecks: [], fuzz: true, autoAddMistakes: false, randomDecks: [] };

  // =====================================================================
  // ANSWERS
  // =====================================================================

  function normalize(s) {
    return String(s == null ? "" : s)
      .replace(/[’‘ʼ`´]/g, "'")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "") // any punctuation at the edges: quotes, brackets, opening marks, dashes
      .trim();
  }

  function levenshtein(a, b) {
    a = String(a); b = String(b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, function (_, j) { return j; });
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const NEAR_RATING = { accents: "hard", typo: "hard", ending: "again" };

  /**
   * Rating of a typed answer (2.1) with the shared check LM.exLogic.match (spec 05 §2).
   * accepted — the accepted answers (the first is the model); opts.lenientAccents (spec 06 E4).
   * → { result: exact | accents | ending | typo | wrong | empty, suggested, expected, near, lenient }
   *   lenient: accents only, counted as exact; near stays "accents" so the view still shows the right spelling.
   */
  function checkAnswer(input, accepted, opts) {
    const list = (accepted || []).filter(function (a) { return normalize(a); });
    const m = LM.exLogic.match(input, list, {});
    const expected = m.closest || list[0] || "";
    if (!m.answered) return { result: "empty", suggested: "again", expected: expected, near: null, lenient: false };
    if (m.ok) return { result: "exact", suggested: "good", expected: expected, near: null, lenient: false };
    if (m.near === "accents" && opts && opts.lenientAccents) return { result: "exact", suggested: "good", expected: expected, near: "accents", lenient: true };
    if (m.near) return { result: m.near, suggested: NEAR_RATING[m.near], expected: expected, near: m.near, lenient: false };
    return { result: "wrong", suggested: "again", expected: expected, near: null, lenient: false };
  }

  // =====================================================================
  // CLOZE
  // =====================================================================

  /** {{c1::x}} / {{c2::x::hint}} (Anki) → {{x}}. */
  function fromAnki(text) {
    return String(text == null ? "" : text).replace(/\{\{c\d+::([^{}]*?)(?:::[^{}]*)?\}\}/g, "{{$1}}");
  }

  /** {{a|b}} → {{c1::a}} (the first alternative, an optional Anki hint). */
  function toAnki(text, hint) {
    return String(text).replace(/\{\{([^{}]+)\}\}/g, function (_, inner) {
      return "{{c1::" + inner.split("|")[0].trim() + (hint ? "::" + String(hint).replace(/[{}]/g, "") : "") + "}}";
    });
  }

  function parseCloze(text) {
    const t = String(text == null ? "" : text);
    const all = t.match(/\{\{[^{}]*\}\}/g) || [];
    if (!all.length) return { ok: false, error: "No gap. Mark the answer in {{double braces}}." };
    if (all.length > 1) return { ok: false, error: "A card can have only one gap {{…}}." };
    if (/\{\{|\}\}/.test(t.replace(all[0], ""))) return { ok: false, error: "Unclosed braces {{ }}." };
    const inner = all[0].slice(2, -2);
    const answers = inner.split("|").map(function (x) { return x.trim(); });
    if (!answers.length || answers.some(function (x) { return !x; })) return { ok: false, error: "The gap and every alternative (a|b) need text." };
    const i = t.indexOf(all[0]);
    return { ok: true, before: t.slice(0, i), answers: answers, after: t.slice(i + all[0].length) };
  }

  /** Accepted answers of a card (the first = the model). */
  function answersOf(card) {
    if (card.type === "cloze") { const c = parseCloze(card.text); return c.ok ? c.answers : []; }
    if (card.type === "typed") return (card.accepted && card.accepted.length ? card.accepted : [card.back]).filter(Boolean);
    return [card.back].filter(Boolean);
  }

  /** Text of the front (for lists and search): cloze with "_____". */
  function frontText(card) {
    if (card.type === "cloze") { const c = parseCloze(card.text); return c.ok ? c.before + "_____" + c.after : String(card.text || ""); }
    return String(card.front || "");
  }

  // =====================================================================
  // STUDY DAY AND QUEUE
  // =====================================================================

  function pad(n) { return String(n).padStart(2, "0"); }

  /** Study day of moment ms (local time; the night until 04:00 belongs to the previous day). */
  function studyDay(ms, hour) {
    const d = new Date(ms - (hour == null ? DAY_HOUR : hour) * 3600000);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** Start of the study day "YYYY-MM-DD" (local, at 04:00). */
  function dayStart(day, hour) {
    const p = String(day).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2], hour == null ? DAY_HOUR : hour, 0, 0, 0).getTime();
  }

  /** End of the current study day (the start of the next one). */
  function dayEnd(now, hour) {
    const p = studyDay(now, hour).split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2] + 1, hour == null ? DAY_HOUR : hour, 0, 0, 0).getTime();
  }

  function isHidden(st, now) {
    return !!(st && (st.suspended || (st.buriedUntil && st.buriedUntil > now)));
  }

  /**
   * Session queue (3.4). opts:
   *   cards     cards of the enabled decks in deck order ([{ id, deck, … }])
   *   state     state map { id: state } (missing = new)
   *   now       ms
   *   settings  { newPerDay, reviewsPerDay, randomDecks: [ids of decks with random order of new cards] }
   *   today     { new, reviews } — already done today (daily)
   *   extraNew  extra new cards over the limit (e.g. "Add 5 more new cards")
   *   random    () => [0, 1) — for shuffling new cards in decks set to "random"
   * Returns { learning: [id], review: [id], fresh: [id], queue: [id] } (queue = review + fresh;
   * pickNext picks the learning cards).
   */
  function buildQueue(opts) {
    const now = opts.now, st = opts.state || {}, s = Object.assign({}, DEFAULT_SETTINGS, opts.settings || {});
    const today = opts.today || {};
    const end = dayEnd(now);
    const learning = [], review = [], fresh = [];
    (opts.cards || []).forEach(function (c) {
      const x = st[c.id];
      if (isHidden(x, now)) return;
      if (!x || x.state === "new") fresh.push(c);
      else if (x.state === "learning" || x.state === "relearning") learning.push(c);
      else if (x.state === "review" && x.due < end) review.push(c);
    });
    learning.sort(function (a, b) { return st[a.id].due - st[b.id].due; });
    review.sort(function (a, b) { return st[a.id].due - st[b.id].due; }); // most overdue first
    const reviewLeft = Math.max(0, s.reviewsPerDay - (today.reviews || 0));
    const newLeft = Math.max(0, s.newPerDay - (today.new || 0)) + (opts.extraNew || 0);
    // New: in deck order; decks set to "random" are shuffled inside (deck order unchanged)
    let freshOrdered = fresh;
    const random = opts.random || Math.random;
    if ((s.randomDecks || []).length) {
      const byDeck = [];
      fresh.forEach(function (c) {
        const last = byDeck[byDeck.length - 1];
        if (last && last.deck === c.deck) last.cards.push(c); else byDeck.push({ deck: c.deck, cards: [c] });
      });
      freshOrdered = [];
      byDeck.forEach(function (g) {
        const cards = g.cards.slice();
        if (s.randomDecks.indexOf(g.deck) !== -1) {
          for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
        }
        freshOrdered = freshOrdered.concat(cards);
      });
    }
    const ids = function (l) { return l.map(function (c) { return c.id; }); };
    const r = ids(review.slice(0, reviewLeft)), f = ids(freshOrdered.slice(0, newLeft));
    return { learning: ids(learning), review: r, fresh: f, queue: r.concat(f) };
  }

  /**
   * Next card of a session: (1) learning due ≤ now, (2) the first in the queue, (3) learning
   * due within 20 min (comes back in the same session). pool — ids of learning cards in the session.
   * Returns { id, from: "learning"|"queue"|"ahead" } or null.
   */
  function pickNext(pool, queue, state, now) {
    const due = pool.filter(function (id) { return state[id] && state[id].due <= now; })
      .sort(function (a, b) { return state[a].due - state[b].due; });
    if (due.length) return { id: due[0], from: "learning" };
    if (queue.length) return { id: queue[0], from: "queue" };
    const ahead = pool.filter(function (id) { return state[id] && state[id].due <= now + LEARN_AHEAD; })
      .sort(function (a, b) { return state[a].due - state[b].due; });
    return ahead.length ? { id: ahead[0], from: "ahead" } : null;
  }

  /** Numbers for the deck bars: new / learning / mastered (interval ≥ 21 d) / other reviews / suspended. */
  function deckStats(cards, state, now) {
    const out = { total: 0, new: 0, learning: 0, review: 0, mastered: 0, suspended: 0, due: 0, later: 0 };
    (cards || []).forEach(function (c) {
      const x = state[c.id];
      out.total++;
      if (x && x.suspended) { out.suspended++; return; }
      if (!x || x.state === "new") out.new++;
      else if (x.state === "learning" || x.state === "relearning") out.learning++;
      else if (x.interval >= 21) out.mastered++;
      else out.review++;
      if (x && x.state !== "new" && !isHidden(x, now)) { if (x.due < dayEnd(now)) out.due++; else out.later++; } // "later": due after today's study day
    });
    return out;
  }

  // =====================================================================
  // TSV / CSV
  // =====================================================================

  /** Rows from text: tab or ";" separator (detected from the first line), RFC 4180 quotes. */
  function parseDelimited(text) {
    const t = String(text == null ? "" : text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const firstLine = t.split("\n")[0];
    const sep = firstLine.indexOf("\t") !== -1 ? "\t" : firstLine.indexOf(";") !== -1 ? ";" : firstLine.indexOf(",") !== -1 ? "," : "\t";
    const rows = [];
    let row = [], cell = "", q = false, i = 0, line = 1, rowLine = 1;
    while (i < t.length) {
      const ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        if (ch === "\n") line++;
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === "") { q = true; i++; continue; }
      if (ch === sep) { row.push(cell); cell = ""; i++; continue; }
      if (ch === "\n") {
        row.push(cell); rows.push({ line: rowLine, cells: row }); row = []; cell = ""; i++; line++; rowLine = line; continue;
      }
      cell += ch; i++;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push({ line: rowLine, cells: row }); }
    return { separator: sep, rows: rows.filter(function (r) { return r.cells.some(function (c) { return c.trim() !== ""; }); }) };
  }

  const TYPE_ALIASES = { basic: "basic", cloze: "cloze", typed: "typed" };

  function splitTags(s) {
    return String(s || "").split(/[\s,]+/).map(function (x) { return x.trim().toLowerCase(); })
      .filter(function (x) { return /^[\p{L}\p{N}_:-]{1,40}$/u.test(x); }).slice(0, 10);
  }

  /**
   * A card from fields (form or import) → { card } or { error }.
   * fields: { type, front, back, hint, example, note, tags }
   */
  function makeCard(fields) {
    const type = TYPE_ALIASES[String(fields.type || "").trim().toLowerCase()];
    if (!type) return { error: "Unknown card type (allowed: basic, cloze, typed)." };
    const f = {};
    for (const k of ["front", "back", "hint", "example", "note"]) {
      const v = String(fields[k] == null ? "" : fields[k]).trim();
      if (v.length > MAX_FIELD) return { error: "The field “" + k + "” is longer than " + MAX_FIELD + " characters." };
      f[k] = v;
    }
    const card = { type: type, tags: Array.isArray(fields.tags) ? fields.tags.slice(0, 10) : splitTags(fields.tags) };
    if (type === "cloze") {
      const text = fromAnki(f.front);
      const c = parseCloze(text);
      if (!c.ok) return { error: c.error };
      card.text = text;
      if (f.back) card.note = f.back;
    } else {
      if (!f.front || !f.back) return { error: "A card needs a front and a back." };
      card.front = f.front;
      card.back = f.back;
      if (type === "typed") {
        card.accepted = f.back.split("|").map(function (x) { return x.trim(); }).filter(Boolean);
        card.back = card.accepted[0];
      }
    }
    if (f.hint) card.hint = f.hint;
    if (f.example) card.example = f.example;
    if (f.note) card.note = f.note;
    return { card: card };
  }

  /**
   * Import preview: columns "type; front; back; hint; example; note; tags"
   * or the Anki format (front, back, tags — type detected: {{c1::…}} = cloze, otherwise basic).
   * A header row (first cell "type" or "front") is skipped. Limit 2000 cards.
   */
  function importCards(text, opts) {
    const limit = (opts && opts.limit) || MAX_IMPORT;
    const parsed = parseDelimited(text);
    const cards = [], rejected = [];
    // Format of the whole file: with a type column (header "type" or a known type in the first column) or Anki
    const first = function (r) { return String(r.cells[0] || "").trim().toLowerCase(); };
    const typed = parsed.rows.some(function (r, i) { return (i === 0 && /^type$/.test(first(r))) || TYPE_ALIASES[first(r)]; });
    parsed.rows.forEach(function (r, idx) {
      const cells = r.cells.map(function (c) { return c.trim(); });
      if (idx === 0 && /^(type|front)$/i.test(cells[0])) return;
      if (cards.length >= limit) { rejected.push({ line: r.line, reason: "Over the limit of " + limit + " cards in one import." }); return; }
      let fields;
      if (typed) {
        fields = { type: cells[0], front: cells[1], back: cells[2], hint: cells[3], example: cells[4], note: cells[5], tags: cells[6] };
      } else {
        fields = { type: /\{\{c\d+::/.test(cells[0]) || /\{\{[^{}]+\}\}/.test(cells[0]) ? "cloze" : "basic", front: cells[0], back: cells[1], tags: cells[2] };
      }
      const res = makeCard(fields);
      if (res.error) rejected.push({ line: r.line, reason: res.error });
      else cards.push(res.card);
    });
    return { cards: cards, rejected: rejected, total: parsed.rows.length, separator: parsed.separator };
  }

  function tsvCell(s) {
    const v = String(s == null ? "" : s);
    return /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  /** TSV compatible with the Anki import: front, back, tags (cloze: {{c1::…}}, back = hint and note). */
  function exportTsv(cards) {
    return (cards || []).map(function (c) {
      let front, back;
      if (c.type === "cloze") {
        front = toAnki(c.text, c.hint);
        back = [c.note, c.example].filter(Boolean).join(" — ");
      } else {
        front = c.front + (c.hint ? " (" + c.hint + ")" : "");
        back = (c.type === "typed" && c.accepted ? c.accepted.join(" | ") : c.back) + (c.note ? " — " + c.note : "");
      }
      return [front, back, (c.tags || []).join(" ")].map(tsvCell).join("\t");
    }).join("\n") + "\n";
  }

  // =====================================================================
  // MY WORDS (pack v6, spec 14): selection → context sentence → card with a gap
  // =====================================================================

  const WORD_MAX = 60;       // characters in a saved word / phrase
  const WORD_WORDS = 6;      // words in a selection
  const SENTENCE_MAX = 220;  // characters in the context sentence and in an example
  const EXAMPLES_MAX = 3;    // added examples
  /** Abbreviations of the target language (LM.lang.abbreviations), lower case, without the final full stop. */
  function abbreviations() {
    return ((LM.lang && LM.lang.abbreviations) || []).map(function (a) { return a.replace(/\.$/, "").toLowerCase(); });
  }

  /** Typographic apostrophes → ' (same length, so indexes in the text still match). */
  function foldApostrophes(s) { return String(s).replace(/[’‘ʼ`´]/g, "'"); }

  /** Whether a text is in the target language when no lang attribute says so (LM.lang.isTarget). */
  function isTarget(text) { return !!(LM.lang && LM.lang.isTarget(text)); }

  /**
   * The card's text for playback (S, auto-play): only target-language text, never the English prompt (spec 05 §4).
   * cloze: the sentence with the gap as a pause until revealed; typed: the back (target by format, spec 07 §7) once revealed;
   * basic (own cards, any direction): the front when it is in the target language, otherwise the back once revealed.
   */
  function cardSpeech(card, revealed) {
    if (!card) return "";
    const tidy = function (t) { return String(t).replace(/\s+/g, " ").trim(); };
    if (card.type === "cloze") {
      const c = parseCloze(card.text);
      return c.ok ? tidy(c.before + (revealed ? c.answers[0] : " … ") + c.after) : "";
    }
    const front = String(card.front || ""), back = String(card.back || "");
    if (card.type === "typed") return revealed ? tidy(back) : "";
    if (front && isTarget(front)) return tidy(front);
    return revealed && back ? tidy(back) : "";
  }

  /**
   * Selection → word / phrase to save, or "" (too long: > 60 characters or > 6 words, no letters).
   * Punctuation at the edges and {}| are removed.
   */
  function wordFromSelection(text) {
    let t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
    t = t.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
    t = t.replace(/[{}|]/g, " ").replace(/\s+/g, " ").trim();
    if (!t || t.length > WORD_MAX || !/\p{L}/u.test(t)) return "";
    return t.split(" ").length > WORD_WORDS ? "" : t;
  }

  /** Index of the first occurrence of a phrase in a text (case-insensitive, with word boundaries), or -1. */
  function findWord(text, word) {
    const w = String(word == null ? "" : word).trim();
    if (!w) return -1;
    const pattern = foldApostrophes(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const m = new RegExp("(?<![\\p{L}\\p{N}])" + pattern + "(?![\\p{L}\\p{N}])", "iu").exec(foldApostrophes(text));
    return m ? m.index : -1;
  }

  function escapeClass(s) { return String(s || "").replace(/[\\\]^-]/g, "\\$&"); }

  /**
   * Sentence ranges: an end after . ! ? … and a space before a capital letter, which may follow an opening mark
   * (quotes, a bracket, a dash, LM.lang.sentenceOpeners); no split at abbreviations (LM.lang.abbreviations), initials or numbers (3.5).
   */
  function splitSentences(text) {
    const out = [];
    let start = 0;
    const openers = escapeClass((LM.lang && LM.lang.sentenceOpeners) || "");
    const re = new RegExp("[.!?…]+[\"”’»')\\]]*\\s+(?=[\"“‘'«(\\[—–" + openers + "]*\\p{Lu})", "gu");
    const abbr = abbreviations();
    let m;
    while ((m = re.exec(text))) {
      const before = text.slice(start, m.index);
      const tok = (/(\S+)$/.exec(before) || [])[1] || "";
      const bare = tok.replace(/^[("'“‘«\[—–]+/, "");
      // a multi-word abbreviation ("p. ej."): the last two tokens together
      const two = ((/(\S+\s+\S+)$/.exec(before) || [])[1] || "").toLowerCase();
      const abbreviation = m[0].charAt(0) === "." && (abbr.indexOf(bare.toLowerCase()) !== -1 || abbr.indexOf(two) !== -1 || /^\p{Lu}$/u.test(bare) || /^(?:\p{L}\.)+\p{L}$/u.test(bare));
      if (abbreviation) continue;
      out.push({ start: start, end: m.index + m[0].replace(/\s+$/, "").length });
      start = m.index + m[0].length;
    }
    if (start < text.length) out.push({ start: start, end: text.length });
    return out;
  }

  /** A sentence longer than SENTENCE_MAX → a window around the word with "…" on both sides (≤ SENTENCE_MAX characters in total). */
  function windowAround(s, word) {
    const w = String(word).trim();
    const j = findWord(s, w);
    if (j === -1) {
      const cut = s.slice(0, SENTENCE_MAX - 1);
      return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim() + "…";
    }
    const budget = SENTENCE_MAX - 2; // room for two "…"
    let from = Math.max(0, j - Math.floor((budget - w.length) / 2));
    let to = Math.min(s.length, from + budget);
    from = Math.max(0, to - budget); // a shorter right side → the window moves left
    // word boundaries: never cut inside a word
    if (from > 0) { const sp = s.indexOf(" ", from); if (sp !== -1 && sp < j) from = sp + 1; }
    if (to < s.length) { const sp = s.lastIndexOf(" ", to); if (sp > j + w.length) to = sp; }
    return (from > 0 ? "…" : "") + s.slice(from, to).trim() + (to < s.length ? "…" : "");
  }

  /**
   * Context sentence: text of the block (p, li, td, blockquote, dd) → the sentence that contains the selection, at most 220 characters
   * (longer ones with "…" around the word). When the selection is not in the text — the block's first sentence.
   */
  function extractSentence(blockText, selection) {
    const text = String(blockText == null ? "" : blockText).replace(/\s+/g, " ").trim();
    if (!text) return "";
    const sel = String(selection == null ? "" : selection).replace(/\s+/g, " ").trim();
    const i = findWord(text, sel);
    const ranges = splitSentences(text);
    let range = ranges[0] || { start: 0, end: text.length };
    if (i !== -1) range = ranges.find(function (r) { return i >= r.start && i < r.end; }) || ranges.find(function (r) { return i >= r.start && i <= r.end; }) || range;
    const s = text.slice(range.start, range.end).trim();
    return s.length <= SENTENCE_MAX ? s : windowAround(s, sel);
  }

  /** Sentence with a {{word}} gap (the first occurrence, spelling from the text kept), or null when the selection is not in the sentence. */
  function makeCloze(sentence, selection) {
    const s = String(sentence == null ? "" : sentence).replace(/[{}]/g, "");
    const w = String(selection == null ? "" : selection).trim();
    const i = findWord(s, w);
    if (i === -1) return null;
    const m = new RegExp("^(?:" + foldApostrophes(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + ")", "iu").exec(foldApostrophes(s.slice(i)));
    const len = m ? m[0].length : w.length;
    return s.slice(0, i) + "{{" + s.slice(i, i + len) + "}}" + s.slice(i + len);
  }

  /** Deduplication key of a word: the same word from another sentence has the same key (normalize: case, spaces, apostrophes). */
  function wordKey(word) { return normalize(word); }

  function isDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= 31;
  }

  /**
   * New card fields from "My words", safe on saving and import: word ≤ 60, source { route (#/…, ≤ 200), title ≤ 120 },
   * addedAt YYYY-MM-DD, examples ≤ 3 × 220 characters. Missing or bad fields are dropped (an old file still works).
   */
  function sanitizeWordFields(x) {
    const out = {};
    if (!x || typeof x !== "object") return out;
    if (typeof x.word === "string" && x.word.trim()) out.word = x.word.trim().slice(0, WORD_MAX);
    if (x.source && typeof x.source === "object") {
      const src = {};
      if (typeof x.source.route === "string" && x.source.route.length <= 200 && /^#\/[^\s<>"]*$/.test(x.source.route)) src.route = x.source.route;
      if (typeof x.source.title === "string" && x.source.title.trim()) src.title = x.source.title.trim().slice(0, 120);
      if (src.route || src.title) out.source = src;
    }
    if (isDay(x.addedAt)) out.addedAt = x.addedAt;
    if (Array.isArray(x.examples)) {
      const ex = x.examples.filter(function (e) { return typeof e === "string" && e.trim(); }).map(function (e) { return e.replace(/\s+/g, " ").trim().slice(0, SENTENCE_MAX); }).slice(0, EXAMPLES_MAX);
      if (ex.length) out.examples = ex;
    }
    return out;
  }

  /**
   * A "My words" card from a selection: { selection, sentence, hint?, source?, day? } → { card } or { error }.
   * A {{word}} gap in the sentence (cloze); without a sentence or without the word in it — a plain card (front = word, back = sentence).
   */
  function makeWordCard(o) {
    const word = wordFromSelection(o && o.selection);
    if (!word) return { error: "Select 1 to 6 words (at most " + WORD_MAX + " characters)." };
    const sentence = String((o && o.sentence) || "").replace(/\s+/g, " ").trim().slice(0, SENTENCE_MAX);
    const hint = String((o && o.hint) || "").trim().slice(0, MAX_FIELD);
    const cloze = sentence ? makeCloze(sentence, word) : null;
    const res = cloze
      ? makeCard({ type: "cloze", front: cloze, hint: hint })
      : makeCard({ type: "basic", front: word, back: sentence || hint || "—", hint: sentence ? hint : "" });
    if (res.error) return res;
    const extra = sanitizeWordFields({ word: word, source: o && o.source, addedAt: o && o.day });
    return { card: Object.assign(res.card, extra) };
  }

  /** "My words" to CSV (";" separator, RFC 4180 quotes): word; meaning; sentence; source. */
  function exportWordsCsv(cards) {
    const cell = function (s) { const v = String(s == null ? "" : s); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [["word", "meaning", "sentence", "source"].join(";")];
    (cards || []).forEach(function (c) {
      let sentence = "";
      if (c.type === "cloze") { const p = parseCloze(c.text); sentence = p.ok ? p.before + p.answers[0] + p.after : String(c.text || ""); }
      else sentence = String(c.back || "");
      const word = c.word || (c.type === "cloze" ? ((parseCloze(c.text).answers || [])[0] || "") : c.front);
      lines.push([word, c.hint || "", sentence, c.source ? (c.source.title || "") + (c.source.route ? " (" + c.source.route + ")" : "") : ""].map(cell).join(";"));
    });
    return lines.join("\n") + "\n";
  }

  // =====================================================================
  // STATE (localStorage, export / import)
  // =====================================================================

  /** Built-in decks on for a new profile: "enabled": true in content/decks/index.json (spec 07 §7: the first A1 deck). */
  function defaultEnabledDecks() {
    const idx = LM.DECKS_INDEX && Array.isArray(LM.DECKS_INDEX.decks) ? LM.DECKS_INDEX.decks : [];
    return idx.filter(function (d) { return d && d.enabled === true && typeof d.id === "string"; }).map(function (d) { return d.id; });
  }

  function emptyState() {
    return { version: VERSION, cards: {}, userDecks: [], userCards: [], settings: Object.assign({}, DEFAULT_SETTINGS, { enabledDecks: defaultEnabledDecks(), randomDecks: [] }), daily: {} };
  }

  const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
  const EX_KEY = /^ex:[a-z0-9][a-z0-9-]{0,99}$/; // state of a weak-spot item (pack v8, spec 20 R1)
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function num(v, min, max) { return typeof v === "number" && isFinite(v) && v >= min && v <= max; }
  function cut(v) { return typeof v === "string" ? v.slice(0, MAX_FIELD) : ""; }

  function sanitizeCardState(x) {
    if (!x || typeof x !== "object" || STATES.indexOf(x.state) === -1) return null;
    const out = {
      state: x.state,
      step: num(x.step, 0, 20) ? Math.floor(x.step) : 0,
      ease: num(x.ease, 1.3, 2.8) ? x.ease : 2.5,
      interval: num(x.interval, 0, 365) ? Math.round(x.interval) : 0,
      pendingInterval: num(x.pendingInterval, 0, 365) ? Math.round(x.pendingInterval) : 0,
      lapses: num(x.lapses, 0, 1e6) ? Math.floor(x.lapses) : 0,
      reps: num(x.reps, 0, 1e7) ? Math.floor(x.reps) : 0,
      due: num(x.due, 0, 8.64e15) ? x.due : 0
    };
    if (x.suspended === true) out.suspended = true;
    if (num(x.buriedUntil, 0, 8.64e15)) out.buriedUntil = x.buriedUntil;
    if (num(x.again, 0, 1e6)) out.again = Math.floor(x.again);
    return out;
  }

  function sanitizeUserCard(x, deckIds) {
    if (!x || typeof x !== "object" || !/^u-[a-z0-9-]{1,60}$/.test(x.id || "") || deckIds.indexOf(x.deck) === -1) return null;
    const fields = { type: x.type, front: x.type === "cloze" ? cut(x.text) : cut(x.front), back: x.type === "typed" && Array.isArray(x.accepted) ? x.accepted.map(cut).join("|") : cut(x.back),
      hint: cut(x.hint), example: cut(x.example), note: x.type === "cloze" ? "" : cut(x.note), tags: Array.isArray(x.tags) ? x.tags.filter(function (t) { return typeof t === "string"; }).map(function (t) { return t.slice(0, 40); }).slice(0, 10) : [] };
    if (TYPES.indexOf(x.type) === -1) return null;
    const res = makeCard(fields);
    if (res.error) return null;
    const card = Object.assign({ id: x.id, deck: x.deck }, res.card);
    if (x.type === "cloze" && x.note) card.note = cut(x.note);
    if (typeof x.sourceItemId === "string" && x.sourceItemId) card.sourceItemId = x.sourceItemId.slice(0, 200);
    if (typeof x.createdAt === "string") card.createdAt = x.createdAt.slice(0, 30);
    return Object.assign(card, sanitizeWordFields(x)); // "My words": word, source, addedAt, examples (optional)
  }

  function pruneDaily(daily, keep) {
    const days = Object.keys(daily || {}).filter(function (d) { return DAY_RE.test(d); }).sort();
    const out = {};
    days.slice(-(keep || 400)).forEach(function (d) { out[d] = daily[d]; });
    return out;
  }

  /** State from localStorage or an import → a valid state; an unknown version / a wrong format → an exception. */
  function sanitizeState(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Wrong flashcard data format.");
    if (raw.version !== VERSION) throw new Error("Unsupported flashcard data version (" + raw.version + ").");
    const out = emptyState();
    const cards = raw.cards && typeof raw.cards === "object" ? raw.cards : {};
    Object.keys(cards).slice(0, 20000).forEach(function (id) {
      if (!ID.test(id) && !/^u-[a-z0-9-]{1,60}$/.test(id) && !EX_KEY.test(id)) return;
      const s = sanitizeCardState(cards[id]);
      if (s) out.cards[id] = s;
    });
    (Array.isArray(raw.userDecks) ? raw.userDecks : []).slice(0, 200).forEach(function (d) {
      if (!d || !/^u-[a-z0-9-]{1,60}$/.test(d.id || "") || typeof d.title !== "string" || !d.title.trim()) return;
      if (out.userDecks.some(function (x) { return x.id === d.id; })) return;
      out.userDecks.push({ id: d.id, title: d.title.trim().slice(0, 80), createdAt: typeof d.createdAt === "string" ? d.createdAt.slice(0, 30) : "", system: d.system === "mistakes" || d.system === "words" ? d.system : undefined });
      if (!out.userDecks[out.userDecks.length - 1].system) delete out.userDecks[out.userDecks.length - 1].system;
    });
    const deckIds = out.userDecks.map(function (d) { return d.id; });
    const seen = {};
    (Array.isArray(raw.userCards) ? raw.userCards : []).slice(0, 10000).forEach(function (c) {
      const card = sanitizeUserCard(c, deckIds);
      if (card && !seen[card.id]) { seen[card.id] = true; out.userCards.push(card); }
    });
    const s = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
    if (num(s.newPerDay, 0, 999)) out.settings.newPerDay = Math.floor(s.newPerDay);
    if (num(s.reviewsPerDay, 0, 9999)) out.settings.reviewsPerDay = Math.floor(s.reviewsPerDay);
    ["typeAnswerFirst", "fuzz", "autoAddMistakes"].forEach(function (k) { if (typeof s[k] === "boolean") out.settings[k] = s[k]; });
    ["enabledDecks", "randomDecks"].forEach(function (k) {
      if (Array.isArray(s[k])) out.settings[k] = s[k].filter(function (id) { return typeof id === "string" && (ID.test(id) || /^u-[a-z0-9-]{1,60}$/.test(id)); }).slice(0, 200);
    });
    const daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
    Object.keys(daily).forEach(function (d) {
      const x = daily[d];
      if (!DAY_RE.test(d) || !x || typeof x !== "object") return;
      out.daily[d] = { new: num(x.new, 0, 1e5) ? Math.floor(x.new) : 0, reviews: num(x.reviews, 0, 1e5) ? Math.floor(x.reviews) : 0,
        again: num(x.again, 0, 1e5) ? Math.floor(x.again) : 0, good: num(x.good, 0, 1e5) ? Math.floor(x.good) : 0,
        answers: num(x.answers, 0, 1e5) ? Math.floor(x.answers) : 0, minutes: num(x.minutes, 0, 1440) ? Math.round(x.minutes) : 0 };
      if (num(x.exNew, 1, 1e3)) out.daily[d].exNew = Math.floor(x.exNew); // new weak-spot items of that day (limit 3)
    });
    out.daily = pruneDaily(out.daily, 400);
    return out;
  }

  // =====================================================================
  // EXAMS FROM CARD TAGS (pack v6, spec 15, section 3) — no new field; the codes come from the exam registry (spec 06 E8)
  // =====================================================================

  /** Exams of the registry as tag codes: [{ code: "<code in lower case>", short: "<code>", name: "<label>" }] (registry order). */
  function examList() {
    const list = (LM.EXAM_REGISTRY && LM.EXAM_REGISTRY.exams) || [];
    return list.map(function (e) { return { code: String(e.code || "").toLowerCase(), short: String(e.code || ""), name: e.label || "" }; }).filter(function (e) { return e.code; });
  }

  /** Exams of a card from its tags (a tag equal to an exam code, any case). Registry order, no repeats. */
  function examsOf(card) {
    const tags = ((card && card.tags) || []).map(function (t) { return String(t).toLowerCase(); });
    return examList().filter(function (e) { return tags.indexOf(e.code) !== -1; });
  }

  // =====================================================================
  // MISTAKE LOG → "MY MISTAKES" CARDS (pack v8, spec 20 R1)
  // =====================================================================

  const MISTAKES_DECK = "u-moje-bledy";
  const MASTERED_INTERVAL = 21;
  const DAY_MS = 86400000;

  /** Key by which a log entry finds its card (as before: the item's ref or journal:<id>). */
  function journalSource(e) { return e.ref ? String(e.ref) : "journal:" + e.id; }

  /** Fixed id of an entry's card (old and new entries give the same one, so nothing is duplicated). */
  function journalCardId(e) { return "u-mb-" + String(e.id || "x").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50); }


  function cleanAnswer(s) { return String(s == null ? "" : s).replace(/[{}|]/g, " ").replace(/\s+/g, " ").trim(); }

  /**
   * Accepted answers of the gap from the entry's "correct" field: "A – make" → "A – make", "make", "A"; a full model sentence
   * (transformation from the exercise engine: "before answer after") → only the answer, without the text before and after the gap.
   */
  function gapAnswers(line, correct) {
    let c = cleanAnswer(correct).slice(0, 200);
    if (!c) return [];
    const parts = String(line).split(/_{3,}/);
    const before = cleanAnswer(parts[0]), after = cleanAnswer(parts[1] || "");
    const low = c.toLowerCase();
    if ((before || after) && low.length > before.length + after.length && low.indexOf(before.toLowerCase()) === 0 && low.slice(low.length - after.length) === after.toLowerCase()) {
      const mid = c.slice(before.length, c.length - after.length).trim();
      if (mid) c = mid;
    }
    const out = [c];
    const m = /^([A-H])\s*[–-]\s*(.+)$/.exec(c);
    if (m) { out.push(m[2].trim(), m[1]); }
    return out.filter(function (x, i) { return x && out.indexOf(x) === i; });
  }

  /**
   * A card from a log entry. The front shows the WHOLE context of the entry (all lines, split into rows): the sentence with a gap,
   * and also options A–D, the base word, the transformation key word and the form in brackets, i.e. the item's hints.
   * With a ___ gap → cloze (the gap in its own line; accepted answers from the "correct" field), without a gap → a plain card
   * (front = context, back = right answer). The entry's rule goes to "Note" after revealing.
   */
  function journalCard(e) {
    const rule = String(e.rule || "").slice(0, 500);
    const correct = cleanAnswer(e.correct).slice(0, 200);
    const lines = String(e.context || "").replace(/\r/g, "").split("\n").map(function (l) { return l.replace(/[{}]/g, "").replace(/[ \t]+/g, " ").trim(); });
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    let gi = lines.findIndex(function (l) { return /_{3,}/.test(l); });
    if (gi !== -1 && correct) {
      const answers = gapAnswers(lines[gi], e.correct);
      let work = lines.slice();
      for (let tries = 0; tries < lines.length; tries++) {
        const text = work.map(function (l, i) { return i === gi ? l.replace(/_{3,}/, "{{" + answers.join("|") + "}}") : l; }).join("\n");
        if (text.length <= MAX_FIELD) {
          const res = makeCard({ type: "cloze", front: text, back: rule });
          if (!res.error) return res.card;
          break;
        }
        // context too long: cut lines outside the gap from the end (hints are short, usually before a long text)
        let cut = -1;
        for (let i = work.length - 1; i >= 0; i--) if (i !== gi) { cut = i; break; }
        if (cut === -1) break;
        work.splice(cut, 1);
        if (cut < gi) gi--;
      }
    }
    return makeCard({ type: "basic", front: lines.join("\n").slice(0, MAX_FIELD) || "?", back: correct || "—", note: rule }).card;
  }



  function reviewState(interval, due, reps) {
    return { state: "review", step: 0, ease: 2.5, interval: interval, pendingInterval: 0, lapses: 0, reps: reps, due: due };
  }

  /** State of a new entry card: the first review tomorrow (like the old stage 0). */
  function newJournalState(now) { return reviewState(1, dayEnd(now), 0); }


  function ensureMistakesDeck(state) {
    let d = state.userDecks.find(function (x) { return x.id === MISTAKES_DECK; });
    if (!d) {
      d = { id: MISTAKES_DECK, title: "My mistakes", createdAt: new Date(0).toISOString(), system: "mistakes" };
      state.userDecks.push(d);
      if (state.settings.enabledDecks.indexOf(MISTAKES_DECK) === -1) state.settings.enabledDecks.push(MISTAKES_DECK);
    }
    return d;
  }

  function hasJournalCard(state, e) {
    const sid = journalSource(e), id = journalCardId(e);
    return state.userCards.some(function (c) { return c.id === id || c.sourceItemId === sid; });
  }


  /**
   * Merges the state in this browser tab's memory with what is in localStorage (another tab may have saved newer ratings):
   * the card with more reviews (reps) wins, decks and own cards are added, daily counters take the maximum.
   * Changes mem; returns true when something was taken over. Without this a save from an older tab undid ratings (the card came back as new).
   */
  function mergeStates(mem, stored) {
    let changed = false;
    Object.keys(stored.cards || {}).forEach(function (id) {
      const a = mem.cards[id], b = stored.cards[id];
      if ((b.reps || 0) > (a ? (a.reps || 0) : 0)) { mem.cards[id] = b; changed = true; } // a card without reviews (e.g. a suspended new one) is not "newer"
    });
    Object.keys(stored.daily || {}).forEach(function (day) {
      const s = stored.daily[day], m = mem.daily[day] || (mem.daily[day] = { new: 0, reviews: 0, again: 0, good: 0, answers: 0, minutes: 0 });
      ["new", "reviews", "again", "good", "answers", "minutes", "exNew"].forEach(function (k) {
        if ((s[k] || 0) > (m[k] || 0)) { m[k] = s[k]; changed = true; }
      });
    });
    return changed;
  }

  LM.cardsLogic = {
    mergeStates: mergeStates,
    MISTAKES_DECK: MISTAKES_DECK, journalSource: journalSource, journalCardId: journalCardId, journalCard: journalCard,
    newJournalState: newJournalState, ensureMistakesDeck: ensureMistakesDeck,
    hasJournalCard: hasJournalCard,
    gapAnswers: gapAnswers,
    examList: examList, examsOf: examsOf,
    VERSION: VERSION, MAX_FIELD: MAX_FIELD, MAX_IMPORT: MAX_IMPORT, DAY_HOUR: DAY_HOUR, TYPES: TYPES, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalize: normalize, levenshtein: levenshtein, checkAnswer: checkAnswer,
    parseCloze: parseCloze, fromAnki: fromAnki, toAnki: toAnki, answersOf: answersOf, frontText: frontText,
    studyDay: studyDay, dayStart: dayStart, dayEnd: dayEnd, isHidden: isHidden,
    buildQueue: buildQueue, pickNext: pickNext, deckStats: deckStats,
    parseDelimited: parseDelimited, makeCard: makeCard, importCards: importCards, exportTsv: exportTsv,
    WORD_MAX: WORD_MAX, SENTENCE_MAX: SENTENCE_MAX, EXAMPLES_MAX: EXAMPLES_MAX,
    isTarget: isTarget, cardSpeech: cardSpeech, wordFromSelection: wordFromSelection, findWord: findWord, splitSentences: splitSentences,
    extractSentence: extractSentence, makeCloze: makeCloze, wordKey: wordKey, sanitizeWordFields: sanitizeWordFields,
    makeWordCard: makeWordCard, exportWordsCsv: exportWordsCsv,
    emptyState: emptyState, sanitizeState: sanitizeState, pruneDaily: pruneDaily
  };
})(window.LM);
