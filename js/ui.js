/*
 * ui.js — visual pieces shared by the whole app (see DESIGN.md):
 *   LM.icon(name, opts)          a Lucide icon (data: assets/icons.js)
 *   LM.ui.withIcon(name, text)   [icon, text] for buttons and links
 *   LM.logo(opts)                logo mark (a compass with a trail) + wordmark
 *   LM.ui.progressRing(…)        progress ring (SVG)
 *   LM.loadGsap()                GSAP, loaded only on demand
 *
 * Everything is built with createElementNS — no innerHTML.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    return node;
  }

  // =====================================================================
  // ICONS (Lucide, 1.75 px stroke, color from currentColor)
  // =====================================================================

  /**
   * Icon as an <svg> element. opts:
   *   size  — size in px (default 20)
   *   label — text for screen readers (without it the icon is aria-hidden)
   *   class — extra class
   */
  function icon(name, opts) {
    opts = opts || {};
    const nodes = ((opts.set === "land" ? LM.LAND_NODES : LM.ICON_NODES) || {})[name];
    const size = opts.size || 20;
    const svg = svgEl("svg", {
      class: "icon icon-" + name + (opts.class ? " " + opts.class : ""),
      width: size, height: size, viewBox: "0 0 24 24",
      fill: "none", stroke: "currentColor", "stroke-width": 1.75,
      "stroke-linecap": "round", "stroke-linejoin": "round",
      focusable: "false"
    });
    if (opts.label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", opts.label); }
    else svg.setAttribute("aria-hidden", "true");
    if (!nodes) {
      if (window.console) console.warn("Missing icon “" + name + "” (add it in tools/build-assets.js)");
      return svg;
    }
    nodes.forEach(function (n) { svg.appendChild(svgEl(n[0], n[1])); });
    return svg;
  }

  /** Land symbol key per level in assets/lands.js. Land NAMES come from the syllabus (LM.syl.landName). */
  const LANDS = {
    A1: { key: "land-a1" }, A2: { key: "land-a2" }, B1: { key: "land-b1" },
    B2: { key: "land-b2" }, C1: { key: "land-c1" }, C2: { key: "land-c2" }
  };

  /** Land symbol of a level ("A1"…"C2"), stroke currentColor — the parent sets the colour (e.g. --lvl). */
  function landIcon(levelId, opts) {
    const land = LANDS[levelId];
    return icon(land ? land.key : "", Object.assign({ set: "land", size: 22 }, opts || {}));
  }

  /** "A1 · Meadow" (the code alone when the level has no land name). */
  function landLabel(levelId) {
    const name = LM.syl ? LM.syl.landName(levelId) : "";
    return name ? levelId + " · " + name : levelId;
  }

  /**
   * Stamp in the land colour (--lvl from the parent's lvl-X class or its own): round, with a tick.
   * opts: size (px, default 20), fresh — "bounce" animation (C3; no motion with reduced motion, CSS).
   */
  function stamp(levelId, opts) {
    opts = opts || {};
    const size = opts.size || 20;
    const s = document.createElement("span");
    s.className = "stamp lvl-" + levelId + (opts.fresh ? " is-fresh" : "");
    s.setAttribute("aria-hidden", "true");
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.appendChild(icon("check", { size: Math.round(size * 0.62), "stroke-width": 3 }));
    return s;
  }

  /**
   * Empty state with an illustration (pack v7, C6): LM.ui.emptyState({ art, title, hint, action, level, tag }).
   *   art    — key in LM.EMPTY_ART (assets/empty-states.js), 96×96, stroke currentColor
   *   action — an element (button, link) or null; level — level of the accent colour (default: the profile's current level)
   *   tag    — "li" when the empty state is a list item (default div)
   */
  function emptyState(o) {
    const level = o.level || (LM.state && LM.state.ui && LM.state.ui.levelId) || "A1";
    const box = document.createElement(o.tag || "div");
    box.className = "empty-state has-art lvl-" + level + (o.class ? " " + o.class : "");
    const nodes = (LM.EMPTY_ART || {})[o.art];
    if (nodes) {
      const svg = svgEl("svg", { class: "es-art", viewBox: "0 0 96 96", fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" });
      nodes.forEach(function (n) { svg.appendChild(svgEl(n[0], n[1])); });
      box.appendChild(svg);
    }
    const title = document.createElement("p");
    title.className = "empty-state-text";
    title.textContent = o.title;
    box.appendChild(title);
    if (o.hint) {
      const hint = document.createElement("p");
      hint.className = "empty-state-hint";
      hint.textContent = o.hint;
      box.appendChild(hint);
    }
    if (o.action) box.appendChild(o.action);
    return box;
  }

  /** [icon, text] — e.g. el("button", …, LM.ui.withIcon("plus", "Add mistake")). */
  function withIcon(name, text, opts) {
    return [icon(name, Object.assign({ size: 18 }, opts || {})), document.createTextNode(text)];
  }

  /** Header of a tool page: eyebrow (LEARN · PRACTICE), h1 and an optional lead. */
  function pageHead(o) {
    const h = document.createElement("header");
    h.className = "tool-head" + (o.className ? " " + o.className : "");
    if (o.eyebrow) {
      const p = document.createElement("p");
      p.className = "eyebrow";
      p.textContent = o.eyebrow;
      h.appendChild(p);
    }
    const t = document.createElement("h1");
    t.className = "tool-title";
    t.textContent = o.title;
    h.appendChild(t);
    if (o.lead) {
      const l = document.createElement("p");
      l.className = "tool-lead";
      l.textContent = o.lead;
      h.appendChild(l);
    }
    return h;
  }

  // =====================================================================
  // BREADCRUMBS (pack v8, S1): one component above the h1 on every content page
  // =====================================================================

  /**
   * LM.ui.breadcrumbs([{ label, href?, onclick? }, …]) → <nav class="breadcrumbs">: “Level A1 › Verbs › gustar”.
   * The last item without href is the current page (aria-current="page"). Below 640 px (CSS) only “‹ parent” shows
   * (the second to last item; with one item, that item). onclick (e.g. back to the list with its scroll position) gets the event
   * after preventDefault; href stays for middle-click and for screen readers.
   */
  function breadcrumbs(items) {
    const nav = document.createElement("nav");
    nav.className = "breadcrumbs";
    nav.setAttribute("aria-label", "Breadcrumbs");
    const ol = document.createElement("ol");
    const parentIndex = items.length > 1 ? items.length - 2 : 0;
    items.forEach(function (it, i) {
      const li = document.createElement("li");
      if (i === parentIndex) li.className = "is-parent";
      if (it.href) {
        const a = document.createElement("a");
        a.href = it.href;
        if (i === parentIndex) {
          const ic = document.createElement("span");
          ic.className = "bc-back-icon";
          ic.setAttribute("aria-hidden", "true");
          ic.appendChild(icon("chevron-left", { size: 16 }));
          a.appendChild(ic);
        }
        a.appendChild(document.createTextNode(it.label));
        if (it.onclick) a.addEventListener("click", function (e) { e.preventDefault(); it.onclick(e); });
        li.appendChild(a);
      } else {
        li.textContent = it.label;
        if (i === items.length - 1) li.setAttribute("aria-current", "page");
      }
      ol.appendChild(li);
    });
    nav.appendChild(ol);
    return nav;
  }

  // =====================================================================
  // LOGO: a compass in a circle with a trail in the brand gradient (lands A1 → C2)
  // =====================================================================

  let gradientCounter = 0;

  /** Brand gradient in <defs> (colours from the tokens, so it works in both themes). */
  function brandGradient(defs, id, x1, y1, x2, y2) {
    const g = svgEl("linearGradient", { id: id, x1: x1, y1: y1, x2: x2, y2: y2, gradientUnits: "userSpaceOnUse" });
    ["a1", "a2", "b1", "b2", "c1", "c2"].forEach(function (lvl, i) {
      const stop = svgEl("stop", { offset: (i / 5).toFixed(2) });
      stop.setAttribute("style", "stop-color: var(--lvl-" + lvl + ")");
      g.appendChild(stop);
    });
    defs.appendChild(g);
  }

  /** The mark alone (40 × 40). */
  let logoSeq = 0;

  /** The map mark: circle, dotted trail and needle in the level gradient (A1 → C2, tokens --lvl-a1 … --lvl-c2). */
  function logoMark(size) {
    const gid = "logo-grad-" + (++logoSeq);
    const svg = svgEl("svg", { class: "logo-mark", width: size || 34, height: size || 34, viewBox: "0 0 40 40", "aria-hidden": "true", focusable: "false" });
    const grad = svgEl("linearGradient", { id: gid, x1: 4, y1: 36, x2: 36, y2: 4, gradientUnits: "userSpaceOnUse" });
    ["a1", "a2", "b1", "b2", "c1", "c2"].forEach(function (l, i) {
      grad.appendChild(svgEl("stop", { offset: i / 5, style: "stop-color: var(--lvl-" + l + ")" }));
    });
    const defs = svgEl("defs", {});
    defs.appendChild(grad);
    svg.appendChild(defs);
    const paint = "url(#" + gid + ")";
    // Circle (edge of the map) and a dotted trail from A1 (bottom left) to C2 (top right)
    svg.appendChild(svgEl("circle", { cx: 20, cy: 20, r: 17, fill: "none", stroke: paint, "stroke-width": 2.2 }));
    svg.appendChild(svgEl("path", {
      d: "M9.5 28.5c4-1.5 3.5-6.5 8-7.5s6.5 1.5 9.5-2.5 2.5-6 3.5-7.5",
      fill: "none", stroke: "currentColor", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-dasharray": "0.1 4.2"
    }));
    // Compass needle (north in the gradient, south in the line colour)
    const needle = svgEl("g", { transform: "rotate(40 20 20)" });
    needle.appendChild(svgEl("path", { d: "M20 8.5 23.2 20h-6.4z", fill: paint }));
    needle.appendChild(svgEl("path", { d: "M20 31.5 16.8 20h6.4z", class: "logo-needle-s" }));
    svg.appendChild(needle);
    svg.appendChild(svgEl("circle", { cx: 20, cy: 20, r: 2.1, class: "logo-pin" }));
    return svg;
  }

  /**
   * Mark + wordmark (display font, spec 11 §1): the language name in the accent, the rest in ink
   * ("Spanish" + " Levels Map"). The split comes from LM.APP.language, so another app keeps it.
   */
  function logo(opts) {
    opts = opts || {};
    const wrap = document.createElement("span");
    wrap.className = "logo";
    wrap.appendChild(logoMark(opts.size));
    const word = document.createElement("span");
    word.className = "logo-word";
    const title = LM.APP.appTitle, lang = LM.APP.language || "";
    if (lang && title.indexOf(lang) === 0) {
      const accent = document.createElement("span");
      accent.className = "logo-word-accent";
      accent.textContent = lang;
      word.appendChild(accent);
      word.appendChild(document.createTextNode(title.slice(lang.length)));
    } else word.textContent = title;
    wrap.appendChild(word);
    return wrap;
  }

  // =====================================================================
  // PROGRESS RING
  // =====================================================================

  /**
   * percent: 0–100. opts:
   *   size (px, default 64), stroke (px, default 6),
   *   brand: true → brand gradient instead of the level color (--lvl),
   *   label — description for screen readers, text — text in the middle (default “N%”), node — an element instead of text
   * The fill animates through stroke-dashoffset (CSS, --dur-slow).
   */
  function progressRing(percent, opts) {
    opts = opts || {};
    const size = opts.size || 64, stroke = opts.stroke || 6;
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const wrap = document.createElement("span");
    wrap.className = "ring" + (opts.brand ? " is-brand" : "");
    wrap.setAttribute("role", "progressbar");
    wrap.setAttribute("aria-valuemin", "0");
    wrap.setAttribute("aria-valuemax", "100");
    wrap.setAttribute("aria-valuenow", String(p));
    wrap.setAttribute("aria-label", opts.label || "Progress");
    wrap.style.setProperty("--ring-size", size + "px");
    const svg = svgEl("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, "aria-hidden": "true", focusable: "false" });
    let strokeRef = null;
    if (opts.brand) {
      const id = "ring-grad-" + (++gradientCounter);
      const defs = svgEl("defs");
      brandGradient(defs, id, 0, size, size, 0);
      svg.appendChild(defs);
      strokeRef = "url(#" + id + ")";
    }
    svg.appendChild(svgEl("circle", { class: "ring-track", cx: size / 2, cy: size / 2, r: r, fill: "none", "stroke-width": stroke }));
    const arc = svgEl("circle", {
      class: "ring-fill", cx: size / 2, cy: size / 2, r: r, fill: "none", "stroke-width": stroke,
      "stroke-linecap": "round", "stroke-dasharray": c.toFixed(2), "stroke-dashoffset": c.toFixed(2),
      transform: "rotate(-90 " + size / 2 + " " + size / 2 + ")"
    });
    if (strokeRef) arc.style.stroke = strokeRef; // inline style: wins over the level colour from CSS
    svg.appendChild(arc);
    wrap.appendChild(svg);
    const txt = document.createElement("span");
    txt.className = "ring-text num";
    if (opts.node) { txt.className = "ring-text ring-land"; txt.appendChild(opts.node); } // e.g. a land symbol instead of text
    else txt.textContent = opts.text !== undefined ? opts.text : p + "%";
    wrap.appendChild(txt);
    // Animates from zero (CSS transition; at once with prefers-reduced-motion)
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { arc.setAttribute("stroke-dashoffset", (c * (1 - p / 100)).toFixed(2)); });
    });
    return wrap;
  }

  /** Changes the value of an existing ring (smooth transition from the previous value). */
  function setRing(ring, percent, text) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const arc = ring.querySelector(".ring-fill");
    const c = Number(arc.getAttribute("stroke-dasharray"));
    arc.setAttribute("stroke-dashoffset", (c * (1 - p / 100)).toFixed(2));
    ring.setAttribute("aria-valuenow", String(p));
    if (text !== undefined) ring.querySelector(".ring-text").textContent = text;
  }

  // =====================================================================
  // GSAP ON DEMAND (assets/vendor/gsap.min.js)
  //   LM.loadGsap().then(function (gsap) { const mm = gsap.matchMedia(); … });
  //   A plain <script> instead of import(), because modules do not work from file://.
  // =====================================================================

  const loading = {};

  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { delete loading[src]; reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  /**
   * Module or data file loaded on demand (js/…, data/…), with the same ?v= as the start-up scripts:
   * LM.VERSION from js/config.js, stamped by `npm run build -- --bump`. A plain <script>, so it works on file://
   * and over http. Returns a Promise; a failed load can be retried.
   */
  function loadModule(file) {
    return loadScript(file + (LM.VERSION ? "?v=" + LM.VERSION : ""));
  }

  /**
   * GSAP + optional plugins, e.g. LM.loadGsap(["DrawSVGPlugin", "MotionPathPlugin"]).
   * Plugins are registered once. Returns Promise<gsap>.
   */
  function loadGsap(plugins) {
    return loadScript("assets/vendor/gsap.min.js").then(function () {
      return Promise.all((plugins || []).map(function (name) {
        return loadScript("assets/vendor/" + name + ".min.js").then(function () {
          if (window[name]) window.gsap.registerPlugin(window[name]);
        });
      }));
    }).then(function () { return window.gsap; });
  }

  /** Whether the user asks for less motion (prefers-reduced-motion). */
  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /** Completes the static HTML: <span data-icon="menu"> → icon, [data-logo] → logo. */
  function hydrate(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (node) {
      node.replaceWith(icon(node.getAttribute("data-icon"), { size: Number(node.getAttribute("data-size")) || 18 }));
    });
    (root || document).querySelectorAll("[data-logo]").forEach(function (node) {
      node.removeAttribute("data-logo");
      node.replaceChildren(logo());
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { hydrate(); });
  else hydrate();

  // =====================================================================
  // TOAST — an unobtrusive message at the bottom of the screen (role="status"), optionally with a button
  //   LM.ui.toast({ text, action: { label, onClick }, duration: 5000 })  or  actions: [{ label, onClick }, …]
  // One at a time; hover or focus pause the timer.
  // =====================================================================

  let toastBox = null, toastTimer = null;

  function toast(opts) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toast-region";
      toastBox.setAttribute("role", "status");
      toastBox.setAttribute("aria-live", "polite");
      document.body.appendChild(toastBox);
    }
    clearTimeout(toastTimer);
    const el = LM.utils.el;
    const card = el("div", { class: "toast" }, [
      opts.icon ? el("span", { class: "toast-icon", "aria-hidden": "true" }, icon(opts.icon, { size: 18 })) : null,
      el("span", { class: "toast-text", text: opts.text }),
      // one action (action) or several (actions: [{ label, onClick }, …], e.g. “Add a meaning” and “Undo”)
      (opts.actions || (opts.action ? [opts.action] : [])).map(function (a) {
        return el("button", {
          type: "button", class: "btn btn-link btn-small toast-action",
          onclick: function () { hideToast(); a.onClick(); }
        }, a.label);
      }),
      el("button", { type: "button", class: "icon-btn toast-close", "aria-label": "Close message", onclick: hideToast }, icon("x", { size: 16 }))
    ]);
    toastBox.replaceChildren(card);
    const duration = opts.duration || 5000;
    const arm = function () { clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, duration); };
    card.addEventListener("mouseenter", function () { clearTimeout(toastTimer); });
    card.addEventListener("mouseleave", arm);
    card.addEventListener("focusin", function () { clearTimeout(toastTimer); });
    card.addEventListener("focusout", arm);
    arm();
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastBox) toastBox.replaceChildren();
  }

  LM.icon = icon;
  LM.logo = logo;
  LM.loadGsap = loadGsap;
  LM.loadModule = loadModule;
  LM.loadScript = loadScript; // data loaded on demand (e.g. exercises, the lab)
  LM.reducedMotion = reducedMotion;
  /**
   * Guest mode: a "you are browsing without a profile" note with a "Create a profile" button. Returns null when there is a profile.
   * what — what is not saved, as a plural noun phrase (e.g. "your results").
   */
  function guestNote(what) {
    if (!LM.app || !LM.app.getActiveProfile || LM.app.getActiveProfile()) return null;
    const el = LM.utils.el;
    return el("p", { class: "tool-note guest-note", role: "note" }, [
      "You are browsing without a profile, so " + what + " are not saved. ",
      el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { LM.app.withProfile("", function () { LM.app.renderAll(); }); } }, "Create a profile")
    ]);
  }

  /**
   * E12: a quiet "Report a mistake" link — LM.APP.reportUrl + a prefilled issue title ("<what>: "), and an e-mail
   * alternative when LM.APP.reportMail is set. what — usually a topic id (a set id or card id where there is no topic).
   * Returns null when neither address is configured.
   */
  function reportLink(what, opts) {
    opts = opts || {};
    const A = LM.APP || {};
    if (!A.reportUrl && !A.reportMail) return null;
    const el = LM.utils.el;
    const title = what ? String(what) + ": " : "";
    const parts = [];
    if (A.reportUrl) {
      parts.push(el("a", { class: "report-link-a", href: A.reportUrl + encodeURIComponent(title), target: "_blank", rel: "noopener noreferrer" },
        withIcon("flag", opts.label || "Report a mistake")));
    }
    if (A.reportMail) {
      if (parts.length) parts.push(" · ");
      parts.push(el("a", { class: "report-link-a", href: "mailto:" + A.reportMail + "?subject=" + encodeURIComponent(title) },
        parts.length ? "by e-mail" : withIcon("flag", opts.label || "Report a mistake")));
    }
    if (opts.lead) parts.unshift(opts.lead + " ");
    return el("p", { class: "report-link" + (opts.className ? " " + opts.className : "") }, parts);
  }

  LM.ui = { reportLink: reportLink, guestNote: guestNote, breadcrumbs: breadcrumbs, icon: icon, withIcon: withIcon, emptyState: emptyState, landIcon: landIcon, stamp: stamp, landLabel: landLabel, LANDS: LANDS, pageHead: pageHead, logo: logo, logoMark: logoMark, progressRing: progressRing, setRing: setRing, toast: toast, hideToast: hideToast };
})(window.LM);
