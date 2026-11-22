/*
 * review-queue.js — one review queue: deck flashcards, "My mistakes" and weak spots from exercises
 * (pack v8, spec 20, section R). schedule() from js/cards-schedule.js plans everything.
 *
 *   Pure logic (tests: node tools/tests.js), no DOM and no localStorage:
 *     queueFrom(ctx, now)      → [{ kind: "card"|"mistake"|"exercise", id, due, topic }]
 *                                 overdue oldest first, interleaving (≤ 2 of the same kind and
 *                                 not the same topic twice in a row, when it can be avoided), new ones at the end; limits and the 04:00 day boundary as in flashcards
 *     summaryFrom(ctx, now)    → { card, mistake, exercise, total } — the same numbers without loading the decks
 *     interleave(items)        interleaving
 *     weakTasks(rec, today)    weak-spot candidates from the attempts log
 *     estimateMinutes(b)       card 0.3 · mistake 0.5 · item 0.7 min
 *   ctx = { state: flashcard state, decks: [{ id, count }] (deck order), cardsOf(deckId), deckOf(stateId),
 *           weak: [{ id, topic }] (candidates), topicOfEx?(id), extraNew?: extra new cards over the limit }
 *   Live data: LM.reviewQueue.queue(now) / count() / breakdown() (below, from LM.cards and LM.profileData).
 *   State of a weak-spot item: the key "ex:<item id>" in the flashcards' cards map (rated automatically).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const EX_NEW_PER_DAY = 3;                 // at most this many new weak-spot items a day (within the new limit)
  const MINUTES = { card: 0.3, mistake: 0.5, exercise: 0.7 };
  const MAX_SAME_KIND = 2;
  const WEAK_LIMIT = 60;                    // at most this many weak-spot candidates

  function L() { return LM.cardsLogic; }
  function exKey(itemId) { return "ex:" + itemId; }
  function isEx(id) { return /^ex:/.test(id); }

  function kindOf(id, deckId) {
    if (isEx(id)) return "exercise";
    return deckId === L().MISTAKES_DECK ? "mistake" : "card";
  }

  // =====================================================================
  // WEAK SPOTS: candidate items (from the attempts log)
  // =====================================================================

  /**
   * Items of the weak-spot topics (LM.stats.weakTopics) that were not answered right in the last 14 days
   * (like weakWeight = 2) and were wrong at least once. The latest mistake first.
   * opts.noVoice — no dictation (no voice). → [{ id, topic, type }]
   */
  function weakTasks(rec, today, opts) {
    opts = opts || {};
    const S = LM.stats;
    const topics = {};
    S.weakTopics(rec).forEach(function (t) { topics[t.key] = true; });
    if (!Object.keys(topics).length) return [];
    const weight = S.weakWeight(rec, today);
    const seen = {};
    const wrong = {};
    (rec.items || []).forEach(function (a) {
      if (!a.correct && a.itemId && topics[a.topic] && (!wrong[a.itemId] || a.day > wrong[a.itemId].day)) wrong[a.itemId] = a;
    });
    Object.keys(wrong).forEach(function (id) {
      const a = wrong[id];
      if (weight({ id: id }) !== 2 || (opts.noVoice && a.type === "dictation")) return;
      seen[id] = { id: id, topic: a.topic, type: a.type || null, day: a.day || "" };
    });
    return Object.keys(seen).map(function (k) { return seen[k]; })
      .sort(function (a, b) { return a.day < b.day ? 1 : a.day > b.day ? -1 : a.id < b.id ? -1 : 1; })
      .slice(0, WEAK_LIMIT)
      .map(function (x) { return { id: x.id, topic: x.topic, type: x.type }; });
  }

  // =====================================================================
  // KOLEJKA
  // =====================================================================

  function eligibleDecks(ctx) {
    const on = ctx.state.settings.enabledDecks || [];
    return ctx.decks.filter(function (d) { return on.indexOf(d.id) !== -1 || d.id === L().MISTAKES_DECK; });
  }

  function exAvailable(ctx, today) {
    const have = ctx.state.cards;
    const fresh = (ctx.weak || []).filter(function (w) { return !have[exKey(w.id)]; });
    return { fresh: fresh, cap: Math.max(0, EX_NEW_PER_DAY - ((today && today.exNew) || 0)) };
  }

  function todayOf(ctx, now) {
    return (ctx.state.daily || {})[L().studyDay(now)] || {};
  }

  /**
   * Interleaving: from the rest, take the first element that meets both rules (≤ 2 of the same kind in a row, not the same
   * topic twice in a row); when there is none — one that meets the topic rule, then the kind rule, finally the first one.
   * The input order is a preference (overdue oldest first, new at the end), so later elements come in only when needed.
   */
  function interleave(list) {
    const rest = list.slice(), out = [];
    while (rest.length) {
      const last = out[out.length - 1];
      let run = 0;
      for (let i = out.length - 1; i >= 0 && out[i].kind === (last && last.kind); i--) run++;
      const kindOk = function (it) { return !last || it.kind !== last.kind || run < MAX_SAME_KIND; };
      const topicOk = function (it) { return !last || !it.topic || it.topic !== last.topic; };
      const first = function (pred) { for (let i = 0; i < rest.length; i++) if (pred(rest[i])) return i; return -1; };
      // A topic that fills at least half of the rest must go now (otherwise a block of one topic would stay at the end)
      const counts = {};
      rest.forEach(function (it) { if (it.topic) counts[it.topic] = (counts[it.topic] || 0) + 1; });
      const crowded = Object.keys(counts).find(function (t) { return counts[t] * 2 >= rest.length && (!last || last.topic !== t) && rest.length > 1; });
      let pick = crowded ? first(function (it) { return it.topic === crowded && kindOk(it); }) : -1;
      if (crowded && pick < 0) pick = first(function (it) { return it.topic === crowded; }); // the topic matters more than the kind
      if (pick < 0) pick = first(function (it) { return kindOk(it) && topicOk(it); });
      if (pick < 0) pick = first(topicOk);
      if (pick < 0) pick = first(kindOk);
      if (pick < 0) pick = 0;
      out.push(rest.splice(pick, 1)[0]);
    }
    return out;
  }

  function queueFrom(ctx, now) {
    const st = ctx.state, cards = st.cards;
    const t = todayOf(ctx, now);
    const weakTopic = {};
    (ctx.weak || []).forEach(function (w) { weakTopic[exKey(w.id)] = w.topic; });
    const deckOf = {};
    let pool = [];
    eligibleDecks(ctx).forEach(function (d) {
      (ctx.cardsOf(d.id) || []).forEach(function (c) { deckOf[c.id] = d.id; });
      pool = pool.concat(ctx.cardsOf(d.id) || []);
    });
    // Items: those with a saved state (learning, review) + new ones up to 3 a day, at the end of the pool (new go to the end of the queue)
    Object.keys(cards).forEach(function (id) {
      if (isEx(id)) pool.push({ id: id, deck: "ex", topic: weakTopic[id] || (ctx.topicOfEx && ctx.topicOfEx(id)) || "" });
    });
    // New weak-spot items: up to 3 a day, counted in the new limit (room is reserved before new cards)
    const ex = exAvailable(ctx, t);
    const newLeft = Math.max(0, st.settings.newPerDay - (t.new || 0));
    const exTake = ex.fresh.slice(0, Math.min(ex.cap, newLeft));
    const q = L().buildQueue({ cards: pool, state: cards, now: now,
      settings: Object.assign({}, st.settings, { newPerDay: Math.max(0, st.settings.newPerDay + (ctx.extraNew || 0) - exTake.length) }),
      today: { new: t.new || 0, reviews: t.reviews || 0 } });
    const byId = {};
    pool.forEach(function (c) { byId[c.id] = c; });
    exTake.forEach(function (w) { byId[exKey(w.id)] = { id: exKey(w.id), deck: "ex", topic: w.topic }; });
    const mk = function (id) {
      const c = byId[id] || {};
      return { kind: kindOf(id, c.deck), id: id, due: cards[id] ? cards[id].due : 0, topic: c.topic || c.deck || "" };
    };
    const due = q.learning.concat(q.review).map(mk).sort(function (a, b) { return a.due - b.due; });
    // The whole queue at once: overdue first, new at the end, new come earlier only when the interleaving rules need it
    return interleave(due.concat(q.fresh.concat(exTake.map(function (w) { return exKey(w.id); })).map(mk)));
  }

  /** The same numbers as queueFrom, but without the decks' content (sidebar badge, Today): from the state map and deck sizes. */
  function summaryFrom(ctx, now) {
    const st = ctx.state, cards = st.cards, end = L().dayEnd(now), s = st.settings;
    const t = todayOf(ctx, now);
    const decks = eligibleDecks(ctx);
    const ids = {};
    decks.forEach(function (d) { ids[d.id] = true; });
    const touched = {};
    let learning = [], review = [];
    Object.keys(cards).forEach(function (id) {
      let deck = null;
      if (isEx(id)) deck = "ex";
      else { deck = ctx.deckOf(id); if (!deck || !ids[deck]) return; }
      const x = cards[id];
      touched[deck] = (touched[deck] || 0) + 1;
      if (L().isHidden(x, now) || x.state === "new") return;
      const item = { id: id, kind: kindOf(id, deck), due: x.due };
      if ((x.state === "learning" || x.state === "relearning") && x.due < end) learning.push(item);
      else if (x.state === "review" && x.due < end) review.push(item);
    });
    review.sort(function (a, b) { return a.due - b.due; });
    review = review.slice(0, Math.max(0, s.reviewsPerDay - (t.reviews || 0)));
    // Due and new (fresh) counted apart (spec v7 14, P3); card/mistake/exercise/total are the whole queue of the day as before
    const due = { card: 0, mistake: 0, exercise: 0 }, fresh = { card: 0, mistake: 0, exercise: 0 };
    learning.concat(review).forEach(function (it) { due[it.kind]++; });
    const ex = exAvailable(ctx, t);
    let newLeft = Math.max(0, s.newPerDay - (t.new || 0));
    const exTake = Math.min(ex.fresh.length, ex.cap, newLeft);
    newLeft -= exTake;
    decks.forEach(function (d) {
      const take = Math.min(Math.max(0, d.count - (touched[d.id] || 0)), newLeft);
      fresh[d.id === L().MISTAKES_DECK ? "mistake" : "card"] += take;
      newLeft -= take;
    });
    fresh.exercise += exTake;
    due.total = due.card + due.mistake + due.exercise;
    fresh.total = fresh.card + fresh.mistake + fresh.exercise;
    const out = { card: due.card + fresh.card, mistake: due.mistake + fresh.mistake, exercise: due.exercise + fresh.exercise, due: due, fresh: fresh };
    out.total = due.total + fresh.total;
    return out;
  }

  function estimateMinutes(b) {
    const total = (b.card || 0) * MINUTES.card + (b.mistake || 0) * MINUTES.mistake + (b.exercise || 0) * MINUTES.exercise;
    return total > 0 ? Math.max(1, Math.round(total)) : 0;
  }

  // =====================================================================
  // LIVE DATA (active profile)
  // =====================================================================

  function F() { return LM.cards && LM.cards.internal; }
  function active() { return !!(LM.app && LM.app.getActiveProfile() && F() && LM.profileData); }
  function now() { return Date.now(); }



  function noVoice() { return !!(LM.exercises && LM.exercises.noEnglishVoice && LM.exercises.noEnglishVoice()); }

  function weakNow() {
    return LM.stats && LM.profileData ? weakTasks(LM.profileData.attempts(), LM.learn.today(), { noVoice: noVoice() }) : [];
  }

  function ctxNow() {
    const f = F();
    const weak = weakNow();
    const topics = {};
    weak.forEach(function (w) { topics[exKey(w.id)] = w.topic; });
    return {
      state: f.st(), decks: f.allDecks(), cardsOf: f.cardsOf, weak: weak,
      topicOfEx: function (id) { return topics[id] || ""; },
      deckOf: function (id) {
        if (/^u-/.test(id)) { const c = f.st().userCards.find(function (x) { return x.id === id; }); return c ? c.deck : null; }
        return id.replace(/-\d{3}$/, "");
      }
    };
  }

  const EMPTY = { card: 0, mistake: 0, exercise: 0, total: 0, due: { card: 0, mistake: 0, exercise: 0, total: 0 }, fresh: { card: 0, mistake: 0, exercise: 0, total: 0 } };

  function breakdown() {
    if (!active()) return Object.assign({}, EMPTY);
    return summaryFrom(ctxNow(), now());
  }

  /** The whole queue of the day: due + new up to the limit. */
  function count() { return breakdown().total; }
  /** Only "due" (badge in the panel, header of Review): learning/relearning and review due by today. */
  function dueCount() { return breakdown().due.total; }
  /** New cards and items for today (within the new limit). */
  function freshCount() { return breakdown().fresh.total; }

  /** The full queue (built-in decks must be loaded: LM.cards.internal.loadDecks()). */
  function queue(at) {
    if (!active()) return [];
    return queueFrom(ctxNow(), at || now());
  }

  /**
   * What next when today is done: { next: the nearest due time (ms) after "now" or null, tomorrow: how many items fall due tomorrow
   * (the next study day, 04:00 boundary) }. Cards of the enabled decks, "My mistakes" and items with a saved state.
   */
  function upcomingFrom(ctx, now) {
    const ids = {};
    eligibleDecks(ctx).forEach(function (d) { ids[d.id] = true; });
    const end = L().dayEnd(now);
    let next = null, tomorrow = 0;
    Object.keys(ctx.state.cards).forEach(function (id) {
      const x = ctx.state.cards[id];
      if (x.state === "new" || x.suspended) return;
      if (!isEx(id)) { const deck = ctx.deckOf(id); if (!deck || !ids[deck]) return; }
      const due = Math.max(x.due, x.buriedUntil || 0);
      if (due > now && (next === null || due < next)) next = due;
      if (due >= end && due < end + 86400000) tomorrow++;
    });
    return { next: next, tomorrow: tomorrow };
  }

  function upcoming(at) {
    return active() ? upcomingFrom(ctxNow(), at || now()) : { next: null, tomorrow: 0 };
  }

  /** The nearest due time (ms) after moment t among cards and items with a saved state, or null. */
  function nextDue(t) { return upcoming(t).next; }

  LM.reviewQueue = {
    EX_NEW_PER_DAY: EX_NEW_PER_DAY, MINUTES: MINUTES, exKey: exKey, isEx: isEx, kindOf: kindOf,
    weakTasks: weakTasks, interleave: interleave, queueFrom: queueFrom, summaryFrom: summaryFrom, upcomingFrom: upcomingFrom, upcoming: upcoming,
    estimateMinutes: estimateMinutes, dueCount: dueCount, freshCount: freshCount,
    queue: queue, count: count, breakdown: breakdown, nextDue: nextDue,
    ctx: ctxNow
  };
})(window.LM);
