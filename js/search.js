/*
 * search.js — search across the whole app (spec 04, part A.3).
 *
 * Opening:
 *   - the magnifier in the top bar (next to the theme),
 *   - the "/" key (when focus is not in a text field) and Ctrl/Cmd + K,
 *   - hovering the top edge of the content area (a 12 px band, about 50% of the width,
 *     400 ms delay; mouse devices only). A field opened "by hover" hides
 *     when the mouse leaves and the query is empty.
 * The bar is a combobox (role="combobox" + a listbox with groups), arrows / Enter / Esc / Tab.
 *
 * Index: data/search-index.js (tools/build/search.js), loaded on first open.
 * Notes and the mistake log of the active profile are added in the browser (they are private).
 * Recent searches: slm.search-recent { version: 1, items: [...] } — on the device,
 * not exported (like slm.sidebar), cleared by "Reset data".
 * All texts go into the page through textContent (no innerHTML).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  function recentKey() { return LM.storage.key("search-recent"); } // device-wide, cleared by reset (registry in js/profile-data.js)
  const GROUPS = ["pages", "exams", "exercises", "lab", "notes", "journal"];
  const GROUP_LABEL = { pages: "Pages", exams: "Exams", exercises: "Practice", lab: LM.APP.lab.title, notes: "My notes", journal: "My mistake log" };
  const SHORTCUTS = [
    { title: "Trail", route: "#/trail", icon: "route" },
    { title: "Today", route: "#/today", icon: "sunrise" },
    { title: LM.APP.lab.title, route: "#/lab", icon: "flask-conical" },
    { title: "Practice", route: "#/practice", icon: "dumbbell" },
    { title: "Review", route: "#/review", icon: "layers" },
    { title: "My mistakes", route: "#/review/mistakes", icon: "notebook-pen" }
  ];
  const HOVER_DELAY = 400;

  function S() { return LM.searchLogic; }

  let panel, input, list, status, btn, hoverZone;
  let publicIndex = null;      // the prepared index from the file
  let index = null;            // + private records (notes, mistake log)
  let openedBy = null;         // "hover" | "key" | "button"
  let returnFocus = null;
  let options = [];            // [{ node, kind, data }]
  let active = -1;
  let expanded = {};
  let timer = null, hoverTimer = null, leaveTimer = null;

  // ---------- Recent searches (device) ----------

  function recent() {
    try {
      const raw = JSON.parse(localStorage.getItem(recentKey()) || "null");
      return raw && raw.version === 1 && Array.isArray(raw.items) ? raw.items.filter(function (x) { return typeof x === "string"; }).slice(0, 5) : [];
    } catch (e) { return []; }
  }

  function saveRecent(q) {
    q = String(q || "").trim().slice(0, 80);
    if (q.length < 2) return;
    const items = [q].concat(recent().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 5);
    try { localStorage.setItem(recentKey(), JSON.stringify({ version: 1, items: items })); } catch (e) { /* no access — nothing to do */ }
  }

  function clearRecent() { try { localStorage.removeItem(recentKey()); } catch (e) { /* nic */ } }

  // ---------- Index ----------

  function loadIndex() {
    if (publicIndex) return Promise.resolve(publicIndex);
    return LM.loadModule("data/search-index.js").then(function () {
      publicIndex = S().prepare((LM.SEARCH_INDEX && LM.SEARCH_INDEX.records) || []);
      return publicIndex;
    }, function () { publicIndex = []; return publicIndex; });
  }

  /** Notes and mistake log of the active profile as records (built on every open). */
  function privateRecords() {
    const pd = LM.profileData;
    if (!pd || !LM.app.getActiveProfile()) return [];
    const out = [];
    pd.noteList().forEach(function (n) {
      out.push({ id: "note:" + n.key, group: "notes", title: n.title || "Note", headings: [], summary: "", text: n.text, route: n.route || "#/notes" });
    });
    pd.entries().forEach(function (e) {
      out.push({ id: "err:" + e.id, group: "journal", title: e.context.split("\n")[0].slice(0, 90), headings: [], summary: e.correct, text: [e.context, e.correct, e.rule].join(" "), category: e.category, route: "#/review/mistakes" });
    });
    return out;
  }

  // ---------- Building the DOM ----------

  function build() {
    btn = el("button", { type: "button", class: "icon-btn search-btn", id: "search-btn", "aria-label": "Search (shortcut: /)", "data-tooltip": "Search ( / )", "aria-expanded": "false", "aria-controls": "search-panel", onclick: function () { toggle("button"); } }, LM.icon("search", { size: 20 }));
    const theme = document.getElementById("theme-btn");
    if (theme && theme.parentNode) theme.parentNode.insertBefore(btn, theme);

    input = el("input", {
      type: "text", id: "search-input", class: "search-input", role: "combobox", autocomplete: "off", spellcheck: "false",
      "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "search-list", "aria-describedby": "search-status",
      placeholder: "Search: topics, tenses, practice, notes…",
      oninput: function () { clearTimeout(timer); timer = setTimeout(run, 80); },
      onkeydown: onKey
    });
    list = el("div", { id: "search-list", class: "search-list", role: "listbox", "aria-label": "Search results" });
    status = el("p", { id: "search-status", class: "search-status", role: "status", "aria-live": "polite" });
    panel = el("div", { id: "search-panel", class: "search-panel", hidden: true, role: "search" }, [
      el("div", { class: "search-bar" }, [
        el("span", { class: "search-bar-icon", "aria-hidden": "true" }, LM.icon("search", { size: 20 })),
        el("label", { class: "visually-hidden", for: "search-input", text: "Search the app" }),
        input,
        el("kbd", { class: "search-kbd", "aria-hidden": "true", text: "Esc" }),
        el("button", { type: "button", class: "icon-btn search-close", "aria-label": "Close search", onclick: function () { close(true); } }, LM.icon("x", { size: 18 }))
      ]),
      el("div", { class: "search-body" }, [status, list])
    ]);
    panel.addEventListener("mouseleave", function () {
      if (openedBy !== "hover" || input.value.trim()) return;
      leaveTimer = setTimeout(function () { if (!panel.contains(document.activeElement) || !input.value.trim()) close(false); }, 350);
    });
    panel.addEventListener("mouseenter", function () { clearTimeout(leaveTimer); });
    document.body.appendChild(panel);

    // Hover band at the top edge of the content (mouse only)
    const main = document.getElementById("main");
    if (main && window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hoverZone = el("div", { class: "search-hover-zone", "aria-hidden": "true" });
      document.body.appendChild(hoverZone);
      // Band: the middle 50% of the content area (without the left panel and the buttons on the right)
      const place = function () {
        const r = main.getBoundingClientRect();
        hoverZone.style.left = Math.round(r.left + r.width * 0.25) + "px";
        hoverZone.style.width = Math.round(r.width * 0.5) + "px";
      };
      place();
      window.addEventListener("resize", place);
      if (window.ResizeObserver) new ResizeObserver(place).observe(main);
      hoverZone.addEventListener("mouseenter", function () {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(function () { if (panel.hidden) open("hover"); }, HOVER_DELAY);
      });
      hoverZone.addEventListener("mouseleave", function () { clearTimeout(hoverTimer); });
    }

    document.addEventListener("keydown", function (e) {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); toggle("key"); return; }
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && !document.querySelector("dialog[open], .dialog-backdrop:not([hidden])")) {
        e.preventDefault(); open("key");
      }
    });
    document.addEventListener("pointerdown", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(false);
    });
    window.addEventListener("hashchange", function () { if (!panel.hidden) close(false); });
  }

  // ---------- Opening and closing ----------

  function open(by) {
    if (!panel.hidden) { input.focus(); return; }
    openedBy = by;
    returnFocus = by === "hover" ? null : document.activeElement;
    expanded = {};
    panel.hidden = false;
    panel.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-expanded", "true");
    input.value = "";
    input.focus();
    status.textContent = "Loading the index…";
    loadIndex().then(function (pub) {
      index = pub.concat(S().prepare(privateRecords()));
      run();
    });
  }

  function close(restore) {
    clearTimeout(timer); clearTimeout(leaveTimer);
    panel.hidden = true;
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (restore !== false && returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function toggle(by) { if (panel.hidden) open(by); else close(true); }

  // ---------- Results ----------

  let optSeq = 0;

  function option(kind, data, children, extraClass) {
    const id = "search-opt-" + (++optSeq);
    const node = el("div", { id: id, class: "search-opt" + (extraClass ? " " + extraClass : ""), role: "option", "aria-selected": "false",
      onmousedown: function (e) { e.preventDefault(); }, // focus stays in the field
      onclick: function () { activate(options.findIndex(function (o) { return o.node === node; })); }
    }, children);
    options.push({ node: node, kind: kind, data: data });
    return node;
  }

  function marked(parts) {
    return parts.map(function (p) { return p.hit ? el("mark", { text: p.text }) : document.createTextNode(p.text); });
  }

  function group(title, nodes) {
    const id = "search-g-" + (++optSeq);
    return el("div", { class: "search-group", role: "group", "aria-labelledby": id }, [
      el("div", { class: "search-group-title", id: id, role: "presentation", text: title })
    ].concat(nodes));
  }

  function run() {
    if (!index) return;
    const q = input.value.trim();
    options = [];
    active = -1;
    input.removeAttribute("aria-activedescendant");
    list.replaceChildren();
    if (!q) return renderStart();
    const res = S().search(index, q, { groups: GROUPS, limit: 5, expanded: expanded });
    if (!res.total) {
      status.textContent = "";
      list.appendChild(el("div", { class: "search-empty", role: "presentation" }, [
        LM.ui.emptyState({ art: "no-results", title: "No results", class: "es-inline" }),
        el("p", { class: "search-empty-title", text: "Nothing found for “" + q + "”." }),
        el("p", { class: "tool-note", text: "Try a shorter word, or leave out the accents. Practice for every topic is on the Practice page." }),
        el("p", null, el("a", { class: "btn btn-secondary btn-small", href: "#/practice", onclick: function () { close(false); } }, LM.ui.withIcon("dumbbell", "Go to Practice")))
      ]));
      status.textContent = "No results.";
      return;
    }
    res.groups.forEach(function (g) {
      const nodes = g.results.map(function (h) {
        const r = h.record;
        const meta = [r.level, r.category].filter(Boolean).join(" · ");
        const snip = r.summary && S().snippet(r.summary, q).some(function (p) { return p.hit; }) ? S().snippet(r.summary, q) : S().snippet(r.text, q);
        return option("result", { route: r.route, anchor: h.anchor, query: q }, [
          el("span", { class: "search-opt-title" }, marked(S().highlight(r.title, q))),
          meta || h.anchor ? el("span", { class: "search-opt-meta" }, [meta, h.anchor ? (meta ? " · " : "") + "“" + h.anchor + "”" : ""].join("")) : null,
          el("span", { class: "search-opt-snippet" }, marked(snip))
        ]);
      });
      if (g.total > g.results.length) {
        nodes.push(option("more", { group: g.group }, [el("span", { class: "search-opt-more", text: "Show more (" + (g.total - g.results.length) + ")" })], "is-more"));
      }
      list.appendChild(group(GROUP_LABEL[g.group] || g.group, nodes));
    });
    status.textContent = LM.plural(res.total, "result") + ". Arrows choose, Enter opens.";
    move(0);
  }

  function renderStart() {
    const rec = recent();
    if (rec.length) {
      list.appendChild(group("Recent searches", rec.map(function (q) {
        return option("query", { query: q }, [el("span", { class: "search-opt-title" }, [LM.icon("clock", { size: 16 }), " " + q])]);
      })));
    }
    list.appendChild(group("Shortcuts", SHORTCUTS.map(function (s) {
      return option("result", { route: s.route }, [el("span", { class: "search-opt-title" }, [LM.icon(s.icon, { size: 16 }), " " + s.title])]);
    })));
    status.textContent = "Type a word – accents are optional.";
  }


  function move(i) {
    if (!options.length) return;
    if (active >= 0 && options[active]) { options[active].node.classList.remove("is-active"); options[active].node.setAttribute("aria-selected", "false"); }
    active = (i + options.length) % options.length;
    const o = options[active].node;
    o.classList.add("is-active");
    o.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", o.id);
    o.scrollIntoView({ block: "nearest" });
  }

  function activate(i) {
    const o = options[i];
    if (!o) return;
    if (o.kind === "more") { expanded[o.data.group] = true; run(); return; }
    if (o.kind === "query") { input.value = o.data.query; run(); return; }
    if (o.data.query) saveRecent(o.data.query);
    close(false);
    const target = o.data.route;
    const anchor = o.data.anchor;
    if (location.hash === target) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = target;
    if (anchor) setTimeout(function () { scrollToHeading(anchor); }, 250);
    else setTimeout(function () { const m = document.getElementById("main"); if (m) m.focus({ preventScroll: true }); }, 50);
  }

  /** Scrolls to the heading with the given text (a result that matched in a heading). */
  function scrollToHeading(text) {
    const want = S().fold(text).trim();
    const h = Array.prototype.find.call(document.querySelectorAll("#view h2, #view h3, #view p.md-subhead"), function (n) {
      return S().fold(n.textContent).trim().indexOf(want) !== -1;
    });
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
    else if (e.key === "Enter") { e.preventDefault(); activate(active >= 0 ? active : 0); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") { close(false); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();

  LM.search = { open: open, close: close, clearRecent: clearRecent };
})(window.LM);
