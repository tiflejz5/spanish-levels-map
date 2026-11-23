/*
 * writing.js — the "Writing" section: model answers with comments.
 *
 *   #/writing                              list of models grouped by exam and genre
 *   #/writing/models/<exam>/<id>           a model with comments (view: js/writing-model.js)
 *
 * Data: tasks with a modelNotes field in the exam training data (LM.EXAMS[id].trainers
 * for exams from the registry). The model texts are never changed — the comments
 * point to exact fragments (anchors).
 *
 *   LM.writing.parseRoute(hash), render(), examList() → Promise z [{ exam, T, tasks }]
 *   LM.writing.hrefModel(examId, taskId), LM.writing.pageSection(examId) — section with links on the "Writing" pages
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/writing";

  const GENRES = { essay: "Essay", email: "Email", letter: "Letter", blog: "Blog post", forum: "Forum post",
    article: "Article", review: "Review", report: "Report", proposal: "Proposal", story: "Story" };

  const TYPES = {
    task: { label: "Task points", icon: "check", help: "Which point of the task this fragment covers." },
    linker: { label: "Linker", icon: "arrow-right", help: "A conjunction, a cohesive phrase, a link between paragraphs." },
    register: { label: "Register", icon: "user-round", help: "Formality and tone – what to avoid in this genre." },
    structure: { label: "Structure", icon: "layout-grid", help: "The role of a paragraph, the opening, the ending, a topic sentence." },
    range: { label: "Language range", icon: "sparkles", help: "A structure or vocabulary that raises the score." },
    improve: { label: "To improve", icon: "triangle-alert", help: "What could be done better." }
  };
  const TYPE_ORDER = ["task", "linker", "register", "structure", "range", "improve"];

  function reg() { return LM.EXAM_REGISTRY || { exams: [] }; }
  function genreLabel(g) { return GENRES[g] || g; }
  function hrefModel(examId, taskId) { return HASH + "/models/" + examId + "/" + taskId; }

  /** Word count of a model, the way the exam trainer counts it (without the given opening and placeholder words). */
  function wordCount(examId, task) {
    const text = String(task.model || "");
    if (LM.examLogic && LM.examLogic.countWords) return LM.examLogic.countWords(text, task.opening, task.skipWords);
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  // =====================================================================
  // DATA
  // =====================================================================

  let cache = null;

  /** Exams with a writing trainer and tasks with modelNotes: [{ exam, T, tasks }] in registry order. */
  function examList() {
    if (cache) return Promise.resolve(cache);
    const list = reg().exams.filter(function (e) { return e.status === "active"; });
    return Promise.all(list.map(function (e) {
      const load = LM.exams ? LM.exams.writingData(e) : Promise.resolve(null);
      return load.then(function (T) {
        const tasks = T && T.tasks ? T.tasks.filter(function (t) { return t.model && t.modelNotes; }) : [];
        return tasks.length ? { exam: e, T: T, tasks: tasks } : null;
      });
    })).then(function (rows) {
      cache = rows.filter(Boolean);
      return cache;
    });
  }

  /** Exam chip: the code + the full name for screen readers; the registry color as an extra. */
  function examChip(e) {
    const accent = e.accent || "var(--c1-gold)";
    return el("span", { class: "chip wz-exam", style: "--exam: " + accent }, [
      el("span", { "aria-hidden": "true", text: e.code }),
      el("span", { class: "visually-hidden", text: e.label })
    ]);
  }

  // =====================================================================
  // ROUTES
  // =====================================================================

  function parseRoute(hash) {
    const m = /^#\/writing(?:\/(.*))?$/.exec(hash || "");
    if (!m) return null;
    const p = (m[1] || "").replace(/\/+$/, "").split("/").filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (p[0] === "models" && p[1] && p[2]) return { kind: "model", exam: p[1], task: p[2] };
    if (p[0] === "phrases") return { kind: "phrases", group: p[1] || "" };
    return { kind: "list" };
  }

  // =====================================================================
  // MODEL LIST
  // =====================================================================

  function head(title, lead) {
    return LM.ui.pageHead({ eyebrow: "Learn · Writing", title: title, lead: lead });
  }

  function noteCount(task) { return ((task.modelNotes && task.modelNotes.annotations) || []).length; }

  function card(row, task) {
    const n = noteCount(task);
    const words = wordCount(row.exam.id, task);
    return el("li", { class: "card wz-card" }, [
      el("a", { class: "wz-card-link", href: hrefModel(row.exam.id, task.id) }, [
        el("span", { class: "wz-card-title", text: task.title || task.id }),
        el("span", { class: "wz-card-meta" }, [
          el("span", { class: "chip", text: genreLabel(task.genre) }),
          el("span", { class: "tool-note", text: LM.plural(words, "word") + " · " + LM.plural(n, "comment") })
        ])
      ])
    ]);
  }

  function renderList(view) {
    view.appendChild(head("Writing – model answers", "Model texts with comments in the margin: what covers the task, how linkers and register work, what raises the language range and what could be done better."));
    view.appendChild(el("p", { class: "card wz-phrases-link" }, [
      el("a", { href: HASH + "/phrases", class: "wz-card-title", text: "Phrase bank for writing" }),
      el("span", { class: "tool-note", text: " – phrases by function (opinion, counter-argument, requests…), with level, register and genre filters." })
    ]));
    const body = el("div", { class: "wz-list", "aria-live": "polite" }, el("p", { class: "tool-note", role: "status", text: "Loading models…" }));
    view.appendChild(body);
    examList().then(function (rows) {
      if (!view.contains(body)) return;
      body.replaceChildren();
      if (!rows.length) { body.appendChild(el("p", { class: "tool-note", text: "There are no model answers with comments yet." })); return; }
      body.appendChild(el("nav", { class: "chip-filter wz-jump", "aria-label": "Exams" }, rows.map(function (r) {
        return el("a", { class: "chip-btn", href: "#wz-" + r.exam.id, onclick: function (ev) { ev.preventDefault(); const t = document.getElementById("wz-" + r.exam.id); if (t) t.scrollIntoView({ block: "start" }); } }, r.exam.code);
      })));
      rows.forEach(function (r) {
        const genres = [];
        r.tasks.forEach(function (t) { if (genres.indexOf(t.genre) === -1) genres.push(t.genre); });
        body.appendChild(el("section", { class: "wz-exam-block", "aria-labelledby": "wz-" + r.exam.id }, [
          el("h2", { class: "section-title wz-exam-title", id: "wz-" + r.exam.id }, [examChip(r.exam), " " + r.exam.label]),
          genres.map(function (g) {
            return el("div", { class: "wz-genre" }, [
              el("h3", { class: "wz-genre-title", text: genreLabel(g) }),
              el("ul", { class: "wz-card-list" }, r.tasks.filter(function (t) { return t.genre === g; }).map(function (t) { return card(r, t); }))
            ]);
          })
        ]));
      });
    });
  }

  // =====================================================================
  // THE EXAM "WRITING" PAGE: section "Model answers with comments" (no editing of the .md)
  // =====================================================================

  /** Section with links to the models of an exam (or null when there are none). Fills in after the data loads. */
  function pageSection(examId) {
    const box = el("section", { class: "card wz-page-section", "aria-labelledby": "wz-ps-" + examId, hidden: true });
    examList().then(function (rows) {
      const r = rows.find(function (x) { return x.exam.id === examId; });
      if (!r) return;
      box.appendChild(el("h2", { class: "section-title", id: "wz-ps-" + examId, text: "Model answers with comments" }));
      box.appendChild(el("p", { class: "tool-note", text: "Model texts with comments in the margin – see what works in them and what could be better." }));
      box.appendChild(el("ul", { class: "wz-ps-list" }, r.tasks.map(function (t) {
        return el("li", null, [el("a", { href: hrefModel(r.exam.id, t.id), text: t.title || t.id }), el("span", { class: "tool-note", text: " · " + genreLabel(t.genre) })]);
      })));
      box.appendChild(el("p", null, el("a", { class: "btn btn-secondary btn-small", href: HASH }, "All model answers")));
      box.hidden = false;
    });
    return box;
  }

  // =====================================================================
  // VIEW
  // =====================================================================

  function render() {
    const view = document.getElementById("view");
    const route = parseRoute(location.hash) || { kind: "list" };
    view.className = "view tool-view pisanie-view";
    view.dataset.file = HASH;
    view.replaceChildren();
    const lazy = route.kind === "model" ? ["writingModel", "js/writing-model.js"] : route.kind === "phrases" ? ["writingPhrases", "js/writing-phrases.js"] : null;
    if (lazy) {
      // View modules load only on entry (fewer scripts at start)
      const draw = function () { LM[lazy[0]].render(view, route); };
      if (LM[lazy[0]]) { draw(); return; }
      view.appendChild(el("p", { class: "tool-note", role: "status", text: "Loading…" }));
      LM.loadModule(lazy[1]).then(function () {
        if (view.isConnected && LM.state.view === "writing" && !view.querySelector(".tool-head")) { view.replaceChildren(); draw(); }
      }, function (err) { console.warn(err.message); view.replaceChildren(el("p", { class: "tool-note", text: "Could not load the view. Reload the page." })); });
      return;
    }
    document.title = "Writing · " + LM.APP.appTitle;
    renderList(view);
  }

  LM.writing = {
    HASH: HASH, TYPES: TYPES, TYPE_ORDER: TYPE_ORDER, GENRES: GENRES,
    parseRoute: parseRoute, render: render, examList: examList, examChip: examChip, head: head,
    hrefModel: hrefModel, pageSection: pageSection, wordCount: wordCount, genreLabel: genreLabel
  };
})(window.LM);
