/*
 * celebrate.js — celebrations ONLY at milestones (DESIGN.md, section 3.3).
 *
 * Milestones (id):
 *   first-known, total-10/25/50/100      — total number of topics marked "I know this"
 *   lvl-a1-25 … lvl-c2-100               — level progress 25/50/75/100%
 *   lvl-a1-passed … lvl-c2-passed        — passed level final test (js/final.js, state from slm.finals)
 *   streak-3/7/14/30                     — streak of study days
 *   first-review                         — first finished review session (event)
 *   level-test                           — finished placement test (event)
 * Each one shows ONCE per profile (slm.celebrated, js/profile-data.js).
 * On the first run for a profile that already has progress, the milestones it already reached
 * are stored without showing them (so no burst of old congratulations).
 *
 * Form: a "toast" card at the bottom of the screen (2.8 s, closed by a click or Esc,
 * does not block the interface, one at a time — a queue). Level milestones show a piece of the trail:
 * the land circle with its symbol and a progress ring animated from the previous to the new value
 * (CSS transition ≤ 600 ms), and for a passed final test a stamp. With
 * prefers-reduced-motion the end state at once (pack v7, C5; confetti removed).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const SHOW_MS = 2800;
  const TOTALS = [1, 10, 25, 50, 100];
  const LEVEL_STEPS = [25, 50, 75, 100];
  const STREAKS = [3, 7, 14, 30];

  const queue = [];
  let showing = null;
  let hideTimer = null;

  function pd() { return LM.profileData; }

  function levelName(id) {
    return LM.syl.landName(id);
  }

  // ---------- Texts (short, concrete, no hype) ----------

  function copy(id, info) {
    if (id === "first-known") return { title: "Your first “I know this”", text: "A good start. Every topic brings you closer to your goal.", icon: "flag" };
    if (/^total-/.test(id)) {
      const n = Number(id.slice(6));
      const text = { 10: "Your first ten are done.", 25: "A quarter of a hundred topics you know.", 50: "Fifty. It is clearly working.", 100: "A hundred. That is a big part of the map." }[n];
      return { title: n + " topics you know", text: text, icon: "sparkles" };
    }
    if (/^lvl-..-passed$/.test(id)) {
      const lvl = id.slice(4, 6).toUpperCase();
      const r = pd().finalResult(lvl);
      return { title: lvl + " passed", text: "Final test passed" + (r ? " (" + r.best.score + "/" + r.best.total + " points)" : "") + ". Your stamp is waiting on the trail.", icon: "award", level: lvl };
    }
    if (/^lvl-/.test(id)) {
      const lvl = id.slice(4, 6).toUpperCase(), step = Number(id.slice(7));
      const name = levelName(lvl);
      if (step === 100) {
        const next = LM.LEVEL_IDS[LM.LEVEL_IDS.indexOf(lvl) + 1];
        return { title: lvl + " complete", text: "You know every topic of " + (name ? lvl + " · " + name : lvl) + "." + (!next ? " This is the end of the trail." : LM.syl.isAvailable(next) ? " Next stop: " + next + "." : " " + next + " is on its way."), icon: "flag", level: lvl };
      }
      const label = { 25: "a quarter of the way", 50: "halfway", 75: "three quarters of the way" }[step];
      return { title: lvl + ": " + label, text: "You know " + step + "% of the topics of " + (name ? lvl + " · " + name : lvl) + ".", icon: "map-pin", level: lvl };
    }
    if (/^streak-/.test(id)) {
      const n = Number(id.slice(7));
      const t = { 3: ["3 days in a row", "A rhythm is starting."], 7: ["A week in a row", "Seven days of study without a break."], 14: ["Two weeks in a row", "Studying has become a habit."], 30: ["30 days in a row", "A month of daily study."] }[n];
      return { title: t[0], text: t[1], icon: "flame" };
    }
    if (id === "first-review") return { title: "Your first review session", text: "Things you review come back and stay longer in memory.", icon: "rotate-ccw" };
    if (id === "level-test") {
      const lvl = info && info.level;
      return { title: "Placement test finished", text: !lvl ? "Your result is below." : LM.syl.isAvailable(lvl) ? "Approximate result: " + lvl + ". This land is a good place to start."
        : "Approximate result: " + lvl + ". " + lvl + " is on its way, so the trail starts at " + LM.syl.startLevelFor(lvl) + ".", icon: "target", level: lvl };
    }
    return null;
  }

  // ---------- What has been reached ----------

  /** Milestones that follow from the state (not from events). */
  function fromState() {
    const ids = [];
    if (!LM.app.getActiveProfile()) return ids;
    const total = LM.app.countDone(LM.state.progress);
    TOTALS.forEach(function (n) { if (total >= n) ids.push(n === 1 ? "first-known" : "total-" + n); });
    LM.LEVEL_IDS.forEach(function (lvl) {
      const s = LM.app.getLevelStats(lvl);
      LEVEL_STEPS.forEach(function (step) { if (s.total && s.percent >= step) ids.push("lvl-" + lvl.toLowerCase() + "-" + step); });
    });
    const streak = LM.learn.streak(pd().activityDays(), LM.learn.today()).current;
    STREAKS.forEach(function (n) { if (streak >= n) ids.push("streak-" + n); });
    // Passed level final tests (pack v6): lvl-<level>-passed
    Object.keys(pd().passedLevels()).forEach(function (lvl) { ids.push("lvl-" + lvl.toLowerCase() + "-passed"); });
    return ids;
  }

  /**
   * Checks the milestones after an event. evt: { event: "review" } or
   * { event: "test", level: "B1" }. New milestones go into the queue.
   */
  function check(evt) {
    if (!LM.app || !LM.app.getActiveProfile() || !pd()) return;
    const known = pd().celebrated();
    const now = fromState();
    if (known === null) {
      // First run for a profile: store what is already there without showing it
      pd().addCelebrated(now);
      if (!evt) return;
    }
    const seen = new Set(pd().celebrated() || []);
    const fresh = now.filter(function (id) { return !seen.has(id); });
    if (evt && evt.event === "review" && !seen.has("first-review")) fresh.push("first-review");
    if (evt && evt.event === "test" && !seen.has("level-test")) fresh.push("level-test");
    if (!fresh.length) return;
    pd().addCelebrated(fresh);
    // When several come at once, show the most important (latest thresholds) — at most 2 in the queue
    const items = fresh.map(function (id) { return { id: id, c: copy(id, evt) }; }).filter(function (x) { return x.c; });
    pickImportant(items).forEach(function (x) { queue.push(x); });
    next();
  }

  /** From several new milestones picks up to 2: the highest threshold of each kind, the more important first. */
  function pickImportant(items) {
    const byKind = {};
    items.forEach(function (x) {
      const kind = /^lvl-..-passed$/.test(x.id) ? "passed" : x.id.replace(/-\d+$/, "").replace(/^lvl-..$/, "lvl").replace(/^first-known$/, "total");
      byKind[kind] = x; // later = higher threshold (order from fromState)
    });
    const order = ["passed", "level-test", "first-review", "lvl", "total", "streak"];
    return Object.keys(byKind).sort(function (a, b) {
      return order.indexOf(a.replace(/^lvl-.*/, "lvl")) - order.indexOf(b.replace(/^lvl-.*/, "lvl"));
    }).map(function (k) { return byKind[k]; }).slice(0, 2);
  }

  // ---------- Card ----------

  function container() {
    let box = document.getElementById("celebrations");
    if (!box) {
      box = el("div", { id: "celebrations", class: "celebrations", role: "status", "aria-live": "polite" });
      document.body.appendChild(box);
    }
    return box;
  }

  function next() {
    if (showing || !queue.length) return;
    show(queue.shift());
  }

  function hide() {
    if (!showing) return;
    clearTimeout(hideTimer);
    const card = showing;
    showing = null;
    document.removeEventListener("keydown", onKey);
    card.classList.add("is-leaving");
    setTimeout(function () { card.remove(); next(); }, LM.reducedMotion() ? 0 : 220);
  }

  function onKey(e) { if (e.key === "Escape") hide(); }

  /** A piece of the trail on the card: the land circle with a ring (from the previous threshold to the new one) and a stamp after the final test. */
  function trailLead(item, level) {
    const passed = /^lvl-..-passed$/.test(item.id);
    const m = /^lvl-..-(\d+)$/.exec(item.id);
    if (!passed && !m) return null;
    const now = LM.app.getLevelStats(level).percent;
    let from = now, to = now;
    if (m) {
      const step = Number(m[1]), at = LEVEL_STEPS.indexOf(step);
      from = at > 0 ? LEVEL_STEPS[at - 1] : 0;
      to = step;
    }
    const reduce = LM.reducedMotion();
    const ring = LM.ui.progressRing(reduce ? to : from, {
      size: 56, stroke: 5, node: LM.ui.landIcon(level, { size: 26 }), label: "Progress in " + level + ": " + to + "%"
    });
    ring.removeAttribute("role");
    ring.setAttribute("aria-hidden", "true");
    // Transition from the previous to the new value (CSS on stroke-dashoffset, ≤ 600 ms)
    if (!reduce && to !== from) setTimeout(function () { LM.ui.setRing(ring, to); }, 250);
    return el("span", { class: "celebration-trail" }, [ring, passed ? LM.ui.stamp(level, { size: 22, fresh: !reduce }) : null]);
  }

  function show(item) {
    const c = item.c;
    const lvlClass = c.level ? " lvl-" + c.level : "";
    const lead = c.level ? trailLead(item, c.level) : null;
    const card = el("div", { class: "celebration" + lvlClass + (c.level ? " has-level" : "") }, [
      lead || el("span", { class: "celebration-icon", "aria-hidden": "true" }, LM.icon(c.icon, { size: 22 })),
      el("div", { class: "celebration-body" }, [
        el("p", { class: "celebration-title", text: c.title }),
        el("p", { class: "celebration-text", text: c.text })
      ]),
      el("button", { type: "button", class: "icon-btn celebration-close", "aria-label": "Close congratulations", onclick: hide }, LM.icon("x", { size: 18 }))
    ]);
    card.addEventListener("click", function (e) { if (!e.target.closest(".celebration-close")) hide(); });
    // Pause while the pointer or focus is on the card
    card.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
    card.addEventListener("mouseleave", function () { hideTimer = setTimeout(hide, 1200); });
    container().appendChild(card);
    showing = card;
    document.addEventListener("keydown", onKey);
    hideTimer = setTimeout(hide, SHOW_MS);
  }

  /**
   * At app start and on a profile change: a profile with no stored milestones
   * gets what it has already reached stored (without showing). A new profile — an empty set.
   */
  function baseline() {
    if (!LM.app || !LM.app.getActiveProfile() || !pd()) return;
    if (pd().celebrated() === null) pd().addCelebrated(fromState());
  }

  LM.celebrate = { check: check, hide: hide, baseline: baseline };
})(window.LM);
