/*
 * writing-trainer.js — the shared writing-trainer engine. Every exam from the registry creates a trainer
 * with its own config (js/exam-core.js builds it from the exam's trainer data):
 *
 *   LM.writingTrainer.create(cfg) → { render(view, taskId) → title | null }
 *
 * cfg:
 *   trainer()               the trainer data (training/writing.json)
 *   section()               { label } of the trainer section from the manifest (or null)
 *   crumb(label), notFound(msg)
 *   href(taskId?)           address of the list (without taskId) / of a task
 *   drafts(), save()        drafts object { taskId: text } and saving
 *   countWords(text, task)  the counter
 *   counter(n, T)           { cls, hint } — color and hint of the counter
 *   wordsLabel(n)
 *   listTitle, listLead(T)  heading and intro of the task list
 *   chips(task, T)          task labels (Part, genre, word range)
 *   genrePage(task)         { href, label } of the page about the genre, or null
 *   timerKey(task)          timer key (timer() below, shared by all trainers)
 *   timerNote               optional hint next to the timer
 *   examExtras              true → exams from the registry: given opening, bullet points to tick,
 *                           self-assessment by criteria (rubric), model answer next to the text
 *   rubricNotes             extra notes under the self-assessment (scoring rules of the exam)
 *   lowScope                what is assessed below warnBelow, e.g. "the content"
 *   lowNote(n, T)           optional: own note in the self-assessment below warnBelow (instead of lowScope)
 *   partGroups(T)           optional: [{ label, tasks }] — the task list in groups (e.g. Part 1 / Part 2)
 *   modelHref(task)         optional: address of the model with comments (#/writing/models/…) — link in a task with modelNotes
 *   examId                  exam id from the registry — the phrase level in the "Phrases" panel
 *   choices()               optional: object { group: taskId } — choice of one of two tasks
 *                           (tasks with choiceGroup, group description in T.choiceGroups)
 * The draft saves itself; the text field has no spell check (as in the exam).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  /** Copying to the clipboard (with a fallback for older browsers / file://). */
  function copyText(text, status) {
    function fallback() {
      const tmp = el("textarea", { value: text });
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      tmp.remove();
      status.textContent = ok ? "Copied" : "Could not copy – select the text and press Ctrl+C";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status.textContent = "Copied"; }, fallback);
    } else {
      fallback();
    }
  }

  function checkGroup(title, items) {
    if (!items || !items.length) return null;
    return el("div", { class: "c1-check-group" }, [
      el("h3", { class: "c1-check-title", text: title }),
      el("ul", { class: "task-list" }, items.map(function (text) {
        return el("li", { class: "task-item" }, el("label", null, [el("input", { type: "checkbox" }), el("span", { text: text })]));
      }))
    ]);
  }

  function create(cfg) {

    // ---------- Choice groups (one of two tasks) ----------

    function groupOf(T, task) { return cfg.choices && T.choiceGroups && task.choiceGroup && T.choiceGroups[task.choiceGroup] ? task.choiceGroup : null; }
    function groupTasks(T, g) { return T.tasks.filter(function (t) { return t.choiceGroup === g; }); }
    /** The chosen task of a group (existing ones only), or null. */
    function chosenIn(T, g) {
      const id = cfg.choices()[g];
      return groupTasks(T, g).find(function (t) { return t.id === id; }) || null;
    }
    /** The choice can change while the draft of the chosen task is empty. */
    function canChange(T, g) {
      const cur = chosenIn(T, g);
      return !cur || !cfg.countWords(cfg.drafts()[cur.id], cur);
    }
    function choose(g, taskId) { cfg.choices()[g] = taskId; cfg.save(); }

    /** Group description without a repeated heading ("Choose one of the two tasks: essay or letter" → "Essay or letter"). */
    function groupDesc(text) {
      const t = String(text || "").replace(/^\s*Choose one of the two tasks\s*[:–-]?\s*/i, "");
      return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
    }

    function groupCard(T, g) {
      const drafts = cfg.drafts();
      const cur = chosenIn(T, g);
      const change = canChange(T, g);
      const titleId = "wt-choice-" + g;
      return el("section", { class: "card wt-choice", "aria-labelledby": titleId }, [
        el("h2", { class: "wt-choice-title", id: titleId, text: "Choose one of the two tasks" }),
        groupDesc(T.choiceGroups[g]) ? el("p", { class: "wt-choice-desc", text: groupDesc(T.choiceGroups[g]) }) : null,
        el("div", { class: "wt-choice-options" }, groupTasks(T, g).map(function (task) {
          const words = cfg.countWords(drafts[task.id], task);
          const isCur = cur && cur.id === task.id;
          let action;
          if (isCur) {
            action = el("a", { class: "btn btn-primary", href: cfg.href(task.id) }, [words ? "Keep writing" : "Start writing", LM.icon("chevron-right", { size: 18 })]);
          } else if (change) {
            action = el("button", {
              type: "button", class: "btn btn-secondary",
              onclick: function () { choose(g, task.id); location.hash = cfg.href(task.id); }
            }, cur ? "Switch to this task" : "Choose this task");
          } else {
            action = el("p", { class: "wt-choice-locked", text: "To change your choice, clear the draft of the chosen task." });
          }
          return el("article", { class: "wt-choice-option" + (isCur ? " is-chosen" : cur ? " is-other" : "") }, [
            el("span", { class: "c1-chips" }, cfg.chips(task, T, true).map(function (c) { return el("span", { class: "c1-chip", text: c }); })
              .concat(isCur ? [el("span", { class: "c1-chip wt-choice-badge", text: "Your choice" })] : [])),
            el("h3", { class: "wt-choice-task", text: task.title }),
            el("p", { class: "wt-choice-prompt", text: task.prompt }),
            el("p", { class: "c1-set-card-best" + (words ? " has-score" : ""), text: words ? "Draft: " + cfg.wordsLabel(words) : "New task" }),
            action
          ]);
        }))
      ]);
    }

    function renderList(view, T, sectionLabel) {
      const drafts = cfg.drafts();
      view.appendChild(cfg.crumb(sectionLabel));
      view.appendChild(el("h1", { class: "c1-title", text: cfg.listTitle }));
      view.appendChild(el("p", { class: "c1-lead", text: cfg.listLead(T) }));
      // Choice groups in the order of their first task; the other tasks as before (a grid of cards)
      const groups = [];
      T.tasks.forEach(function (t) { const g = groupOf(T, t); if (g && groups.indexOf(g) === -1) groups.push(g); });
      groups.forEach(function (g) { view.appendChild(groupCard(T, g)); });
      const rest = T.tasks.filter(function (t) { return !groupOf(T, t); });
      if (!rest.length) return;
      function grid(tasks) {
        return el("div", { class: "c1-set-grid" }, tasks.map(function (task) {
          const words = cfg.countWords(drafts[task.id], task);
          return el("a", { class: "card c1-set-card", href: cfg.href(task.id) }, [
            el("span", { class: "c1-chips" }, cfg.chips(task, T, true).map(function (c) { return el("span", { class: "c1-chip", text: c }); })),
            el("span", { class: "c1-set-card-title", text: task.title }),
            el("span", { class: "c1-set-card-best" + (words ? " has-score" : ""), text: words ? "Draft: " + cfg.wordsLabel(words) : "New task" })
          ]);
        }));
      }
      // Part groups (e.g. Part 1, Part 2 – one of several tasks); without config — one grid
      const parts = cfg.partGroups ? cfg.partGroups(T, rest) : null;
      if (!parts) { view.appendChild(grid(rest)); return; }
      parts.forEach(function (g) {
        if (!g.tasks.length) return;
        view.appendChild(el("h2", { class: "section-title wt-part-title", text: g.label }));
        if (g.note) view.appendChild(el("p", { class: "tool-note wt-part-note", text: g.note }));
        view.appendChild(grid(g.tasks));
      });
    }

    /** A task of a group where another task was chosen: instead of the editor — a note and a way to change the choice. */
    function renderOtherChoice(view, T, task, g, cur) {
      const change = canChange(T, g);
      view.appendChild(el("section", { class: "card wt-choice wt-choice-note", "aria-label": "Task choice" }, [
        el("p", null, ["In this group you have already chosen ", el("a", { href: cfg.href(cur.id) }, cur.title), ". In the exam you write only one of the two."]),
        change
          ? el("button", { type: "button", class: "btn btn-primary", onclick: function () {
              choose(g, task.id);
              view.replaceChildren();
              renderTask(view, T, task, cfg.section().label);
              const h = view.querySelector("h1"); if (h) { h.tabIndex = -1; h.focus(); }
            } }, "Switch to this task")
          : el("p", { class: "wt-choice-locked", text: "To change your choice, clear the draft of the chosen task." })
      ]));
    }

    function renderTask(view, T, task, sectionLabel) {
      const drafts = cfg.drafts();
      let saveTimer = null;

      view.appendChild(cfg.crumb(sectionLabel));

      view.appendChild(el("h1", { class: "c1-title", text: task.title }));
      view.appendChild(el("p", { class: "c1-chips" }, cfg.chips(task, T, false).map(function (c) { return el("span", { class: "c1-chip", text: c }); })));

      // The prompt — paragraphs kept (white-space: pre-wrap)
      view.appendChild(el("section", { class: "card c1-prompt", "aria-label": "Task" }, el("p", { class: "c1-prompt-text", text: task.prompt })));

      // Choice group: another task chosen → no editor; no choice yet → the first saved text chooses
      const group = groupOf(T, task);
      if (group) {
        const cur = chosenIn(T, group);
        if (cur && cur.id !== task.id) { renderOtherChoice(view, T, task, group, cur); return; }
        view.appendChild(el("p", { class: "tool-note wt-note" }, [LM.icon("info", { size: 16 }),
          cur ? " This is your choice in this group. You can change it in the task list while the draft is empty."
              : " In the exam you choose one of the two tasks. Starting to write chooses this task."]));
      }

      // Bullet points to tick while writing
      if (cfg.examExtras && task.bullets && task.bullets.length) {
        view.appendChild(el("section", { class: "card wt-bullets", "aria-labelledby": "wt-bullets-title" }, [
          el("h2", { class: "c1-check-title", id: "wt-bullets-title", text: "Points of the task – tick them when they are in your text" }),
          el("ul", { class: "task-list" }, task.bullets.map(function (b) {
            return el("li", { class: "task-item" }, el("label", null, [el("input", { type: "checkbox" }), el("span", { text: b })]));
          }))
        ]));
      }

      // Word counter
      const counter = el("span", { class: "c1-words", "aria-live": "polite" });
      function paintCounter(text) {
        const n = cfg.countWords(text, task);
        const c = cfg.counter(n, T);
        counter.className = "c1-words " + c.cls;
        counter.replaceChildren(el("strong", { text: cfg.wordsLabel(n) }), el("span", { class: "c1-words-hint", text: String(c.hint || "").replace(/^\s*·\s*/, "") })); // the hint on its own line of fixed height (the bar does not change height while typing)
      }

      const area = el("textarea", {
        class: "field c1-writing-area",
        rows: 18,
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        autocomplete: "off",
        "aria-label": "Your text",
        value: drafts[task.id] || "",
        oninput: function () {
          paintCounter(area.value);
          clearTimeout(saveTimer);
          saveTimer = setTimeout(function () {
            drafts[task.id] = area.value;
            if (group && !chosenIn(T, group) && area.value.trim()) cfg.choices()[group] = task.id;
            cfg.save();
            saved.textContent = "Draft saved";
          }, 400);
          saved.textContent = "Saving…";
        }
      });
      const saved = el("span", { class: "c1-saved", "aria-live": "polite", text: drafts[task.id] ? "Draft saved" : "" });
      paintCounter(area.value);

      const phrasesBtn = task.genre ? el("button", { type: "button", class: "btn btn-secondary btn-small zw-open", "aria-expanded": "false", "aria-controls": "zw-panel",
        onclick: function () { togglePhrases(); } }, LM.ui.withIcon("notebook-text", "Phrases")) : null;
      view.appendChild(el("div", { class: "c1-writing-bar" }, [
        timer({ key: cfg.timerKey(task), seconds: T.timeMinutes * 60, label: "Time", exam: true }),
        counter,
        phrasesBtn
      ]));
      if (cfg.timerNote) view.appendChild(el("p", { class: "tool-note wt-note" }, [LM.icon("info", { size: 16 }), " " + cfg.timerNote]));
      // Given opening (does not count toward the limit)
      if (cfg.examExtras && task.opening) {
        view.appendChild(el("p", { class: "wt-opening" }, [el("span", { class: "review-label", text: "Given opening (does not count toward the limit): " }), el("strong", { text: task.opening })]));
      }
      view.appendChild(area);

      // "Phrases" panel: phrases from the bank for the task genre and the exam level; "Insert" at the cursor
      let panel = null;
      function insertPhrase(raw) {
        const text = LM.writingPhrases.plain(raw);
        const start = area.selectionStart, end = area.selectionEnd, v = area.value;
        const before = start > 0 ? v.charAt(start - 1) : "";
        const after = end < v.length ? v.charAt(end) : "";
        const ins = (before && !/\s/.test(before) ? " " : "") + text + (after && /\s|[.,;:!?)]/.test(after) ? "" : " ");
        area.focus();
        let done = false;
        try { done = document.execCommand("insertText", false, ins); } catch (e) { done = false; } // keeps the undo history (Ctrl+Z)
        if (!done || area.value === v) {
          area.setRangeText(ins, start, end, "end");
          area.dispatchEvent(new Event("input", { bubbles: true }));
        }
        area.focus();
      }
      function closePhrases() {
        if (panel) panel.hidden = true;
        if (phrasesBtn) phrasesBtn.setAttribute("aria-expanded", "false");
        area.focus();
      }
      function fillPhrases(body) {
        const rows = LM.writingPhrases.forTrainer(task.genre, cfg.examId);
        body.replaceChildren();
        if (!rows.length) { body.appendChild(el("p", { class: "tool-note", text: "No phrases for this genre." })); return; }
        rows.forEach(function (r) {
          body.appendChild(el("h3", { class: "zw-panel-group", text: r.group.label }));
          body.appendChild(el("ul", { class: "zw-panel-list" }, r.phrases.map(function (p) {
            return el("li", { class: "zw-panel-item" }, [
              el("div", null, [
                el("p", { class: "zw-panel-en", lang: "en", text: p.en }),
                el("p", { class: "zw-panel-pl", text: p.pl + " · " + p.level })
              ]),
              el("button", { type: "button", class: "btn btn-secondary btn-small", "aria-label": "Insert: " + LM.writingPhrases.plain(p.en), onclick: function () { insertPhrase(p.en); } }, "Insert")
            ]);
          })));
        });
      }
      function togglePhrases() {
        if (!panel) {
          const body = el("div", { class: "zw-panel-body" }, el("p", { class: "tool-note", role: "status", text: "Loading phrases…" }));
          panel = el("aside", { class: "zw-panel", id: "zw-panel", role: "complementary", "aria-label": "Phrases to insert", hidden: true,
            onkeydown: function (ev) { if (ev.key === "Escape") { ev.stopPropagation(); closePhrases(); } } }, [
            el("div", { class: "zw-panel-head" }, [
              el("h2", { class: "zw-panel-title", text: "Phrases" }),
              el("button", { type: "button", class: "btn btn-link btn-small", "aria-label": "Close the phrases panel", onclick: closePhrases }, LM.ui.withIcon("x", "Close"))
            ]),
            body,
            el("p", { class: "tool-note zw-panel-foot" }, el("a", { href: LM.writing.HASH + "/phrases", text: "The whole phrase bank" }))
          ]);
          view.appendChild(panel);
          LM.loadModule("js/writing-phrases.js").then(function () { return LM.writingPhrases.load(); }).then(function () { fillPhrases(body); }, function () {
            body.replaceChildren(el("p", { class: "tool-note", text: "Could not load the phrases. Reload the page." }));
          });
        }
        const open = panel.hidden;
        panel.hidden = !open;
        phrasesBtn.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) { const b = panel.querySelector("button"); if (b) b.focus(); } else area.focus();
      }

      const checklist = el("section", { class: "card c1-checklist", hidden: true, "aria-label": "Checklist" });

      view.appendChild(el("div", { class: "c1-writing-actions" }, [
        el("button", {
          type: "button",
          class: "btn btn-primary",
          onclick: function () {
            drafts[task.id] = area.value;
            if (group && !chosenIn(T, group) && area.value.trim()) cfg.choices()[group] = task.id;
            cfg.save();
            if (LM.markActivity) LM.markActivity(); // a finished trainer session = a study day
            fillChecklist();
            checklist.hidden = false;
            checklist.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, "I'm done"),
        el("button", {
          type: "button",
          class: "btn btn-danger",
          onclick: function () {
            LM.dialogs.confirm({
              title: "Clear the draft?",
              message: "The text of this task will be removed from this browser.",
              confirmLabel: "Clear"
            }).then(function (ok) {
              if (!ok) return;
              area.value = "";
              delete drafts[task.id];
              cfg.save();
              paintCounter("");
              saved.textContent = "";
              checklist.hidden = true;
            });
          }
        }, "Clear the draft"),
        saved
      ]));
      view.appendChild(checklist);

      function fillChecklist() {
        const n = cfg.countWords(area.value, task);
        const page = cfg.genrePage(task);
        const copyStatus = el("span", { class: "c1-saved", "aria-live": "polite" });
        checklist.replaceChildren();
        U.appendChildren(checklist, [
          el("h2", { class: "section-title", text: "Check before you hand it in" }),
          el("p", { class: "c1-lead", text: "Your text: " + cfg.wordsLabel(n) + ". Tick what is fine – the rest is what to improve." }),
          cfg.examExtras ? null : checkGroup("Points of the task", task.points),
          cfg.examExtras ? checkGroup("Points of the task", task.bullets) : null,
          checkGroup(cfg.genreTitle ? cfg.genreTitle(task) : "Genre", task.genreChecklist),
          checkGroup("General", T.genericChecklist),
          cfg.examExtras && T.rubric ? rubric(T, n) : null,
          cfg.examExtras && task.model ? compare(area.value, task) : null,
          el("div", { class: "c1-writing-actions" }, [
            cfg.modelHref && task.modelNotes ? el("a", { class: "btn btn-primary", href: cfg.modelHref(task) }, LM.ui.withIcon("pencil", "Model answer with comments")) : null,
            page ? el("a", { class: "btn btn-secondary", href: page.href }, ["More about the genre: " + page.label, LM.icon("chevron-right", { size: 18 })]) : null,
            el("button", { type: "button", class: "btn btn-secondary", onclick: function () { copyText(area.value, copyStatus); } }, "Copy the text"),
            copyStatus
          ])
        ]);
      }
    }

    /** Self-assessment by criteria (from the rubric) with the word-limit rules. */
    function rubric(T, n) {
      const total = el("strong", { class: "num" });
      const selects = [];
      const max = T.rubric.reduce(function (s, r) { return s + r.max; }, 0);
      function sum() {
        let s = 0;
        selects.forEach(function (x) { s += Number(x.value); });
        total.textContent = s + " / " + max;
      }
      const rows = T.rubric.map(function (r) {
        const id = "wt-rub-" + r.id;
        const sel = el("select", { class: "field wt-rub-select", id: id, onchange: sum }, Array.from({ length: r.max + 1 }, function (_, i) { return el("option", { value: String(i), text: String(i) }); }));
        selects.push(sel);
        return el("div", { class: "wt-rub-row" }, [el("label", { class: "wt-rub-label", for: id, text: r.label + " (0–" + r.max + ")" }), sel]);
      });
      sum();
      const notes = [];
      if (T.warnBelow && n < T.warnBelow) notes.push(cfg.lowNote ? cfg.lowNote(n, T) : "You have fewer than " + T.warnBelow + " words – then only " + (cfg.lowScope || "the content") + " is assessed.");
      (cfg.rubricNotes || []).forEach(function (t) { notes.push(t); }); // scoring rules of the exam
      return el("div", { class: "c1-check-group wt-rubric" }, [
        el("h3", { class: "c1-check-title", text: "Self-assessment by criteria" }),
        el("div", { class: "wt-rub-rows" }, rows),
        el("p", { class: "wt-rub-total" }, ["Total: ", total]),
        el("ul", { class: "wt-rub-notes" }, notes.map(function (t) { return el("li", { text: t }); }))
      ]);
    }

    /** The user's text next to the model answer. */
    function compare(text, task) {
      return el("div", { class: "c1-check-group wt-compare" }, [
        el("h3", { class: "c1-check-title", text: "Compare with the model" }),
        el("div", { class: "wt-compare-cols" }, [
          el("figure", { class: "wt-col" }, [el("figcaption", { text: "Your text" }), el("p", { class: "wt-text", lang: "en", text: (task.opening ? task.opening + "\n" : "") + (text || "(empty)") })]),
          el("figure", { class: "wt-col is-model" }, [el("figcaption", { text: "Model answer (" + cfg.wordsLabel(cfg.countWords(task.model, task)) + ")" }), el("p", { class: "wt-text", lang: "en", text: task.model })])
        ]),
        el("p", { class: "tool-note", text: "The model is one possible answer. Check that your text covers all the " + (task.bullets && task.bullets.length ? "points" : "parts of the task") + " and has a similar length." })
      ]);
    }

    function render(view, taskId) {
      const T = cfg.trainer();
      const found = cfg.section();
      if (!T || !found) { view.appendChild(cfg.notFound("The writing trainer data is missing.")); return null; }
      if (!taskId) { renderList(view, T, found.label); return cfg.listTitle; }
      const task = T.tasks.find(function (t) { return t.id === taskId; });
      if (!task) { view.appendChild(cfg.notFound("There is no such task.")); return null; }
      renderTask(view, T, task, found.label);
      return task.title;
    }

    return { render: render };
  }

  // =====================================================================
  // EXAM TIMER (moved from the dropped js/c1-core.js; html.focus-mode while it runs)
  // =====================================================================

  const timers = {};
  let ticker = null;

  function timerState(key, seconds) {
    if (!timers[key] || timers[key].total !== seconds) {
      timers[key] = { total: seconds, remaining: seconds, running: false, endAt: 0, view: null };
    }
    return timers[key];
  }

  function formatTime(t, exam) {
    const r = Math.max(0, t.remaining);
    const mmss = Math.floor(r / 60) + ":" + String(r % 60).padStart(2, "0");
    if (exam && r > 300) return Math.ceil(r / 60) + " min";
    return mmss;
  }

  function paint(t) {
    const v = t.view;
    if (!v) return; // (we also draw before the element is on the page)
    v.display.textContent = t.remaining <= 0 ? "Time is up" : formatTime(t, v.exam);
    const dangerFrom = v.exam ? 60 : 10;
    v.root.classList.toggle("is-danger", t.remaining > 0 && t.remaining <= dangerFrom);
    v.root.classList.toggle("is-over", t.remaining <= 0);
    v.root.classList.toggle("is-running", t.running);
    v.toggle.textContent = t.running ? "Pause" : (t.remaining < t.total && t.remaining > 0 ? "Resume" : "Start");
    v.toggle.disabled = t.remaining <= 0;
    updateFocus();
  }

  /** Focus mode (html.focus-mode): the rest of the interface dims while a timer runs on screen. */
  function updateFocus() {
    const any = Object.keys(timers).some(function (k) {
      const t = timers[k];
      return t.running && t.view && document.contains(t.view.root);
    });
    document.documentElement.classList.toggle("focus-mode", any);
  }

  function tick() {
    let any = false;
    Object.keys(timers).forEach(function (key) {
      const t = timers[key];
      if (!t.running) return;
      t.remaining = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
      if (t.remaining <= 0) {
        t.running = false;
        // The timer counted down to the end (writing / speaking trainer) = a finished session
        if (LM.markActivity) LM.markActivity();
      } else any = true;
      paint(t);
    });
    if (!any && ticker) { clearInterval(ticker); ticker = null; }
  }

  /** The timer element. opts: key, seconds, label, exam. */
  function timer(opts) {
    const t = timerState(opts.key, opts.seconds);
    const display = el("span", { class: "c1-timer-display", role: "timer", "aria-label": opts.label });
    const toggle = el("button", {
      type: "button",
      class: "btn btn-primary btn-small",
      onclick: function () {
        if (t.running) {
          t.remaining = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
          t.running = false;
        } else if (t.remaining > 0) {
          t.endAt = Date.now() + t.remaining * 1000;
          t.running = true;
          if (!ticker) ticker = setInterval(tick, 250);
        }
        paint(t);
      }
    }, "Start");
    const reset = el("button", {
      type: "button",
      class: "btn btn-secondary btn-small",
      onclick: function () { t.running = false; t.remaining = t.total; paint(t); }
    }, "Reset");
    const root = el("div", { class: "c1-timer" + (opts.exam ? " is-exam" : "") }, [
      opts.label ? el("span", { class: "c1-timer-label", text: opts.label }) : null,
      display,
      el("span", { class: "c1-timer-buttons" }, [toggle, reset])
    ]);
    t.view = { root: root, display: display, toggle: toggle, exam: !!opts.exam };
    if (t.running && !ticker) ticker = setInterval(tick, 250);
    paint(t);
    return root;
  }

  LM.writingTrainer = { create: create, copyText: copyText };
})(window.LM);
