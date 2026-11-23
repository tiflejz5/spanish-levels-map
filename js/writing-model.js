/*
 * writing-model.js — the view of a model answer with comments:
 * #/writing/models/<exam>/<task id>.
 *
 *   - computer (≥ 1024 px): text in a ~65-character column, comments in the right margin level with their anchors
 *     (on a collision they move down; a thin line joins them to the anchor),
 *   - narrower screens: an anchor with a number; a tap opens the comment under the paragraph, a second tap closes it,
 *   - the type color is never the only carrier: a number in a circle + the type icon and name in the comment,
 *   - type filters, "Hide comments", a legend; under the text "Why this works" and a criteria table,
 *   - keyboard: Tab through the anchors, Enter / Space shows the comment, aria-describedby joins anchor and comment,
 *   - print: comments as numbered footnotes under the text (css/print.css),
 *   - text selection: the My words menu (data-fc-selectable).
 * The model text is never changed: anchors are exact fragments (each occurs once, they do not overlap).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const WIDE = "(min-width: 1024px)";

  function P() { return LM.writing; }

  /** Anchors in order of appearance: [{ start, end, type, note, criterion, element }]; bad ones are skipped with a warning. */
  function placeAnnotations(model, list) {
    const out = [];
    (list || []).forEach(function (a) {
      const anchor = String(a.anchor || "");
      const i = anchor ? model.indexOf(anchor) : -1;
      if (i === -1 || model.indexOf(anchor, i + 1) !== -1) { console.warn("Model: the anchor “" + anchor.slice(0, 40) + "…” does not occur exactly once"); return; }
      out.push({ start: i, end: i + anchor.length, type: a.type, note: a.note || "", criterion: a.criterion, element: a.element });
    });
    out.sort(function (x, y) { return x.start - y.start; });
    return out.filter(function (a, k) { return k === 0 || a.start >= out[k - 1].end; }).map(function (a, k) { a.n = k + 1; return a; });
  }

  function typeOf(a) { return P().TYPES[a.type] || P().TYPES.improve; }

  function render(view, route) {
    document.title = "Writing · " + LM.APP.appTitle;
    const back = LM.ui.breadcrumbs([{ label: "Writing", href: P().HASH }, { label: "Model answer" }]);
    view.appendChild(back);
    const status = el("p", { class: "tool-note", role: "status", text: "Loading the model…" });
    view.appendChild(status);
    P().examList().then(function (rows) {
      if (!view.contains(status)) return;
      status.remove();
      const row = rows.find(function (r) { return r.exam.id === route.exam; });
      const task = row && row.tasks.find(function (t) { return t.id === route.task; });
      if (!task) {
        view.appendChild(P().head("There is no such model answer", "Choose a model from the list."));
        return;
      }
      build(view, row, task);
    });
  }

  function build(view, row, task) {
    const model = String(task.model);
    const notes = task.modelNotes || {};
    const anns = placeAnnotations(model, notes.annotations);
    const words = P().wordCount(row.exam.id, task);
    const T = row.T;
    document.title = (task.title || task.id) + " · Writing · " + LM.APP.appTitle;
    if (LM.profileData && LM.profileData.setLastPage) LM.profileData.setLastPage(location.hash, "Model answer: " + (task.title || task.id));

    // ----- header
    view.appendChild(P().head(task.title || task.id, null));
    view.appendChild(el("p", { class: "wz-meta" }, [
      P().examChip(row.exam),
      el("span", { class: "chip", text: P().genreLabel(task.genre) }),
      el("span", { class: "tool-note", text: LM.plural(words, "word") + (T.wordRange ? " · required " + T.wordRange[0] + "–" + T.wordRange[1] : "") })
    ]));
    view.appendChild(el("details", { class: "wz-prompt" }, [
      el("summary", { text: "Task" }),
      el("p", { class: "wz-prompt-text", lang: /^certyfikat-/.test(row.exam.id) ? "en" : null, text: task.prompt || "" })
    ]));

    // ----- filter state
    const state = { hidden: false, off: {} };

    // ----- text and comments
    const layout = el("div", { class: "wz-layout" });
    const textCol = el("div", { class: "wz-text", lang: LM.APP.targetLang, "data-fc-selectable": "" });
    const margin = el("aside", { class: "wz-margin", "aria-label": "Comments on the text" });
    const lines = model.split("\n");
    let offset = 0, k = 0;
    const paras = [];
    lines.forEach(function (line) {
      const start = offset, end = offset + line.length;
      offset = end + 1;
      if (!line.trim()) return;
      const p = el("p", { class: "wz-p" });
      let pos = start;
      while (k < anns.length && anns[k].start < end) {
        const a = anns[k];
        if (a.start > pos) p.appendChild(document.createTextNode(model.slice(pos, a.start)));
        a.anchorEl = el("span", { class: "wz-anchor wz-t-" + a.type, id: "wz-a-" + a.n, role: "button", tabindex: "0", "aria-describedby": "wz-n-" + a.n, "aria-expanded": "false",
          "data-n": String(a.n) }, [document.createTextNode(model.slice(a.start, a.end)), el("sup", { class: "wz-num", "aria-hidden": "true", text: String(a.n) })]);
        a.para = p;
        p.appendChild(a.anchorEl);
        pos = a.end;
        k++;
      }
      if (pos < end) p.appendChild(document.createTextNode(model.slice(pos, end)));
      textCol.appendChild(p);
      paras.push(p);
    });
    const rubric = {};
    (T.rubric || []).forEach(function (r) { rubric[r.id] = r; });
    anns.forEach(function (a) {
      const t = typeOf(a);
      a.noteEl = el("div", { class: "wz-note wz-t-" + a.type, id: "wz-n-" + a.n, role: "note" }, [
        el("p", { class: "wz-note-head" }, [
          el("span", { class: "wz-badge", "aria-hidden": "true", text: String(a.n) }),
          el("span", { class: "wz-note-icon", "aria-hidden": "true" }, LM.icon(t.icon, { size: 16 })),
          el("strong", { class: "wz-note-type", text: t.label }),
          a.criterion && rubric[a.criterion] ? el("span", { class: "wz-note-crit", text: rubric[a.criterion].label }) : null,
          a.element ? el("span", { class: "wz-note-crit", text: "Point " + a.element }) : null
        ]),
        el("p", { class: "wz-note-text", text: a.note })
      ]);
    });
    layout.appendChild(textCol);
    layout.appendChild(margin);
    const lines_svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    lines_svg.setAttribute("class", "wz-lines");
    lines_svg.setAttribute("aria-hidden", "true");
    layout.appendChild(lines_svg);

    // ----- filter bar
    const counts = {};
    anns.forEach(function (a) { counts[a.type] = (counts[a.type] || 0) + 1; });
    const typeButtons = P().TYPE_ORDER.filter(function (t) { return counts[t]; }).map(function (t) {
      const def = P().TYPES[t];
      const b = el("button", { type: "button", class: "wz-filter wz-t-" + t, "aria-pressed": "true", title: def.help, onclick: function () {
        state.off[t] = !state.off[t];
        b.setAttribute("aria-pressed", state.off[t] ? "false" : "true");
        apply();
      } }, [el("span", { class: "wz-note-icon", "aria-hidden": "true" }, LM.icon(def.icon, { size: 16 })), " " + def.label + " ", el("span", { class: "wz-count num", text: String(counts[t]) })]);
      return b;
    });
    const hideBtn = el("button", { type: "button", class: "btn btn-secondary btn-small wz-hide", "aria-pressed": "false", onclick: function () {
      state.hidden = !state.hidden;
      hideBtn.setAttribute("aria-pressed", state.hidden ? "true" : "false");
      hideBtn.textContent = state.hidden ? "Show comments" : "Hide comments";
      apply();
    } }, "Hide comments");
    view.appendChild(el("div", { class: "wz-toolbar", role: "group", "aria-label": "Comment filters" }, [el("div", { class: "wz-filters" }, typeButtons), hideBtn]));
    view.appendChild(el("details", { class: "wz-legend" }, [
      el("summary", { text: "Legend" }),
      el("dl", null, P().TYPE_ORDER.filter(function (t) { return counts[t]; }).map(function (t) {
        const def = P().TYPES[t];
        return el("div", { class: "wz-legend-row" }, [el("dt", null, [el("span", { class: "wz-note-icon", "aria-hidden": "true" }, LM.icon(def.icon, { size: 16 })), " " + def.label]), el("dd", { text: def.help })]);
      })),
      el("p", { class: "tool-note", text: "The number at a text fragment matches the number of the comment. Color is only an extra – the icon and name also give the comment type." })
    ]));
    view.appendChild(layout);

    // ----- footnotes for print
    view.appendChild(el("section", { class: "wz-footnotes", "aria-hidden": "true" }, [
      el("h2", { text: "Comments" }),
      el("ol", null, anns.map(function (a) { return el("li", { value: String(a.n) }, [el("strong", { text: typeOf(a).label + ": " }), a.note]); }))
    ]));

    // ----- "Why this works" and the criteria
    if ((notes.summary || []).length) {
      view.appendChild(el("section", { class: "card wz-why", "aria-labelledby": "wz-why-t" }, [
        el("h2", { class: "section-title", id: "wz-why-t", text: "Why this works" }),
        el("ul", null, notes.summary.map(function (s) { return el("li", { text: s }); }))
      ]));
    }
    if ((T.rubric || []).length) {
      view.appendChild(el("section", { class: "card wz-crit", "aria-labelledby": "wz-crit-t" }, [
        el("h2", { class: "section-title", id: "wz-crit-t", text: "Scoring criteria and number of comments" }),
        el("div", { class: "md-table-wrap" }, el("table", null, [
          el("thead", null, el("tr", null, [el("th", { text: "Criterion" }), el("th", { text: "Points" }), el("th", { text: "Comments" })])),
          el("tbody", null, T.rubric.map(function (r) {
            const n = anns.filter(function (a) { return a.criterion === r.id; }).length;
            return el("tr", null, [el("td", { text: r.label }), el("td", { class: "num", text: String(r.max) }), el("td", { class: "num", text: String(n) })]);
          }))
        ]))
      ]));
    }

    // ----- layout: margin (computer) or an accordion under the paragraph (narrower screens)
    const mq = window.matchMedia ? window.matchMedia(WIDE) : { matches: false };
    let expanded = null; // number of the open comment (narrow mode)
    let active = null;   // number of the highlighted comment (wide mode)

    function visible(a) { return !state.hidden && !state.off[a.type]; }

    function drawLines(items) {
      while (lines_svg.firstChild) lines_svg.removeChild(lines_svg.firstChild);
      const lr = layout.getBoundingClientRect();
      lines_svg.setAttribute("width", String(lr.width));
      lines_svg.setAttribute("height", String(lr.height));
      const colRight = textCol.getBoundingClientRect().right - lr.left;
      const mLeft = margin.getBoundingClientRect().left - lr.left;
      items.forEach(function (it) {
        const ar = it.a.anchorEl.getBoundingClientRect();
        const ay = ar.top + ar.height / 2 - lr.top;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M" + Math.min(colRight, ar.right - lr.left) + " " + ay + " H" + colRight + " L" + (mLeft) + " " + (it.top + 16));
        path.setAttribute("class", "wz-line wz-t-" + it.a.type + (active === it.a.n ? " is-active" : ""));
        lines_svg.appendChild(path);
      });
    }

    function place() {
      const wide = mq.matches;
      layout.classList.toggle("is-wide", wide);
      anns.forEach(function (a) {
        const show = visible(a);
        a.anchorEl.classList.toggle("is-off", !show);
        a.anchorEl.setAttribute("tabindex", show ? "0" : "-1");
        a.anchorEl.setAttribute("role", show ? "button" : "presentation");
        a.anchorEl.toggleAttribute("aria-describedby", false);
        if (show) a.anchorEl.setAttribute("aria-describedby", "wz-n-" + a.n);
        a.noteEl.hidden = !show || (!wide && expanded !== a.n);
        a.anchorEl.setAttribute("aria-expanded", wide ? "true" : (expanded === a.n && show ? "true" : "false"));
        a.noteEl.classList.toggle("is-active", wide && active === a.n);
        a.anchorEl.classList.toggle("is-active", (wide ? active : expanded) === a.n && show);
      });
      if (wide) {
        anns.forEach(function (a) { margin.appendChild(a.noteEl); });
        const lr = layout.getBoundingClientRect();
        let bottom = 0;
        const items = [];
        anns.filter(visible).forEach(function (a) {
          const ar = a.anchorEl.getBoundingClientRect();
          let top = ar.top - lr.top;
          if (top < bottom + 8) top = bottom + 8;
          a.noteEl.style.top = top + "px";
          bottom = top + a.noteEl.offsetHeight;
          items.push({ a: a, top: top });
        });
        margin.style.minHeight = bottom + "px";
        drawLines(items);
      } else {
        // under the paragraph, in anchor order
        const lastIn = new Map();
        anns.forEach(function (a) {
          const prev = lastIn.get(a.para) || a.para;
          prev.after(a.noteEl);
          lastIn.set(a.para, a.noteEl);
          a.noteEl.style.top = "";
        });
        margin.style.minHeight = "";
        while (lines_svg.firstChild) lines_svg.removeChild(lines_svg.firstChild);
      }
    }
    function apply() { place(); }

    function activate(a) {
      if (mq.matches) {
        active = active === a.n ? null : a.n;
        place();
        if (active === a.n) {
          const r = a.noteEl.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) a.noteEl.scrollIntoView({ block: "center" });
        }
      } else {
        expanded = expanded === a.n ? null : a.n;
        place();
      }
    }

    anns.forEach(function (a) {
      a.anchorEl.addEventListener("click", function (ev) {
        const sel = window.getSelection && window.getSelection();
        if (sel && !sel.isCollapsed) return; // selecting text (My words) does not toggle the comment
        ev.preventDefault();
        if (visible(a)) activate(a);
      });
      a.anchorEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (visible(a)) activate(a); }
        else if (ev.key === "Escape" && (expanded === a.n || active === a.n)) { expanded = null; active = null; place(); }
      });
      a.anchorEl.addEventListener("mouseenter", function () { if (mq.matches && visible(a)) { a.noteEl.classList.add("is-hover"); } });
      a.anchorEl.addEventListener("mouseleave", function () { a.noteEl.classList.remove("is-hover"); });
      a.noteEl.addEventListener("mouseenter", function () { a.anchorEl.classList.add("is-hover"); });
      a.noteEl.addEventListener("mouseleave", function () { a.anchorEl.classList.remove("is-hover"); });
    });

    place();
    if (mq.addEventListener) mq.addEventListener("change", place); else if (mq.addListener) mq.addListener(place);
    if (window.ResizeObserver) { const ro = new ResizeObserver(function () { place(); }); ro.observe(layout); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    window.addEventListener("beforeprint", function () { /* the footnotes are in the DOM; css/print.css hides the margin */ });
  }

  LM.writingModel = { render: render, placeAnnotations: placeAnnotations };
})(window.LM);
