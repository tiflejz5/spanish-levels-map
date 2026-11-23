/*
 * today.js — the "Today" page (#/today) as a dashboard (bento layout, DESIGN.md section 3.2):
 *   the map card (greeting, "Map covered" bar, the trail, one suggestion), reviews,
 *   streak (flame + last 7 days), my nearest exam (when a date is set),
 *   the A1→C2 trail (SVG with station links and a "You are here" marker),
 *   shortcuts.
 *
 * Animations (js/motion.js, GSAP on demand): tiles one by one, numbers from zero,
 * the trail path "draws itself" (DrawSVG), the marker travels to its station
 * (MotionPath). On later visits only a short refresh. With
 * prefers-reduced-motion — the end state at once.
 *
 * The streak is computed from the profile's list of activity days (LM.learn.streak).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const HASH = "#/today";

  let visitedThisSession = false; // full animation only on the first visit
  let trailObserver = null;

  function pd() { return LM.profileData; }
  function plural(n, one, other) { return LM.plural(n, one, other); }

  function parseRoute(hash) {
    return /^#\/today\/?$/.test(hash || "") ? { kind: "today" } : null;
  }

  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    return n;
  }

  function dateOf(day) {
    return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), 12);
  }

  /** A number that counts up from zero on entry (js/motion.js reads data-count). */
  function bigNumber(value, cls) {
    return el("span", { class: "num today-number" + (cls ? " " + cls : ""), "data-count": String(value), text: String(value) });
  }

  function tile(cls, label, children) {
    return el("section", { class: "card bento-tile " + cls, "aria-label": label }, children);
  }

  // =====================================================================
  // STATE: progress, the "you are here" station, the suggestion
  // =====================================================================

  /**
   * State of the lands on the map. Land progress = passed trail stops / all stops (spec v7 13, 3.3: the trail on the map,
   * the "I know this" checklist on the level page). Without trail data: topics marked "I know this". skipped: a land before the start.
   */
  function levelStats() {
    return LM.LEVEL_IDS.map(function (id) {
      const s = Object.assign({ id: id, soon: !LM.syl.isAvailable(id) }, LM.app.getLevelStats(id));
      const li = LM.trail && LM.trail.ready() ? LM.trail.levelInfo(id) : null;
      return li ? Object.assign(s, { done: li.done, total: li.total, percent: li.percent, skipped: li.skipped, trail: true }) : s;
    });
  }

  /** The first station below 100% (when everything is done — the last one). */
  function currentIndex(stats) {
    const sz = LM.trail && LM.trail.ready() ? LM.trail.current() : null; // trail: the land of the current stop (after a C1 placement result = C1)
    if (sz) { const k = stats.findIndex(function (s) { return s.id === sz.level && !s.soon; }); if (k !== -1) return k; }
    // "soon" levels never become the current land (spec 06 E1)
    const i = stats.findIndex(function (s) { return !s.soon && s.total && s.percent < 100; });
    if (i !== -1) return i;
    let last = 0;
    stats.forEach(function (s, k) { if (!s.soon) last = k; });
    return last;
  }

  function levelName(id) {
    return LM.syl.landName(id);
  }

  /** Next unticked topic of a level (its page when it exists). */
  function nextItem(levelId) {
    const t = LM.syl.topics(levelId).find(function (x) { return LM.state.progress[x.id] !== true; });
    return t ? { text: LM.handbook.titleOf(t), href: LM.handbook.routeOf(t) } : null;
  }

  function greetingWord() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 18) return "Good afternoon";
    return "Good evening";
  }


  /** Description of the "Map covered" bar for screen readers: "Map covered: 41%. A1 100%, A2 100%, …". */
  function mapSummary(mp) {
    return "Map covered: " + mp.percent + "%. " + mp.segments.map(function (s) { return s.id + " " + Math.round(s.percent) + "%"; }).join(", ") + ".";
  }

  /**
   * Footer of the map card: "Next stop in A1 · Meadow: gustar · 16 stops left in this land" and a button.
   * Level done: "Take the B1 final test" (when not passed) or "Start A2".
   */
  function mapFooter(stats) {
    const idx = currentIndex(stats);
    const cur = stats[idx];
    const remaining = cur.total - cur.done;
    const sz = LM.trail && LM.trail.ready() ? LM.trail.current() : null;
    const next = sz ? { text: sz.node.stop.title, href: LM.trail.HASH + "/" + sz.node.id } : (cur.percent < 100 ? nextItem(cur.id) : null);
    const ready = LM.final ? LM.final.readyLevel(stats) : null;
    let text, cta = null, extra = null;
    if (next) {
      text = ["Next stop in " + LM.ui.landLabel(cur.id) + ": ", el("strong", { text: next.text }), " · " + (sz ? plural(remaining, "stop") : plural(remaining, "topic")) + " left in this land"];
      cta = { href: next.href, label: "Continue the trail" };
      if (ready) extra = ready;
    } else {
      const passed = pd().passedLevels()[cur.id];
      const following = LM.LEVEL_IDS[idx + 1];
      if (!passed && LM.final) {
        text = ["You know every topic of " + cur.id + ". Time for the level final test."];
        cta = { href: LM.final.testHash(cur.id), label: "Take the " + cur.id + " final test" };
      } else if (following) {
        text = [cur.id + " is done. Next: ", el("strong", { text: LM.ui.landLabel(following) }), "."];
        cta = { href: LM.app.levelHash(following), label: "Start " + following };
      } else {
        text = ["The whole map is covered. Reviews and practice keep you in shape."];
      }
    }
    return el("footer", { class: "map-foot" }, [
      el("div", { class: "map-foot-text" }, [
        el("p", { class: "map-next" }, text),
        sz ? el("p", { class: "map-unit num" }, "Unit " + sz.unit.index + " · " + sz.unit.title + " · " + sz.unit.done + "/" + sz.unit.total) : null,
        extra ? el("a", { class: "btn-link map-ready", href: LM.final.testHash(extra.id) }, "Ready for the " + extra.id + " final test? Take the test") : null
      ]),
      cta ? el("a", { class: "btn btn-secondary map-cta", href: cta.href }, [cta.label, LM.icon("chevron-right", { size: 18 })]) : null
    ]);
  }

  /**
   * Map card (replaces the hero and a separate trail): date and land, greeting, "Map covered" with a bar of the levels,
   * the topographic trail in the middle, a footer with the next stop. Returns the element; ._stage holds the trail.
   */
  function mapCard(stats) {
    const p = LM.app.getActiveProfile();
    const d = dateOf(learn().today());
    const cur = stats[currentIndex(stats)];
    const mp = learn().mapProgress(stats.filter(function (s) { return !s.soon; })); // available levels only (spec 06 E1)
    const stage = el("div", { class: "trail-stage" });
    const card = el("section", { class: "card bento-tile map-card", "aria-labelledby": "today-title" }, [
      el("div", { class: "map-top" }, [
        el("div", { class: "map-hello" }, [
          el("p", { class: "today-date" }, [LM.fmt.weekday(d) + ", " + LM.fmt.dayMonth(d) + " · land ", el("strong", { class: "map-land lvl-" + cur.id, text: LM.ui.landLabel(cur.id) })]),
          el("h1", { class: "hero-title", id: "today-title", text: greetingWord() + (p ? ", " + p.name : "") })
        ]),
        el("div", { class: "map-progress" }, [
          el("div", { class: "map-progress-row" }, [el("span", { class: "map-progress-label", text: "Map covered" }), el("span", { class: "map-progress-pct num", text: mp.percent + "%" })]),
          el("div", { class: "map-segments", role: "img", "aria-label": mapSummary(mp) }, mp.segments.map(function (seg) {
            return el("span", { class: "map-seg lvl-" + seg.id, "aria-hidden": "true" }, el("span", { class: "map-seg-fill", style: "width:" + seg.percent + "%" }));
          }))
        ])
      ]),
      stage,
      mapFooter(stats)
    ]);
    card._stage = stage;
    return card;
  }

  // =====================================================================
  // TILES
  // =====================================================================

  function streakMessage(s) {
    if (s.activeToday) return s.current > 1 ? "Today counts. The streak grows." : "Today counts.";
    if (s.current > 0) return "Streak continues. One short activity today keeps it going.";
    return "Every day with one activity counts: “I know this”, an exercise or a review.";
  }

  /** Streak: "Streak · 6 days", a caption and 7 dots for the last days (with descriptions for screen readers). */
  function streakTile() {
    const today = learn().today();
    const days = pd().activityDays();
    const s = learn().streak(days, today);
    const week = learn().lastDays(days, today, 7);
    return el("section", { class: "card bento-tile streak-card", "aria-labelledby": "streak-title" }, [
      el("div", { class: "streak-main" }, [
        el("h2", { class: "tile-title", id: "streak-title", text: "Streak · " + plural(s.current, "day") }),
        el("p", { class: "tool-note", text: s.current ? "every study day is a step on the trail" : streakMessage(s) })
      ]),
      el("ol", { class: "week-dots", "aria-label": "Last 7 days" }, week.map(function (d) {
        const js = dateOf(d.day);
        const isToday = d.day === today;
        return el("li", { class: "week-day" + (d.active ? " is-active" : "") + (isToday ? " is-today" : "") }, [
          el("span", { class: "week-dot", "aria-hidden": "true" }, d.active ? LM.icon("check", { size: 12 }) : null),
          el("span", { class: "visually-hidden", text: (isToday ? "today, " : "") + LM.fmt.weekday(js) + " " + LM.fmt.dayMonth(js) + ": " + (d.active ? "study day" : "no activity") })
        ]);
      }))
    ]);
  }

  /** Row of the "Shortcuts" list: icon, title, description, chevron. The element is an <a> or a <button>. */
  function shortcutRow(tag, attrs, icon, title, desc) {
    return el("li", null, el(tag, Object.assign({ class: "row" }, attrs), [
      el("span", { class: "row-icon", "aria-hidden": "true" }, LM.icon(icon, { size: 20 })),
      el("span", { class: "row-body" }, [
        el("span", { class: "row-title", text: title }),
        desc ? el("span", { class: "row-desc", text: desc }) : null
      ]),
      el("span", { class: "row-chev", "aria-hidden": "true" }, LM.icon("chevron-right", { size: 20 }))
    ]));
  }

  /** "Shortcuts" (when there are no exams of mine): Placement test and Stats. */
  function shortcutsTile() {
    const rows = [];
    if (LM.placement) rows.push(shortcutRow("a", { href: LM.placement.HASH }, "target", "Placement test", "12 questions, about 6 minutes – find out where to start."));
    rows.push(shortcutRow("a", { href: "#/stats" }, "chart-column", "Stats", "Accuracy, weakest topics and activity."));
    return tile("bento-shortcuts", "Shortcuts", [
      el("h2", { class: "tile-title" }, ["Shortcuts"]),
      el("ul", { class: "row-list" }, rows)
    ]);
  }

  // =====================================================================
  // TRAIL A1 → C2
  // =====================================================================

  /** Station points in the horizontal layout (viewBox 1000 × 280) or the vertical one (220 × 6·104). */
  function geometry(vertical) {
    if (vertical) {
      const pts = [0, 1, 2, 3, 4, 5].map(function (i) { return [i % 2 ? 132 : 60, 52 + i * 104]; });
      return { w: 220, h: 52 * 2 + 5 * 104, pts: pts };
    }
    const pts = [0, 1, 2, 3, 4, 5].map(function (i) { return [80 + i * 168, i % 2 ? 84 : 176]; });
    return { w: 1000, h: 280, pts: pts };
  }

  /** A closed, slightly irregular contour line (deterministic; a smooth curve through 12 points) — blob logic from gen_krainy.py. */
  function blobPath(cx, cy, rx, ry, seed, k) {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = 2 * Math.PI * i / 12;
      const wob = 1 + 0.09 * Math.sin(3 * a + seed) + 0.05 * Math.cos(5 * a + seed * 1.7);
      pts.push([cx + rx * k * wob * Math.cos(a), cy + ry * k * wob * Math.sin(a)]);
    }
    const f = function (n) { return n.toFixed(1); };
    let d = "M" + f(pts[0][0]) + " " + f(pts[0][1]);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + f(c1[0]) + " " + f(c1[1]) + " " + f(c2[0]) + " " + f(c2[1]) + " " + f(p2[0]) + " " + f(p2[1]);
    }
    return d + "Z";
  }

  /** Terrain: a --lvl-x-soft patch + --lvl-x contour lines; the number of lines grows from A1 (3) to C2 (8). */
  function terrainGroup(g, vertical) {
    const group = svgEl("g", { class: "trail-terrain" });
    const rx = vertical ? 58 : 80, ry = vertical ? 46 : 64;
    LM.LEVEL_IDS.forEach(function (id, i) {
      const l = id.toLowerCase();
      const x = g.pts[i][0], y = g.pts[i][1];
      const land = svgEl("g", { class: "trail-land", style: "--land:var(--lvl-" + l + ");--land-soft:var(--lvl-" + l + "-soft)" });
      land.appendChild(svgEl("path", { class: "trail-land-fill", d: blobPath(x, y, rx, ry, i * 1.3, 1) }));
      const rings = 3 + i;
      for (let r = 0; r < rings; r++) {
        land.appendChild(svgEl("path", {
          class: "trail-contour", d: blobPath(x + r * 2, y - r * 1.5, rx, ry, i * 1.3 + r * 0.4, 1 - r * (0.8 / rings)),
          "stroke-opacity": (0.22 + 0.05 * r).toFixed(2)
        }));
      }
      group.appendChild(land);
    });
    return group;
  }

  /** Compass rose in a free corner of the map. */
  function windRose() {
    const rose = svgEl("g", { class: "trail-rose", transform: "translate(44 48)" });
    rose.appendChild(svgEl("circle", { r: 16 }));
    rose.appendChild(svgEl("path", { d: "M0-22v44M-22 0h44" }));
    rose.appendChild(svgEl("path", { class: "trail-rose-needle", d: "M0-16 4 0H-4z" }));
    const n = svgEl("text", { y: -26, "text-anchor": "middle" });
    n.textContent = "N";
    rose.appendChild(n);
    return rose;
  }

  /** Smooth path through the points (Catmull-Rom → Bézier curves). */
  function smoothPath(pts) {
    let d = "M" + pts[0][0] + " " + pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += " C" + c1.map(Math.round).join(" ") + " " + c2.map(Math.round).join(" ") + " " + p2.join(" ");
    }
    return d;
  }

  /**
   * Path length from the start to station i (to draw progress and move the marker).
   * Stations are the ends of the "C" segments from smoothPath, so it is enough to measure
   * the path cut to i segments — one getTotalLength() instead of hundreds of
   * getPointAtLength() calls (with 4× CPU that was ~650 ms on every render of "Today").
   */
  function lengthTo(path, d, i) {
    if (i <= 0) return 0;
    const full = path.getAttribute("d");
    path.setAttribute("d", d.split(" C").slice(0, i + 1).join(" C"));
    const len = path.getTotalLength();
    path.setAttribute("d", full);
    return len;
  }

  /**
   * The compact trail (home page, above the "Levels at a glance" table): no card header and no compass rose.
   * Returns the element; it draws once it has a width (ResizeObserver) and redraws when the layout switches horizontal/vertical.
   */
  function compactTrail() {
    const stats = levelStats();
    const stage = el("div", { class: "trail-stage" });
    const wrap = el("section", { class: "trail-compact", "aria-label": "Trail A1 → C2: progress in the lands" }, stage);
    let last = null;
    function draw() {
      if (!stage.clientWidth) return;
      const vertical = stage.clientWidth < 480;
      if (last === vertical) return;
      last = vertical;
      drawTrail(stage, stats, { compact: true });
    }
    if (window.ResizeObserver) new ResizeObserver(draw).observe(stage);
    requestAnimationFrame(draw);
    return wrap;
  }

  /** Draws the trail in its container (after it is in the DOM — it needs a width). opts.compact: no compass rose (home page). */
  function drawTrail(stage, stats, opts) {
    opts = opts || {};
    const vertical = stage.clientWidth < 480;
    const g = geometry(vertical);
    const cur = currentIndex(stats);
    stage.replaceChildren();
    stage.classList.toggle("is-vertical", vertical);
    stage.style.setProperty("--trail-ratio", g.w + " / " + g.h);
    if (vertical) stage.style.height = g.h + "px"; else stage.style.removeProperty("height");

    const svg = svgEl("svg", { class: "trail-svg", viewBox: "0 0 " + g.w + " " + g.h, "aria-hidden": "true", focusable: "false" });
    svg.appendChild(terrainGroup(g, vertical));
    const d = smoothPath(g.pts);
    const base = svgEl("path", { d: d, class: "trail-base", id: "trail-path" });
    const done = svgEl("path", { d: d, class: "trail-done" });
    svg.appendChild(base);
    svg.appendChild(done);
    if (!vertical && !opts.compact) svg.appendChild(windRose());
    // The "you are here" marker (a map pin)
    // The outer group travels along the path (x, y = a point on the path), the inner one lifts the pin above the station
    const marker = svgEl("g", { class: "trail-marker" });
    // The pin in fixed screen pixels: 32 px above the station centre, whatever the viewBox scale
    const k = vertical ? 1 : g.w / Math.max(1, stage.clientWidth);
    const lift = svgEl("g", { transform: "translate(0 " + (-32 * k).toFixed(2) + ") scale(" + k.toFixed(3) + ")" });
    lift.appendChild(svgEl("path", { d: "M0 0c-7-8-11-13-11-19a11 11 0 0 1 22 0c0 6-4 11-11 19Z", class: "trail-marker-pin" }));
    lift.appendChild(svgEl("circle", { cx: 0, cy: -19, r: 4.2, class: "trail-marker-dot" }));
    marker.appendChild(lift);
    stage.appendChild(svg);
    // The marker on its own layer ABOVE the stations (same viewBox), transparent to clicks
    const overlay = svgEl("svg", { class: "trail-svg trail-overlay", viewBox: "0 0 " + g.w + " " + g.h, "aria-hidden": "true", focusable: "false" });
    overlay.appendChild(marker);

    // Stations: links to the level pages (HTML above the SVG, position in % of the viewBox)
    const list = el("ol", { class: "trail-stations" });
    stats.forEach(function (s, i) {
      const pt = g.pts[i];
      const name = levelName(s.id);
      const here = i === cur;
      const passed = LM.final ? LM.final.passedText(s.id) : null; // "A1 passed Nov 12, 2026" (final test)
      list.appendChild(el("li", {
        class: "trail-station lvl-" + s.id + (here ? " is-current" : "") + (s.percent >= 100 ? " is-done" : "") + (s.skipped ? " is-skipped" : "") + (s.soon ? " is-soon" : ""),
        style: vertical ? "left:" + pt[0] + "px;top:" + pt[1] + "px" : "left:" + (pt[0] / g.w * 100) + "%;top:" + (pt[1] / g.h * 100) + "%"
      }, el("a", {
        class: "trail-link",
        href: LM.app.levelHash(s.id),
        "aria-label": "Level " + s.id + (name ? ", " + name : "") + ": " + (s.soon ? "coming soon" : s.skipped ? "skipped by the placement test" : s.percent + (s.trail ? "% of the trail stops" : "% of the topics known")) + (here ? " – you are here" : "") + (passed ? ". " + passed : "")
      }, [
        el("span", { class: "trail-ring" }, [
          LM.ui.progressRing(s.skipped ? 100 : s.percent, { size: 56, stroke: 5, node: LM.ui.landIcon(s.id, { size: 26 }) }),
          s.skipped ? el("span", { class: "trail-skip-badge", "aria-hidden": "true" }, LM.icon("arrow-right", { size: 14 })) : null, // skipped: an arrow instead of a stamp
          passed && !s.skipped ? LM.ui.stamp(s.id, { size: 20 }) : null // ✓ stamp in the land colour ("Passed …" text next to it)
        ]),
        el("span", { class: "trail-label", "aria-hidden": "true" }, [
          el("span", { class: "trail-name", text: LM.ui.landLabel(s.id) }),
          el("span", { class: "trail-pct num", text: s.soon ? "soon" : s.skipped ? "skipped" : s.percent + "%" }),
          passed ? el("span", { class: "trail-passed", text: "Passed " + LM.final.fmtDate(LM.final.passedAt(s.id)) }) : null,
          here ? el("span", { class: "trail-here", text: "You are here" }) : null
        ])
      ])));
    });
    stage.appendChild(list);
    stage.appendChild(overlay);
    list.querySelectorAll(".ring").forEach(function (r) { r.setAttribute("aria-hidden", "true"); r.removeAttribute("role"); });

    // End state without animation: the path covered up to the current station, the marker on the station
    const total = base.getTotalLength();
    const reach = lengthTo(done, d, cur);
    const frac = total ? reach / total : 0;
    done.style.strokeDasharray = reach + " " + total;
    marker.setAttribute("transform", "translate(" + g.pts[cur][0] + " " + g.pts[cur][1] + ")");
    return { svg: svg, base: base, done: done, marker: marker, frac: frac, vertical: vertical };
  }

  // =====================================================================
  // VIEW
  // =====================================================================

  function render() {
    const view = document.getElementById("view");
    const keepScroll = view.dataset.file === HASH ? U.getScroll() : 0;
    const stats = levelStats();
    const map = mapCard(stats);
    const exam = LM.examCover ? LM.examCover.todayTiles()[0] : null; // my exam with the nearest date (mini cover)

    view.className = "view tool-view today-view";
    view.dataset.file = HASH;
    view.replaceChildren(el("div", { class: "today-stack" }, [
      map,
      LM.review ? LM.review.todayCard() : null, // "Review": state with a number or a low zero card
      el("div", { class: "today-row" }, [streakTile(), exam || shortcutsTile()])
    ]));
    document.title = "Today · " + LM.APP.appTitle;
    U.setScroll(keepScroll);

    const stage = map._stage;
    let parts = drawTrail(stage, stats);
    // Trail horizontal ↔ vertical when the width changes
    if (trailObserver) trailObserver.disconnect();
    if (window.ResizeObserver) {
      let lastVertical = parts.vertical;
      trailObserver = new ResizeObserver(function () {
        const v = stage.clientWidth < 480;
        if (v !== lastVertical) { lastVertical = v; parts = drawTrail(stage, stats); }
      });
      trailObserver.observe(stage);
    }
    animate(view, parts);
  }

  /** Entrance animations (GSAP on demand; with reduced motion — nothing). */
  function animate(view, parts) {
    const first = !visitedThisSession;
    visitedThisSession = true;
    LM.motion.run(["DrawSVGPlugin", "MotionPathPlugin"], function (gsap, reduce) {
      if (!gsap || reduce) return;
      const tiles = view.querySelectorAll(".bento-tile");
      if (!first) {
        // Later visits: a short refresh
        gsap.from(tiles, { autoAlpha: 0, y: 6, duration: 0.25, stagger: 0.03, ease: "power2.out", clearProps: "all" });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(tiles, { autoAlpha: 0, y: 16, duration: 0.45, stagger: 0.06, clearProps: "transform,opacity,visibility" });
      view.querySelectorAll("[data-count]").forEach(function (n) { tl.add(LM.motion.countUp(gsap, n, Number(n.getAttribute("data-count"))), 0.15); });
      // The covered path "draws itself", then the marker travels to its station
      parts.done.style.removeProperty("stroke-dasharray");
      tl.fromTo(parts.done, { drawSVG: "0% 0%" }, { drawSVG: "0% " + (parts.frac * 100).toFixed(2) + "%", duration: 1.1, ease: "power2.inOut" }, 0.3);
      tl.fromTo(parts.marker, { autoAlpha: 0 }, {
        autoAlpha: 1,
        motionPath: { path: parts.base, start: 0, end: Math.max(0.0001, parts.frac) },
        duration: 1.1, ease: "power2.inOut"
      }, 0.3);
    });
  }

  LM.today = { currentLevelId: function () { const st = levelStats(); return st[currentIndex(st)].id; }, HASH: HASH, parseRoute: parseRoute, render: render, compactTrail: compactTrail };
})(window.LM);
