/*
 * exercise-logic.js — pure logic of the exercise engine (no DOM), tested
 * in tools/tests.js. Specification of the reference app: docs/rozbudowa-v2/spec/01-typy-zadan.md
 * and pack v2 spec 02 (the mixed-set algorithm).
 *
 *   match(answer, accepted, opts)     THE answer check for every typed answer (spec 05 §2): { ok, near, closest, index, answered, diff }
 *   nearText(near)                    message before the closest answer: accents / ending / typo
 *   normalize(str)                    LM.lang.normalizeAnswer (short answers, gaps)
 *   shuffle(list, rng)                Fisher–Yates shuffle (a copy of the list)
 *   prepareChoice(item, rng)          multiple-choice options in random order
 *   reorderTokens(item, rng)          words to put in order (never already in the right order)
 *   evaluate(item, answer, opts)      { correct, points, max, near, lenient, … } for every item type; opts.lenientAccents (spec 06 E4)
 *   maxPoints(item)                   maximum points of an item (old types: 1)
 *   sessionScore(results)             session result in points { score, total }
 *   scoreTransformationParts(item, answer, limit)  transformation scored like Cambridge Part 4
 *   normalizeSentence(str)            LM.lang.normalizeSentence (translate, dictation, transformation)
 *   matchesSentence(answer, accepted) whether a sentence matches one of the accepted ones exactly
 *   wordDiff(model, got)              word-by-word comparison (missing / extra / replaced)
 *   prepareMatch(item, rng)           the right column of Match pairs (always shuffled)
 *
 * Types of pack v6 (new item types): gap-fill, match,
 * transformation, translate, dictation. Answers: { texts: […] }, { pairs: { leftIndex: rightText } },
 * { text }, { text }, { text } or { skipped: true } (dictation without a voice).
 *   pickMix(pool, opts, rng)          drawing a mixed set
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const TYPES = ["multiple-choice", "reorder", "find-error", "short-answer", "gap-fill", "match", "transformation", "translate", "dictation"];

  function lang() { return LM.lang; }

  /** Short answers and gaps (LM.lang.normalizeAnswer): case, spaces, apostrophes, final full stop. Keeps diacritics. */
  function normalize(str) { return lang().normalizeAnswer(str); }

  function shuffle(list, rng) {
    const out = list.slice();
    const r = rng || Math.random;
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /** Edit distance (for the "Check the spelling" hint). */
  function distance(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let prev = [];
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  /**
   * Options in random order (unless fixedOrder):
   * [{ text, note, original }], correct = the new index of the right one.
   */
  function prepareChoice(item, rng) {
    const opts = item.options.map(function (text, i) {
      return { text: text, note: item.optionNotes ? item.optionNotes[i] || null : null, original: i };
    });
    const order = item.fixedOrder ? opts : shuffle(opts, rng);
    return { options: order, correct: order.findIndex(function (o) { return o.original === item.correct; }) };
  }

  /** Words of the model sentence without the punctuation around it (the first word in lower case, so it does not give the start away). */
  function answerTokens(sentence) {
    const words = String(sentence).trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").split(/\s+/).filter(Boolean);
    if (words.length) words[0] = words[0].charAt(0).toLowerCase() + words[0].slice(1);
    return words;
  }

  /**
   * Pool of words to put in order: [{ id, text }] from answers[0] + extraTokens, shuffled so that
   * it is NOT the right sentence straight away.
   */
  function reorderTokens(item, rng) {
    const words = answerTokens(item.answers[0]).concat(item.extraTokens || []);
    const tokens = words.map(function (text, i) { return { id: "t" + i, text: text }; });
    if (tokens.length < 2) return tokens;
    let out = shuffle(tokens, rng);
    for (let tries = 0; tries < 20 && isAccepted(item, out.map(function (t) { return t.text; })); tries++) out = shuffle(tokens, rng);
    if (isAccepted(item, out.map(function (t) { return t.text; }))) out.push(out.shift()); // last resort
    return out;
  }

  function isAccepted(item, words) {
    const s = lang().normalizeSentence(words.join(" "));
    return !!s && item.answers.some(function (a) { return lang().normalizeSentence(a) === s; });
  }

  /** Index of the first word of the answer that differs from the model (or -1). */
  function firstDifference(item, words) {
    const model = answerTokens(item.answers[0]).map(lang().normalizeSentence);
    const got = words.map(lang().normalizeSentence);
    for (let i = 0; i < Math.max(model.length, got.length); i++) {
      if (model[i] !== got[i]) return i;
    }
    return -1;
  }

  /**
   * Evaluates an answer. The answer depends on the type:
   *   multiple-choice: { chosen: index in the ORIGINAL options }
   *   reorder:         { words: [text…] }
   *   find-error:      { noError: true } or { range: [from, to], fix: "…" }
   *   short-answer:    { text: "…" }
   * opts.lenientAccents: an answer that differs only in accents counts as correct (lenient: true; the reminder stays: near "accents").
   */
  function evaluate(item, answer, opts) {
    const res = evaluateType(item, answer || {}, opts || {});
    // Points (spec v6 12, section 1): one-point types — 1 for a right item
    if (res.max === undefined) { res.max = maxPoints(item); res.points = res.correct ? res.max : 0; }
    return res;
  }

  /** Maximum points of an item: gaps and pairs — a point each, transformation with parts — 2, others — 1. */
  function maxPoints(item) {
    if (item.type === "gap-fill") return (item.gaps || []).length || 1;
    if (item.type === "match") return (item.pairs || []).length || 1;
    if (item.type === "transformation") return item.parts ? 2 : 1;
    return 1;
  }

  /**
   * Session result in points: results = [{ item, res }] (res = null → item without an answer, 0 of maxPoints).
   * An item with res.max = 0 (e.g. a dictation skipped without a voice) does not count.
   */
  function sessionScore(results) {
    let score = 0, total = 0;
    results.forEach(function (r) {
      if (r.res) { score += r.res.points || 0; total += r.res.max; }
      else total += maxPoints(r.item);
    });
    return { score: score, total: total };
  }

  function evaluateType(item, answer, opts) {
    if (item.type === "multiple-choice") {
      return { correct: answer.chosen === item.correct, answered: Number.isInteger(answer.chosen) };
    }
    if (item.type === "reorder") {
      const words = answer.words || [];
      const ok = words.length > 0 && isAccepted(item, words);
      return { correct: ok, answered: words.length > 0, diffAt: ok ? -1 : firstDifference(item, words) };
    }
    if (item.type === "find-error") {
      if (answer.noError) return { correct: !!item.noError, answered: true, rangeOk: !!item.noError, fixOk: !!item.noError };
      const r = answer.range;
      if (!r) return { correct: false, answered: false, rangeOk: false, fixOk: false };
      if (item.noError) return { correct: false, answered: true, rangeOk: false, fixOk: false };
      const rangeOk = r[0] === item.errorRange[0] && r[1] === item.errorRange[1];
      const fix = shortAnswer(item.fixes, answer.fix, opts);
      const out = { correct: rangeOk && fix.correct, answered: true, rangeOk: rangeOk, fixOk: fix.correct };
      if (rangeOk) { out.near = fix.near; out.closest = fix.closest; out.lenient = fix.lenient; }
      return out;
    }
    if (item.type === "short-answer") return shortAnswer(item.accepted, answer.text, opts);
    if (item.type === "gap-fill") {
      const texts = answer.texts || [];
      const gaps = item.gaps.map(function (g, i) { return shortAnswer(g.accepted, texts[i], opts); });
      const points = gaps.filter(function (g) { return g.correct; }).length;
      return { correct: points === gaps.length, answered: gaps.some(function (g) { return g.answered; }), points: points, max: gaps.length, gaps: gaps,
        lenient: gaps.some(function (g) { return g.lenient; }) };
    }
    if (item.type === "match") {
      const chosen = answer.pairs || {};
      const pairs = item.pairs.map(function (pair, i) { return chosen[i] != null && chosen[i] === pair[1]; });
      const points = pairs.filter(Boolean).length;
      return { correct: points === pairs.length, answered: Object.keys(chosen).some(function (k) { return chosen[k] != null; }), points: points, max: pairs.length, pairs: pairs };
    }
    if (item.type === "transformation") return evaluateTransformation(item, answer.text, opts);
    if (item.type === "translate") return evaluateSentence(item.accepted, answer.text, opts);
    if (item.type === "dictation") {
      // No voice: the item is skipped and counts neither in the result nor in the stats
      if (answer.skipped) return { correct: false, answered: true, skipped: true, points: 0, max: 0 };
      return evaluateSentence([item.text].concat(item.accepted || []), answer.text, opts);
    }
    return { correct: false, answered: false };
  }

  /** Whether a match result counts: exact, or accents only with the lenient preference. */
  function accepts(m, opts) { return m.ok || (!!(opts && opts.lenientAccents) && m.near === "accents"); }

  /** One field (short-answer, a gap, the fix of find-error): match + scoring; near and closest feed the hint. */
  function shortAnswer(accepted, value, opts) {
    const m = match(value, accepted || [], {});
    const correct = m.answered && accepts(m, opts);
    return { correct: correct, answered: m.answered, near: m.ok ? null : m.near, closest: m.closest, lenient: correct && !m.ok };
  }

  // =====================================================================
  // ANSWER CHECK (spec 05 §2): one algorithm for every typed answer, in exercises and flashcards
  // =====================================================================

  const NEAR_TEXT = {
    accents: "Almost. Check the accents: ",
    ending: "Right word, wrong ending: ",
    typo: "Looks like a typo: "
  };

  /** Message shown before the closest answer (in bold) for a near miss, or "". */
  function nearText(near) { return NEAR_TEXT[near] || ""; }

  /** Typo budget by the length of the accepted word: 1 edit from 5 letters, 2 from 9. */
  function typoBudget(len) { return len >= 9 ? 2 : len >= 5 ? 1 : 0; }

  /** Only the ending differs: the first 60% of the letters of the accepted word (at least 3) are the same. */
  function endingOnly(got, want) {
    if (got === want) return false;
    const n = Math.max(3, Math.ceil(want.length * 0.6));
    return got.length >= n && want.length >= n && got.slice(0, n) === want.slice(0, n);
  }

  /** Normalized forms of a text with all its variants (LM.lang.variants), no empty or repeated ones. */
  function forms(text, sentence) {
    const N = sentence ? lang().normalizeSentence : lang().normalizeAnswer;
    const out = [];
    lang().variants(String(text == null ? "" : text)).forEach(function (v) { const n = N(v); if (n && out.indexOf(n) === -1) out.push(n); });
    return out;
  }

  /**
   * match(answer, accepted[], { sentence }) → { ok, near, closest, index, answered, diff }
   *   1. normalized (with variants) equal → ok;   2. equal without marks (LM.lang.stripMarks) → near "accents";
   *   3. one word, only the ending differs → "ending";   4. edit distance ≤ 1 (5+ letters) / ≤ 2 (9+) → "typo"
   *      (sentences: exactly one word replaced, and it is a typo of the accepted word);
   *   5. otherwise near null; for sentences diff = word-by-word comparison with the closest accepted variant.
   * closest — the accepted answer as written (for the message), index — its position in accepted.
   * Capital letters never matter. near never makes an answer correct: evaluate / checkAnswer apply the lenient preference.
   */
  function match(answer, accepted, opts) {
    opts = opts || {};
    const S = lang().stripMarks;
    const list = (accepted || []).map(function (a, k) { return { k: k, text: String(a == null ? "" : a), vs: forms(a, opts.sentence) }; })
      .filter(function (a) { return a.vs.length; });
    const mine = forms(answer, opts.sentence);
    const res = { ok: false, near: null, closest: list.length ? list[0].text : "", index: list.length ? list[0].k : 0, answered: mine.length > 0, diff: null };
    if (!mine.length || !list.length) return res;
    const hit = function (near, test) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].vs.some(function (v) { return mine.some(function (m) { return test(m, v); }); })) {
          res.closest = list[i].text; res.index = list[i].k; res.near = near; res.ok = near === null;
          return true;
        }
      }
      return false;
    };
    if (hit(null, function (m, v) { return m === v; })) return res;
    if (hit("accents", function (m, v) { return S(m) === S(v); })) return res;
    if (hit("ending", function (m, v) { return m.indexOf(" ") === -1 && v.indexOf(" ") === -1 && endingOnly(S(m), S(v)); })) return res;
    const typo = opts.sentence
      ? function (m, v) {
        const changed = wordDiff(v.split(" "), m.split(" ")).ops.filter(function (o) { return o.op !== "same"; });
        return changed.length === 1 && changed[0].op === "replace" && distance(changed[0].got, changed[0].word) <= typoBudget(changed[0].word.length);
      }
      : function (m, v) { const b = typoBudget(v.length); return b > 0 && distance(m, v) <= b; };
    if (hit("typo", typo)) return res;
    if (opts.sentence) {
      const best = closestDiff(mine, list);
      if (best) { res.diff = best.diff.ops; res.index = best.index; res.closest = best.text; }
    }
    return res;
  }

  /** Normalized sentence (LM.lang.normalizeSentence). */
  function normalizeSentence(str) { return lang().normalizeSentence(str); }

  /** All normalized readings of a sentence (LM.lang.variants). */
  function sentenceVariants(str) { return forms(str, true); }

  /** Whether a sentence matches one of the accepted ones exactly (after normalization and variants). */
  function matchesSentence(answer, accepted) { return match(answer, accepted, { sentence: true }).ok; }

  /**
   * Word-by-word comparison (edit distance on words):
   * [{ op: "same" | "missing" | "extra" | "replace", word (model), got (answer) }].
   */
  function wordDiff(model, got) {
    const m = model.length, n = got.length;
    const d = [];
    for (let i = 0; i <= m; i++) { d.push([i]); for (let j = 1; j <= n; j++) d[i][j] = i ? 0 : j; }
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (model[i - 1] === got[j - 1] ? 0 : 1));
      }
    }
    const ops = [];
    let i = m, j = n;
    // On a tie: matching words first, then missing / extra (more words stay "in place"), replacement last
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && model[i - 1] === got[j - 1] && d[i][j] === d[i - 1][j - 1]) {
        ops.unshift({ op: "same", word: model[i - 1] });
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        ops.unshift({ op: "missing", word: model[i - 1] });
        i--;
      } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) {
        ops.unshift({ op: "extra", got: got[j - 1] });
        j--;
      } else {
        ops.unshift({ op: "replace", word: model[i - 1], got: got[j - 1] });
        i--; j--;
      }
    }
    return { distance: d[m][n], ops: ops };
  }

  /** The nearest accepted variant (fewest word changes) and the comparison with it: { index, text, diff }. */
  function closestDiff(mine, list) {
    let best = null;
    list.forEach(function (a) {
      a.vs.forEach(function (v) {
        const model = v.split(" ").filter(Boolean);
        mine.forEach(function (m) {
          const diff = wordDiff(model, m.split(" ").filter(Boolean));
          if (!best || diff.distance < best.diff.distance) best = { index: a.k, text: a.text, diff: diff };
        });
      });
    });
    return best;
  }

  /** translate / dictation: 1 point for a match (or accents only, in lenient mode); otherwise a near hint and the word-by-word comparison. */
  function evaluateSentence(accepted, text, opts) {
    const m = match(text, accepted, { sentence: true });
    if (!m.answered) return { correct: false, answered: false, points: 0, max: 1, diff: null, closest: 0, near: null };
    if (accepts(m, opts)) return { correct: true, answered: true, points: 1, max: 1, closest: m.index, near: m.ok ? null : m.near, lenient: !m.ok };
    let diff = m.diff;
    if (!diff) {
      const best = closestDiff(forms(text, true), [{ k: m.index, text: m.closest, vs: forms(m.closest, true) }]);
      diff = best ? best.diff.ops : null;
    }
    return { correct: false, answered: true, points: 0, max: 1, diff: diff, closest: m.index, near: m.near };
  }

  /** Number of words in a transformation and the reason it is refused before scoring (limit, key word), or null. */
  function transformationCheck(item, text, lim) {
    const t = trTokens(text);
    if (!t.length) return { words: 0, msg: "No answer." };
    if (t.length < lim[0] || t.length > lim[1]) return { words: t.length, msg: "Use " + lim[0] + "–" + lim[1] + " words (you have " + plural(t.length, "word") + ")." };
    if (!findSeq(t, trTokens(item.keyword), 0).length) return { words: t.length, msg: "Use the key word without changing it (" + item.keyword + ")." };
    return { words: t.length, msg: null };
  }

  /** Word limit of a transformation item: wordLimit or 2–5 (B1–B2). */
  function transformationLimit(item) {
    const w = item.wordLimit;
    return Array.isArray(w) && w.length === 2 && w[0] >= 1 && w[0] <= w[1] ? w : [2, 5];
  }

  /**
   * transformation: without parts — 1 point for matching the answers (match in sentence mode; accents only in lenient mode);
   * with parts — 2 points like Cambridge (scoreTransformationParts), a full match with the answers is always 2.
   */
  function evaluateTransformation(item, text, opts) {
    const lim = transformationLimit(item);
    const max = item.parts ? 2 : 1;
    const check = transformationCheck(item, text, lim);
    const answered = check.words > 0;
    if (check.msg) return { correct: false, answered: answered, points: 0, max: max, msg: check.msg, parts: item.parts ? item.parts.map(function () { return false; }) : null };
    const m = match(text, item.answers, { sentence: true });
    if (accepts(m, opts)) return { correct: true, answered: true, points: max, max: max, msg: null, near: m.ok ? null : m.near, closest: m.closest, lenient: !m.ok, parts: item.parts ? item.parts.map(function () { return true; }) : null };
    const near = m.near ? { near: m.near, closest: m.closest } : {};
    if (!item.parts) return Object.assign({ correct: false, answered: true, points: 0, max: 1, msg: null, parts: null }, near);
    const r = scoreTransformationParts(item, text, lim);
    return Object.assign({ correct: r.score === 2, answered: true, points: r.score, max: 2, msg: r.msg, parts: r.parts }, near);
  }

  /**
   * Right column of Match pairs: [{ id, text }] (pairs + extraRight), always shuffled —
   * never in the order of the pairs in the file.
   */
  function prepareMatch(item, rng) {
    const right = item.pairs.map(function (p, i) { return { id: "r" + i, text: p[1] }; })
      .concat((item.extraRight || []).map(function (t, i) { return { id: "x" + i, text: t }; }));
    const inOrder = function (list) { return item.pairs.every(function (p, i) { return list[i].text === p[1]; }); };
    let out = shuffle(right, rng);
    for (let tries = 0; tries < 20 && inOrder(out); tries++) out = shuffle(right, rng);
    if (inOrder(out)) out.push(out.shift());
    return out;
  }

  // =====================================================================
  // SENTENCE TRANSFORMATION (shared by the "transformation" type)
  // =====================================================================

  function plural(n, one, other) { return LM.plural ? LM.plural(n, one, other) : n + " " + (n === 1 ? one : other || one + "s"); }

  /** Upper case, ’ → ', no punctuation (except the apostrophe and an inner hyphen), single spaces. */
  function trNorm(text) {
    return String(text || "")
      .toUpperCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/[^\p{L}\p{N}'\s-]/gu, "")
      .replace(/(^|\s)-+|-+(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Words of a transformation answer (upper case; every space-separated word counts once). */
  function trTokens(text) {
    return trNorm(text).split(" ").filter(Boolean);
  }

  /** Positions where the sequence "needle" occurs in "hay" (from index from). */
  function findSeq(hay, needle, from) {
    const hits = [];
    if (!needle.length) return hits;
    for (let i = from || 0; i + needle.length <= hay.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (hay[i + j] !== needle[j]) { ok = false; break; }
      }
      if (ok) hits.push(i);
    }
    return hits;
  }

  const TR_DEFAULT_LIMIT = [3, 6]; // Cambridge C1

  /**
   * Transformation like Cambridge Part 4: number of words within the limit (limit = [min, max], default 3–6),
   * the key word unchanged, 1 point for each part (item.parts = [[variants]…]); the next part counts
   * when it comes AFTER the previous one. An item with one part: 2 points or 0.
   * Returns { score, parts: [true/false…], msg } (msg — the reason for 0 points before scoring the parts, or null).
   */
  function scoreTransformationParts(item, answer, limit) {
    const lim = Array.isArray(limit) ? limit : TR_DEFAULT_LIMIT;
    const t = trTokens(answer);
    const parts = item.parts.map(function () { return false; });
    if (!t.length) return { score: 0, parts: parts, msg: "No answer." };
    if (t.length < lim[0] || t.length > lim[1]) {
      return { score: 0, parts: parts, msg: "Use " + lim[0] + "–" + lim[1] + " words (you have " + plural(t.length, "word") + ")." };
    }
    if (!findSeq(t, trTokens(item.keyword), 0).length) {
      return { score: 0, parts: parts, msg: "Use the key word without changing it (" + item.keyword + ")." };
    }
    let cursor = 0;
    item.parts.forEach(function (variants, k) {
      let bestEnd = -1;
      variants.forEach(function (variant) {
        const v = trTokens(variant);
        const starts = findSeq(t, v, cursor);
        if (starts.length) {
          const end = starts[0] + v.length;
          if (bestEnd === -1 || end < bestEnd) bestEnd = end;
        }
      });
      if (bestEnd !== -1) { parts[k] = true; cursor = bestEnd; }
    });
    const max = item.parts.length === 1 ? 2 : item.parts.length;
    const score = parts.filter(Boolean).length * (max / item.parts.length);
    return { score: score, parts: parts, msg: null };
  }

  /**
   * Mixed set (spec 02, B.3).
   * pool: items (with a topic field); opts: { count, exclude: [id…], types: [type…], weight: fn(item) → weight }.
   * Weights (e.g. LM.stats.mixWeight) raise the chance of drawing weak / unseen items within a topic.
   * 1. filter by type, 2. leave out the last session (when the pool is big enough),
   * 3. round-robin over topics (random inside a topic), 4. order: at most 2 items of the same type in a row.
   * Returns { items, requested, available }.
   */
  function pickMix(pool, opts, rng) {
    opts = opts || {};
    const r = rng || Math.random;
    let items = pool.filter(function (it) { return !opts.types || !opts.types.length || opts.types.indexOf(it.type) !== -1; });
    const available = items.length;
    const count = Math.min(opts.count || 10, available);
    const exclude = new Set(opts.exclude || []);
    const fresh = items.filter(function (it) { return !exclude.has(it.id); });
    if (fresh.length >= count) items = fresh;

    const byTopic = {};
    const topicOrder = [];
    (opts.weight ? weightedOrder(items, opts.weight, r) : shuffle(items, r)).forEach(function (it) {
      const t = it.topic || "";
      if (!byTopic[t]) { byTopic[t] = []; topicOrder.push(t); }
      byTopic[t].push(it);
    });
    const picked = [];
    let round = 0;
    while (picked.length < count) {
      let any = false;
      topicOrder.forEach(function (t) {
        if (picked.length < count && byTopic[t][round]) { picked.push(byTopic[t][round]); any = true; }
      });
      if (!any) break;
      round++;
    }
    return { items: limitRuns(shuffle(picked, r), 2), requested: opts.count || 10, available: available };
  }

  /**
   * Weighted random order (Efraimidis–Spirakis): an element with weight 2 has twice
   * the chance to come first of an element with weight 1. Without weights = a plain shuffle.
   */
  function weightedOrder(list, weight, rng) {
    const r = rng || Math.random;
    return list.map(function (it) {
      const w = Math.max(0.01, Number(weight(it)) || 1);
      return { it: it, key: Math.pow(r() || 1e-9, 1 / w) };
    }).sort(function (a, b) { return b.key - a.key; }).map(function (x) { return x.it; });
  }

  /** Reorders the items so the same type does not appear more than max times in a row (when possible). */
  function limitRuns(list, max) {
    const out = list.slice();
    for (let i = max; i < out.length; i++) {
      let run = true;
      for (let k = 1; k <= max; k++) if (out[i - k].type !== out[i].type) run = false;
      if (!run) continue;
      const j = out.findIndex(function (x, idx) { return idx > i && x.type !== out[i].type; });
      if (j === -1) break;
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /**
   * The "set 8/10" label on the level page (pack v8, S4): from the best results of the topic's sets
   * ([{ score, total }]) picks the set with the highest percentage (tie: more points). → { score, total, high, text } or null.
   * high = result ≥ 80% (a dot in the land colour).
   */
  function bestSetLabel(bests) {
    let top = null;
    (bests || []).forEach(function (b) {
      if (!b || !(b.total > 0) || !(b.score >= 0)) return;
      const pct = b.score / b.total;
      if (!top || pct > top.pct || (pct === top.pct && b.total > top.total)) top = { score: b.score, total: b.total, pct: pct };
    });
    return top ? { score: top.score, total: top.total, high: top.pct >= 0.8, text: "set " + top.score + "/" + top.total } : null;
  }

  /** A speaker label at the start of a script line ("A:", "Speaker 2:", a name with diacritics); any capital letter. */
  const SPEAKER = /^(\p{Lu}[\p{L}\p{N}]*(?: [\p{Lu}\p{N}][\p{L}\p{N}]*)?):\s*/u;

  /**
   * Sentence for playback with the S key (pack v8, S5): before checking a gap is a pause (" … "), after checking — the model answer.
   * Returns the text or "" (a type without a sentence to read: Match pairs, dictation, Put in order before checking).
   */
  function speechText(item, answered) {
    const PAUSE = " … ";
    const tidy = function (t) { return String(t).replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim(); };
    const lines = function (t) { return String(t || "").split("\n").map(function (l) { return l.replace(SPEAKER, ""); }).join(" "); };
    if (!item) return "";
    switch (item.type) {
      case "multiple-choice": {
        const gap = /_{2,}/;
        const text = lines(item.prompt);
        if (!gap.test(text)) return tidy(text);
        return tidy(text.replace(gap, answered ? item.options[item.correct] : PAUSE));
      }
      case "short-answer":
        return tidy(lines(item.prompt).replace(/_{2,}/, answered ? item.accepted[0] : PAUSE));
      case "gap-fill":
        return tidy(String(item.text).replace(/\{\{(\d+)\}\}/g, function (m, n) {
          const g = item.gaps[Number(n) - 1];
          return answered && g ? g.accepted[0] : PAUSE;
        }));
      case "transformation":
        return tidy([item.before, answered ? item.answers[0] : PAUSE, item.after].filter(Boolean).join(" "));
      case "reorder":
        return answered ? tidy(item.answers[0]) : "";
      case "translate":
        return answered ? tidy(item.accepted[0]) : "";
      case "find-error":
        return tidy((item.tokens || []).join(" "));
      default:
        return "";
    }
  }

  LM.exLogic = {
    speechText: speechText,
    bestSetLabel: bestSetLabel,
    TYPES: TYPES,
    SPEAKER: SPEAKER,
    match: match,
    nearText: nearText,
    normalize: normalize,
    shuffle: shuffle,
    distance: distance,
    prepareChoice: prepareChoice,
    answerTokens: answerTokens,
    reorderTokens: reorderTokens,
    firstDifference: firstDifference,
    evaluate: evaluate,
    maxPoints: maxPoints,
    sessionScore: sessionScore,
    plural: plural,
    trTokens: trTokens,
    findSeq: findSeq,
    scoreTransformationParts: scoreTransformationParts,
    transformationLimit: transformationLimit,
    normalizeSentence: normalizeSentence,
    sentenceVariants: sentenceVariants,
    matchesSentence: matchesSentence,
    wordDiff: wordDiff,
    prepareMatch: prepareMatch,
    pickMix: pickMix,
    weightedOrder: weightedOrder,
    limitRuns: limitRuns
  };
})(window.LM);
