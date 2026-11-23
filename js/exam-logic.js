/*
 * exam-logic.js — pure exam logic (no DOM; tests in tools/tests.js).
 * Exams are generic: everything exam-specific comes from the registry and the exam config (spec 12).
 *
 *   countWords(text, opening, skip)  word count for the writing trainer:
 *       words are separated by white space; contractions, hyphenated words, numbers, e-mail addresses
 *       and phone numbers = 1 word; emoticons and symbols do not count; neither do the placeholder words
 *       in skip (e.g. a signature placeholder from the exam config) nor the given opening, if the user copied it
 *   writingZone(n, T)             strefa licznika: low (< warnBelow), warn (< min), ok, over (> max)
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

  function countWords(text, opening, skip) {
    let t = String(text || "").replace(/\r\n/g, "\n").trim();
    const open = String(opening || "").trim();
    if (open && t.slice(0, open.length).toLowerCase() === open.toLowerCase()) t = t.slice(open.length);
    return t.split(/\s+/).filter(function (w) {
      if (!w || !HAS_WORD_CHAR.test(w)) return false;                      // emoticons, symbols only
      if (skip && skip.indexOf(w.replace(/[^\p{L}\p{N}]/gu, "")) !== -1) return false; // placeholder words
      return true;
    }).length;
  }

  /** T: { wordRange: [min, max], warnBelow }. */
  function writingZone(n, T) {
    const min = T.wordRange[0], max = T.wordRange[1];
    if (T.warnBelow && n < T.warnBelow) return "low";
    if (n < min) return "warn";
    if (n > max) return "over";
    return "ok";
  }

  /**
   * A8: before which section of a topic page to insert the "In the exam …" boxes. titles = the ## headings in order.
   * The first of: Real life vs exam, Common mistakes, Practice; when there is none — before the answers
   * section; when that is missing too — -1 (at the end of the page).
   */
  function examBoxAnchorIndex(titles) {
    const norm = titles.map(function (s) { return String(s || "").trim().toLowerCase(); });
    const before = ["real life vs exam", String((LM.APP && LM.APP.mistakesHeading) || "Common mistakes").toLowerCase(), "practice"];
    for (let i = 0; i < norm.length; i++) if (before.indexOf(norm[i]) !== -1) return i;
    for (let i = 0; i < norm.length; i++) if (norm[i] === "answers" || norm[i] === "model answers") return i;
    return -1;
  }

  // ---------- B1/B2: dates and "My exams" ----------

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

  function dayNumber(day) {
    const m = DAY.exec(day || "");
    return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null;
  }

  function localToday() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  /** Number of days from today to day ("YYYY-MM-DD"); negative = the date has passed; null for a bad date. */
  function daysBetween(day, today) {
    const a = dayNumber(day), b = dayNumber(today || localToday());
    return a === null || b === null ? null : a - b;
  }

  /** "2027-05-06" → "Thursday, May 6, 2027" (no dependence on the browser's ICU data). */
  function formatDateLong(day) {
    const m = DAY.exec(day || "");
    if (!m) return "";
    const wd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    return WEEKDAYS[wd] + ", " + MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
  }

  /**
   * State for myExams from raw data: input = { registry, examsRecord: { exams: {id: {examDate}}, my }, isSetDone(setId) }.
   * Returns { dates, doneSets, totalSets, my }.
   */
  function examMyState(input) {
    const rec = input.examsRecord || {};
    const out = { dates: {}, doneSets: {}, totalSets: {}, my: (rec.my && typeof rec.my === "object") ? rec.my : {} };
    ((input.registry && input.registry.exams) || []).forEach(function (e) {
      const ids = e.setIds || [];
      out.totalSets[e.id] = ids.length;
      const x = rec.exams && rec.exams[e.id];
      out.dates[e.id] = x && typeof x.examDate === "string" ? x.examDate : "";
      out.doneSets[e.id] = ids.filter(function (id) { return input.isSetDone && input.isSetDone(id); }).length;
    });
    return out;
  }

  /**
   * "My" exams: a date is set or a set is done (and not unpinned by hand), or pinned by hand.
   * state = examMyState(...). Returns [{ id, reason: "date"|"sets"|"pinned", days }] — nearest dates first
   * (today and future, ascending), then past dates (most recent first), last the ones without a date (registry order).
   */
  function myExams(state, registry, today) {
    const out = [];
    ((registry && registry.exams) || []).forEach(function (e, order) {
      if (e.status !== "active") return;
      const flag = state.my && state.my[e.id];
      if (flag === "hidden") return;
      const date = state.dates && state.dates[e.id];
      const days = date ? daysBetween(date, today) : null;
      const done = (state.doneSets && state.doneSets[e.id]) || 0;
      let reason = null;
      if (days !== null) reason = "date";
      else if (done > 0) reason = "sets";
      else if (flag === "pinned") reason = "pinned";
      if (reason) out.push({ id: e.id, reason: reason, days: days, order: order });
    });
    function rank(x) { return x.days === null ? 2 : x.days >= 0 ? 0 : 1; }
    out.sort(function (a, b) {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0 && a.days !== b.days) return a.days - b.days;
      if (ra === 1 && a.days !== b.days) return b.days - a.days;
      return a.order - b.order;
    });
    return out.map(function (x) { return { id: x.id, reason: x.reason, days: x.days }; });
  }

  /**
   * Split of exams in the bar: { shown, hidden } (ids in registry order for hidden, in "my" order for shown).
   * mineIds = ids from myExams; currentId = the exam open on screen (stays in the bar even when it is not "mine").
   * No "my" exams → all of them as before, without "+N".
   */
  function navSplit(registry, mineIds, currentId) {
    const all = ((registry && registry.exams) || []).map(function (e) { return e.id; });
    if (!mineIds || !mineIds.length) return { shown: all, hidden: [] };
    const shown = mineIds.filter(function (id) { return all.indexOf(id) !== -1; });
    if (currentId && all.indexOf(currentId) !== -1 && shown.indexOf(currentId) === -1) shown.push(currentId);
    return { shown: shown, hidden: all.filter(function (id) { return shown.indexOf(id) === -1; }) };
  }

  LM.examLogic = {
    navSplit: navSplit,
    countWords: countWords, writingZone: writingZone, examBoxAnchorIndex: examBoxAnchorIndex,
    daysBetween: daysBetween, formatDateLong: formatDateLong, localToday: localToday, examMyState: examMyState, myExams: myExams
  };
})(window.LM);
