/*
 * timeline.js — the timeline drawing of the Lab as a reusable function (spec 09 rule 2). Knows nothing about
 * tenses, cards or a language: it draws a scene { id, label, description, elements } on an axis.
 *
 *   LM.timeline.draw(scene, { compact, title, color, words })   → { node: <svg>, parts }
 *   LM.timeline.block(owner, { compact, noSwitch, animate })    → scene switcher + figure with a text description;
 *                                                                  owner = { id, title, scenes } (the chosen scene is kept per owner id)
 *   LM.timeline.animate(parts) · LM.timeline.animateAll(container)   GSAP DrawSVG (nothing with reduced motion)
 *   LM.timeline.layoutLabels(labels, geometry)                  pure: label rows above the axis without overlap
 *
 * Coordinates: -1 (distant past) … 0 (now) … 1 (future). Element kinds: point, range, open-left, open-right, repeat,
 * result, marker. Colour: `color` (default var(--tense, var(--accent))), so a wrapper class sets the tone.
 * Accessibility: role="img" + aria-label = title, scene label and description; the same description as text under the axis.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const AXIS_Y = 120;
  const ROW = 22;
  const WORDS = { now: "now", past: "past", future: "future" };

  /** Wide axis (800 units) or compact (440: phone, compare columns), so labels stay about 12 px or larger when scaled. */
  function geometry(compact) {
    const W = compact ? 440 : 800, LEFT = compact ? 36 : 46;
    return { W: W, LEFT: LEFT, RIGHT: W - LEFT, compact: !!compact };
  }
  function xOf(g, v) { return g.LEFT + (Math.max(-1, Math.min(1, v)) + 1) / 2 * (g.RIGHT - g.LEFT); }

  /**
   * Label rows above the axis: sorted by x, a label goes one row higher when it would overlap the previous one in a row.
   * labels: [{ x, text, marker }] → { items: [{ x, y, row, text, marker }], rows }. Width is estimated from the characters.
   */
  function layoutLabels(labels, g) {
    const ends = [];
    const items = labels.slice().sort(function (a, b) { return a.x - b.x; }).map(function (l) {
      const w = l.text.length * (g.compact ? 9.4 : 7.6) + 14;
      let row = 0;
      while (ends[row] !== undefined && ends[row] > l.x - w / 2) row++;
      ends[row] = l.x + w / 2;
      const x = Math.max(g.LEFT + w / 2 - 30, Math.min(g.RIGHT - w / 2 + 30, l.x));
      return { x: x, y: AXIS_Y - 24 - row * ROW, row: row, text: l.text, marker: !!l.marker };
    });
    return { items: items, rows: ends.length };
  }

  function svg(tag, attrs, children) {
    const n = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, String(attrs[k])); });
    (children || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function svgText(attrs, text) { return svg("text", attrs, [document.createTextNode(text)]); }

  let gradientSeq = 0;

  /** The SVG of one scene. Returns { node, parts } (parts: what animate() moves). */
  function draw(scene, opts) {
    opts = opts || {};
    const g = geometry(opts.compact);
    const words = Object.assign({}, WORDS, opts.words || {});
    const color = opts.color || "var(--tense, var(--accent))";
    const parts = { axis: null, marks: [], labels: [], now: null };
    const marks = svg("g", { class: "tl-marks" });
    const labels = [];
    const gid = "tl-grad-" + (++gradientSeq);
    const defs = svg("defs", null, [
      svg("linearGradient", { id: gid, x1: "0", x2: "1", y1: "0", y2: "0" }, [
        svg("stop", { offset: "0", style: "stop-color:" + color + ";stop-opacity:0" }),
        svg("stop", { offset: "0.55", style: "stop-color:" + color + ";stop-opacity:1" })
      ]),
      svg("marker", { id: gid + "-arrow", viewBox: "0 0 10 10", refX: "6", refY: "5", markerWidth: "4", markerHeight: "4", orient: "auto" }, [
        svg("path", { d: "M0 0 L10 5 L0 10 z", style: "fill:" + color })
      ])
    ]);
    const X = function (v) { return xOf(g, v); };

    (scene.elements || []).forEach(function (e) {
      let node = null;
      if (e.kind === "point") {
        node = svg("circle", { cx: X(e.at), cy: AXIS_Y, r: 9, class: "tl-point", style: "fill:" + color });
        if (e.label) labels.push({ x: X(e.at), text: e.label });
      } else if (e.kind === "range") {
        node = svg("line", { x1: X(e.from), x2: X(e.to), y1: AXIS_Y, y2: AXIS_Y, class: "tl-range", style: "stroke:" + color });
        if (e.label) labels.push({ x: (X(e.from) + X(e.to)) / 2, text: e.label });
      } else if (e.kind === "open-left") {
        node = svg("line", { x1: g.LEFT, x2: X(e.to), y1: AXIS_Y, y2: AXIS_Y, class: "tl-range", style: "stroke:url(#" + gid + ")" });
        if (e.label) labels.push({ x: (g.LEFT + X(e.to)) / 2 + 40, text: e.label });
      } else if (e.kind === "open-right") {
        node = svg("line", { x1: X(e.from), x2: g.RIGHT - 12, y1: AXIS_Y, y2: AXIS_Y, class: "tl-range", style: "stroke:" + color, "marker-end": "url(#" + gid + "-arrow)" });
        if (e.label) labels.push({ x: (X(e.from) + g.RIGHT) / 2, text: e.label });
      } else if (e.kind === "repeat") {
        const n = Math.max(2, e.count || 5);
        node = svg("g", { class: "tl-repeat" });
        for (let i = 0; i < n; i++) node.appendChild(svg("circle", { cx: X(e.from + (e.to - e.from) * i / (n - 1)), cy: AXIS_Y, r: 6, style: "fill:" + color }));
        if (e.label) labels.push({ x: (X(e.from) + X(e.to)) / 2, text: e.label });
      } else if (e.kind === "result") {
        const x = X(e.at);
        node = svg("g", { class: "tl-result" }, [
          svg("rect", { x: x - 10, y: AXIS_Y - 10, width: 20, height: 20, rx: 3, transform: "rotate(45 " + x + " " + AXIS_Y + ")", style: "stroke:" + color }),
          svg("circle", { cx: x, cy: AXIS_Y, r: 3.5, style: "fill:" + color })
        ]);
        if (e.label) labels.push({ x: x, text: e.label });
      } else if (e.kind === "marker") {
        const x = X(e.at);
        node = svg("line", { x1: x, x2: x, y1: AXIS_Y - 16, y2: AXIS_Y + 22, class: "tl-marker" });
        labels.push({ x: x, text: e.label || "", marker: true });
      }
      if (node) { marks.appendChild(node); parts.marks.push(node); }
    });

    const laid = layoutLabels(labels, g);
    const labelNodes = laid.items.map(function (l) {
      return svgText({ x: l.x, y: l.y, class: "tl-label" + (l.marker ? " is-marker" : ""), "text-anchor": "middle" }, l.text);
    });
    // Top edge: as much room as the label rows take (without labels: only the "now" line)
    const topY = laid.rows ? AXIS_Y - 50 - (laid.rows - 1) * ROW : AXIS_Y - 44;
    const H = AXIS_Y + 50;
    const axis = svg("line", { x1: g.LEFT - 20, x2: g.RIGHT + 20, y1: AXIS_Y, y2: AXIS_Y, class: "tl-axis" });
    const now = svg("g", { class: "tl-now" }, [
      svg("line", { x1: X(0), x2: X(0), y1: topY + 4, y2: AXIS_Y + 18, class: "tl-now-line" }),
      svgText({ x: X(0), y: AXIS_Y + 38, "text-anchor": "middle", class: "tl-now-label" }, words.now)
    ]);
    const ends = svg("g", { class: "tl-ends" }, [
      svgText({ x: g.LEFT - 20, y: AXIS_Y + 38, class: "tl-end" }, words.past),
      svgText({ x: g.RIGHT + 20, y: AXIS_Y + 38, "text-anchor": "end", class: "tl-end" }, words.future)
    ]);
    const label = (opts.title ? opts.title + " – " : "") + scene.label + ": " + scene.description;
    const root = svg("svg", {
      class: "tl-svg" + (g.compact ? " is-compact" : ""), viewBox: "0 " + topY + " " + g.W + " " + (H - topY),
      role: "img", "aria-label": label, focusable: "false"
    }, [defs, axis, now, ends, marks, svg("g", { class: "tl-labels" }, labelNodes)]);
    parts.axis = axis;
    parts.now = now;
    parts.labels = labelNodes;
    return { node: root, parts: parts };
  }

  const chosen = {}; // chosen scene per owner id (memory of the tab)

  /** Scene switcher (chips with aria-pressed), the figure and its text description; animated on entry and on change. */
  function block(owner, opts) {
    opts = opts || {};
    const U = LM.utils, el = U.el;
    const box = el("div", { class: "tl-block" + (opts.className ? " " + opts.className : "") });
    const scenes = owner.scenes || [];
    function paint(animateIt) {
      const scene = scenes.find(function (s) { return s.id === chosen[owner.id]; }) || scenes[0];
      if (!scene) { box.replaceChildren(); return; }
      const tl = draw(scene, { compact: !!opts.compact || window.innerWidth < 640, title: owner.title, words: opts.words });
      const switcher = scenes.length > 1 && !opts.noSwitch ? el("div", { class: "tl-scenes", role: "group", "aria-label": "Situations" }, scenes.map(function (s) {
        const on = s.id === scene.id;
        return el("button", {
          type: "button", class: "chip-btn" + (on ? " is-active" : ""), "aria-pressed": on ? "true" : "false",
          onclick: function () { chosen[owner.id] = s.id; paint(true); const b = box.querySelector(".chip-btn.is-active"); if (b) b.focus(); }
        }, s.label);
      })) : null;
      box.replaceChildren();
      U.appendChildren(box, [
        switcher,
        el("figure", { class: "tl-figure" }, [
          tl.node,
          el("figcaption", { class: "tl-caption" }, [el("strong", { text: scene.label + ": " }), scene.description])
        ])
      ]);
      if (animateIt) animate(tl.parts);
    }
    paint(opts.animate !== false);
    return box;
  }

  function animate(parts) {
    if (!LM.motion) return;
    LM.motion.run(["DrawSVGPlugin"], function (gsap, reduce) {
      if (!gsap || reduce) return;
      const tl = gsap.timeline();
      tl.fromTo(parts.axis, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.6, ease: "power2.out" });
      tl.from(parts.now, { autoAlpha: 0, duration: 0.25 }, 0.35);
      parts.marks.forEach(function (m, i) {
        if (m.tagName === "line") tl.fromTo(m, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.5, ease: "power2.out" }, 0.45 + i * 0.12);
        else tl.from(m, { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(2)" }, 0.45 + i * 0.12);
      });
      if (parts.labels.length) tl.from(parts.labels, { autoAlpha: 0, y: 6, duration: 0.3, stagger: 0.06 }, 0.6);
    });
  }

  /** Every timeline in a container at once (the Compare columns). */
  function animateAll(container) {
    const svgs = Array.prototype.slice.call(container.querySelectorAll(".tl-svg"));
    if (!svgs.length || !LM.motion) return;
    LM.motion.run(["DrawSVGPlugin"], function (gsap, reduce) {
      if (!gsap || reduce) return;
      svgs.forEach(function (s, i) {
        gsap.fromTo(s.querySelector(".tl-axis"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.6, delay: i * 0.1, ease: "power2.out" });
        gsap.from(s.querySelectorAll(".tl-marks > *, .tl-labels > *"), { autoAlpha: 0, duration: 0.35, stagger: 0.08, delay: 0.4 + i * 0.1 });
      });
    });
  }

  LM.timeline = { draw: draw, block: block, animate: animate, animateAll: animateAll, layoutLabels: layoutLabels, geometry: geometry, AXIS_Y: AXIS_Y };
})(window.LM);
