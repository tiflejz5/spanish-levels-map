/*
 * mistakes.js — the "My mistakes" tab (#/review/mistakes); the review session is shared (#/review/session, js/cards.js).
 *
 * Data: LM.profileData (key slm.journal, per profile).
 * Schedule: schedule() from js/cards-schedule.js — every entry has a card in the "My mistakes" deck (pack v8).
 * Text typed by the user goes into the page only as text.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const BASE = "#/review/mistakes";                // the "My mistakes" tab
  const REVIEW = "#/review/session?only=mistakes";  // a session with mistakes only

  function pd() { return LM.profileData; }
  function learn() { return LM.learn; }

  // List filters (kept until the page reloads)
  const filters = { status: "due", category: "", query: "", auto: false };

  // =====================================================================
  // ROUTES
  // =====================================================================

  function parseRoute(hash) {
    return /^#[/]review[/]mistakes[/]?$/.test(hash || "") ? { kind: "list" } : null;
  }

  // =====================================================================
  // HANDBOOK TOPICS (searchable choice, link in an entry)
  // =====================================================================

  let itemCache = null;

  /** All topics of the handbook: [{ id, level, title, label, href }]. */
  function allItems() {
    if (itemCache) return itemCache;
    itemCache = LM.syl.topics().map(function (t) {
      const title = LM.handbook.titleOf(t);
      return { id: t.id, level: t.level, title: title, label: t.level + " · " + title, href: LM.handbook.routeOf(t) };
    });
    return itemCache;
  }

  function findItem(id) {
    if (!id) return null;
    return allItems().find(function (it) { return it.id === id; }) || null;
  }

  function itemLink(id) {
    const item = findItem(id);
    if (!item) return null;
    return el("a", { class: "wiki-link", href: item.href }, item.label);
  }

  // =====================================================================
  // FORM (add and edit)
  // =====================================================================

  let formCounter = 0;

  function field(id, label, control, hint, required) {
    return el("div", { class: "form-field" }, [
      el("label", { class: "field-label", for: id }, [label, required ? el("span", { class: "req", "aria-hidden": "true", text: " *" }) : null]),
      control,
      hint ? el("p", { class: "field-hint", id: id + "-hint", text: hint }) : null
    ]);
  }

  /**
   * Entry form dialog. opts:
   *   entry   — the entry being edited (or none = new)
   *   prefill — starting values of a new entry (e.g. from an exercise); nothing
   *             is saved without selecting "Save"
   * Returns Promise<entry | null>.
   */
  function openForm(opts) {
    opts = opts || {};
    const editing = opts.entry || null;
    if (!editing && opts.prefill && opts.prefill.ref) {
      const dup = pd().findDuplicate(opts.prefill.ref, opts.prefill.myAnswer);
      if (dup) {
        return LM.dialogs.alert({
          title: "This mistake is already in the log",
          message: "This item with the same answer was saved on " + LM.fmt.date(dup.createdAt) + ". You can find it in your mistake log."
        }).then(function () { return null; });
      }
    }
    const v = Object.assign({ context: "", myAnswer: "", correct: "", rule: "", source: "", category: pd().CAT_OTHER, itemId: "", ref: "" },
      editing || opts.prefill || {});
    const L = pd().LIMITS;
    const n = ++formCounter;
    const ids = function (name) { return "jf-" + n + "-" + name; };

    function area(name, max, rows) {
      const t = el("textarea", { id: ids(name), class: "field", rows: String(rows || 2), maxlength: String(max) });
      t.value = v[name] || "";
      return t;
    }

    const context = area("context", L.context, 3);
    const myAnswer = area("myAnswer", L.myAnswer, 2);
    const correct = area("correct", L.correct, 2);
    const rule = area("rule", L.rule, 2);
    const source = el("input", { id: ids("source"), class: "field", type: "text", maxlength: String(L.source), value: v.source, placeholder: "e.g. Mock test 1, part 4, question 29", autocomplete: "off" });
    const category = el("select", { id: ids("category"), class: "field" }, pd().CATEGORIES.map(function (c) {
      return el("option", { value: c, selected: c === v.category ? "selected" : null }, c);
    }));
    category.value = v.category;

    // Searchable choice of a handbook topic (input + datalist)
    const listId = ids("items");
    const datalist = el("datalist", { id: listId }, allItems().map(function (it) { return el("option", { value: it.label }); }));
    const current = findItem(v.itemId);
    const item = el("input", {
      id: ids("item"),
      class: "field",
      type: "search",
      list: listId,
      autocomplete: "off",
      placeholder: "Start typing, e.g. gustar",
      value: current ? current.label : "",
      "aria-describedby": ids("item") + "-hint"
    });

    const error = el("p", { class: "dialog-error", role: "alert" });

    const body = el("form", { class: "journal-form", novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
      field(ids("context"), "Context / question", context, null, true),
      field(ids("myAnswer"), "My answer", myAnswer),
      field(ids("correct"), "Right answer", correct, null, true),
      field(ids("rule"), "Rule / why", rule),
      el("div", { class: "form-row" }, [
        field(ids("category"), "Category", category),
        field(ids("source"), "Source", source)
      ]),
      field(ids("item"), "Handbook topic (optional)", item, "Choose from the suggestions or leave it empty."),
      datalist,
      el("p", { class: "field-hint", text: "* required field" }),
      error
    ]);

    function collect() {
      const itemText = item.value.trim();
      let itemId = "";
      if (itemText) {
        const hit = allItems().find(function (it) { return it.label === itemText; }) ||
          allItems().find(function (it) { return it.title.toLocaleLowerCase("pl") === itemText.toLocaleLowerCase("pl"); });
        if (!hit) return { error: "There is no such handbook topic. Choose one from the suggestions or clear the field.", focus: item };
        itemId = hit.id;
      }
      if (!context.value.trim()) return { error: "Type the context or the question.", focus: context };
      if (!correct.value.trim()) return { error: "Type the right answer.", focus: correct };
      return {
        fields: {
          context: context.value, myAnswer: myAnswer.value, correct: correct.value, rule: rule.value,
          source: source.value, category: category.value, itemId: itemId, ref: v.ref || ""
        }
      };
    }

    let saved = null;
    const dlg = LM.dialogs.open({
      title: editing ? "Edit entry" : "Add mistake to the log",
      className: "dialog-wide",
      body: body,
      cancelValue: null,
      actions: [
        { label: "Cancel", value: null, variant: "btn-secondary" },
        {
          label: "Save",
          value: "save",
          variant: "btn-primary",
          onClick: function () {
            const r = collect();
            [context, correct, item].forEach(function (f) { f.removeAttribute("aria-invalid"); });
            if (r.error) {
              error.textContent = r.error;
              r.focus.setAttribute("aria-invalid", "true");
              r.focus.focus();
              return false;
            }
            if (!editing) {
              const dup = pd().findDuplicate(r.fields.ref, r.fields.myAnswer);
              if (dup) {
                error.textContent = "This item with the same answer is already in the log (added " + LM.fmt.date(dup.createdAt) + ").";
                return false;
              }
            }
            saved = editing ? pd().updateEntry(editing.id, r.fields) : pd().addEntry(r.fields);
            if (!saved) { error.textContent = "The entry could not be saved."; return false; }
            return true;
          }
        }
      ]
    });
    context.focus();
    return dlg.result.then(function () {
      if (saved && LM.app) LM.app.refreshLearning();
      return saved;
    });
  }

  // =====================================================================
  // LIST
  // =====================================================================

  function plural(n, one, other) { return LM.plural(n, one, other); }

  /** State of the entry's card ("My mistakes" deck, flashcard schedule) instead of stage 1/3/7. */
  function reviewLabel(e) {
    const info = LM.cards ? LM.cards.mistakeInfo(e) : null;
    if (!info) return { text: "New card", cls: "" };
    if (info.suspended) return { text: "Suspended", cls: "" };
    if (info.mastered) return { text: "Mastered", cls: "is-mastered" };
    if (info.state === "learning" || info.state === "relearning") return { text: "Learning", cls: "is-due" };
    const d = Math.ceil((info.due - Date.now()) / 86400000);
    if (info.due < LM.cardsLogic.dayEnd(Date.now())) return { text: "Due today", cls: "is-due" };
    if (d <= 1) return { text: "Review tomorrow", cls: "" };
    return { text: "Review in " + plural(d, "day"), cls: "" };
  }

  function matches(e) {
    const info = LM.cards ? LM.cards.mistakeInfo(e) : null;
    const dueNow = info ? (info.state !== "new" && !info.suspended && info.due < LM.cardsLogic.dayEnd(Date.now())) : false;
    if (filters.status === "due" && !dueNow) return false;
    if (filters.status === "mastered" && !(info && info.mastered)) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.auto && !pd().isAutoEntry(e)) return false;
    const q = filters.query.trim().toLocaleLowerCase("pl");
    if (q) {
      const hay = [e.context, e.myAnswer, e.correct, e.rule, e.source, e.category].join(" ").toLocaleLowerCase("pl");
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /** Class of the category bar (colour only as an extra — the category name is in the chip). */
  function catClass(category) {
    const map = { "Use of English": "uoe", "Reading": "reading", "Writing": "writing", "Listening": "listening", "Speaking": "speaking", "Grammar": "grammar", "Vocabulary": "vocab", "Other": "other" };
    return " cat-" + (map[category] || "other");
  }

  function entryCard(e, rerender) {
    const status = reviewLabel(e);
    const link = itemLink(e.itemId);
    const auto = pd().autoInfo(e); // an entry added automatically from an item (spark)
    return el("li", { class: "card journal-entry" + catClass(e.category) }, [
      el("div", { class: "journal-entry-head" }, [
        el("span", { class: "c1-chip", text: e.category }),
        auto ? el("span", { class: "journal-auto", title: "Added automatically from an item" }, [
          LM.icon("sparkles", { size: 14 }), "Automatic" + (auto.returned ? " · came back" : "") + (auto.wrongCount > 1 ? " · mistakes: " + auto.wrongCount : "")
        ]) : null,
        el("span", { class: "journal-status " + status.cls, text: status.text }),
        e.source ? el("span", { class: "journal-source", text: e.source }) : null
      ]),
      el("p", { class: "journal-context", text: e.context }),
      el("dl", { class: "journal-answers" }, [
        e.myAnswer ? el("div", { class: "journal-row is-wrong" }, [el("dt", { text: "My answer" }), el("dd", { text: e.myAnswer })]) : null,
        el("div", { class: "journal-row is-right" }, [el("dt", { text: "Right answer" }), el("dd", { text: e.correct })]),
        e.rule ? el("div", { class: "journal-row" }, [el("dt", { text: "Why" }), el("dd", { text: e.rule })]) : null,
        link ? el("div", { class: "journal-row" }, [el("dt", { text: "Handbook" }), el("dd", null, link)]) : null
      ]),
      el("div", { class: "journal-actions" }, [
        el("button", {
          type: "button",
          class: "btn btn-secondary btn-small",
          "aria-label": "Edit entry: " + e.context.slice(0, 60),
          onclick: function () { openForm({ entry: e }).then(function (r) { if (r) rerender(); }); }
        }, "Edit"),
        el("button", {
          type: "button",
          class: "btn btn-danger btn-small",
          "aria-label": "Delete entry: " + e.context.slice(0, 60),
          onclick: function () {
            LM.dialogs.confirm({
              title: "Delete this entry?",
              message: "The entry “" + e.context.slice(0, 120) + (e.context.length > 120 ? "…" : "") + "” will be deleted from the log. This cannot be undone.",
              confirmLabel: "Delete entry"
            }).then(function (ok) {
              if (!ok) return;
              pd().removeEntry(e.id);
              LM.app.refreshLearning();
              rerender();
            });
          }
        }, "Delete")
      ])
    ]);
  }

  function emptyBox(text, withButton) {
    return LM.ui.emptyState({
      art: "empty-log", title: text,
      action: withButton ? el("button", {
        type: "button",
        class: "btn btn-primary",
        onclick: function () { openForm().then(function (r) { if (r) render({ kind: "list" }); }); }
      }, "Add your first mistake") : null
    });
  }

  function renderList(view) {
    const all = pd().entries();
    const due = LM.reviewQueue ? LM.reviewQueue.breakdown().mistake : 0;

    view.appendChild(LM.review.header("mistakes", "Save mistakes from exercises and practice tests – each gets a card that comes back at growing intervals (the flashcard schedule). A mastered card comes back once every few weeks."));

    view.appendChild(el("div", { class: "tool-actions" }, [
      due
        ? el("a", { class: "btn btn-primary", href: REVIEW }, "Start review (" + due + ")")
        : el("p", { class: "tool-note", text: all.length ? "All clear for today – nothing to review." : "" }),
      el("button", {
        type: "button",
        class: "btn btn-secondary",
        onclick: function () { openForm().then(function (r) { if (r) render({ kind: "list" }); }); }
      }, LM.ui.withIcon("plus", "Add mistake"))
    ]));

    if (!all.length) {
      view.appendChild(emptyBox("The log is empty. Save your first mistake – for example from an exercise or a practice test.", true));
      return;
    }

    const listBox = el("ul", { class: "journal-list", "aria-live": "polite" });
    const countText = el("p", { class: "journal-count", "aria-live": "polite" });

    function paint() {
      const shown = all.filter(matches);
      countText.textContent = "Entries: " + shown.length + " of " + all.length;
      listBox.replaceChildren();
      if (!shown.length) {
        const msg = filters.status === "due" && !filters.query && !filters.category
          ? "All clear for today. Nothing to review – come back tomorrow or add a new mistake."
          : filters.status === "mastered" && !filters.query && !filters.category
            ? "Nothing is mastered yet. An entry is mastered after three good reviews."
            : "No entries match the filters.";
        listBox.appendChild(el("li", null, emptyBox(msg, false)));
        return;
      }
      shown.forEach(function (e) { listBox.appendChild(entryCard(e, function () { render({ kind: "list" }); })); });
    }

    const statuses = [["due", "Due today"], ["all", "All"], ["mastered", "Mastered"]];
    const statusButtons = statuses.map(function (s) {
      return el("button", {
        type: "button",
        class: "segmented-btn" + (filters.status === s[0] ? " is-active" : ""),
        "aria-pressed": filters.status === s[0] ? "true" : "false",
        onclick: function () {
          filters.status = s[0];
          statusButtons.forEach(function (b, i) {
            const on = statuses[i][0] === s[0];
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
          });
          paint();
        }
      }, s[1]);
    });

    const catSelect = el("select", {
      id: "journal-cat",
      class: "field",
      onchange: function () { filters.category = catSelect.value; paint(); }
    }, [el("option", { value: "" }, "All categories")].concat(pd().CATEGORIES.map(function (c) { return el("option", { value: c }, c); })));
    catSelect.value = filters.category;

    const search = el("input", {
      id: "journal-search",
      class: "field",
      type: "search",
      value: filters.query,
      placeholder: "Search the log…",
      autocomplete: "off",
      oninput: function () { filters.query = search.value; paint(); }
    });

    const autoCount = all.filter(function (e) { return pd().isAutoEntry(e); }).length;
    const autoBtn = autoCount ? el("button", {
      type: "button",
      class: "chip-btn" + (filters.auto ? " is-active" : ""),
      "aria-pressed": filters.auto ? "true" : "false",
      onclick: function () {
        filters.auto = !filters.auto;
        autoBtn.classList.toggle("is-active", filters.auto);
        autoBtn.setAttribute("aria-pressed", filters.auto ? "true" : "false");
        paint();
      }
    }, [LM.icon("sparkles", { size: 16 }), "Automatic (" + autoCount + ")"]) : null;
    if (!autoCount) filters.auto = false;

    view.appendChild(el("div", { class: "journal-filters", role: "search" }, [
      el("div", { class: "journal-filter-top" }, [
        el("div", { class: "segmented", role: "group", "aria-label": "Show" }, statusButtons),
        autoBtn
      ]),
      el("div", { class: "journal-filter-row" }, [
        el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "journal-cat", text: "Category" }), catSelect]),
        el("div", { class: "form-field is-grow" }, [el("label", { class: "field-label", for: "journal-search", text: "Search" }), search])
      ])
    ]));
    view.appendChild(countText);
    view.appendChild(listBox);
    if (autoCount) {
      view.appendChild(el("div", { class: "tool-actions journal-auto-actions" }, el("button", {
        type: "button",
        class: "btn btn-danger btn-small",
        onclick: function () {
          LM.dialogs.confirm({
            title: "Delete all automatic entries?",
            message: plural(autoCount, "entry added", "entries added") + " automatically from items will disappear from the log. Entries you added yourself stay. This cannot be undone.",
            confirmLabel: "Delete automatic entries"
          }).then(function (ok) {
            if (!ok) return;
            pd().removeAllAuto();
            filters.auto = false;
            LM.app.refreshLearning();
            render({ kind: "list" });
          });
        }
      }, LM.ui.withIcon("trash", "Delete all automatic entries"))));
    }
    paint();
  }

  function focusLater(selector) {
    setTimeout(function () { const b = document.querySelector(selector); if (b) b.focus(); }, 0);
  }

  function rerender() {
    render(parseRoute(location.hash) || { kind: "list" });
  }

  // =====================================================================
  // VIEW
  // =====================================================================

  function render(route) {
    const view = document.getElementById("view");
    const key = "#journal:" + route.kind;
    const keepScroll = view.dataset.file === key ? U.getScroll() : 0;
    view.className = "view tool-view journal-view";
    view.dataset.file = key;
    view.replaceChildren();
    renderList(view);
    document.title = "My mistakes · Flashcards and mistakes · " + LM.APP.appTitle;
    U.setScroll(keepScroll);
  }

  /** Entering the view: nothing to prepare (the session is in js/cards.js). */
  function onEnter() {}

  LM.mistakes = {
    BASE: BASE,
    REVIEW: REVIEW,
    parseRoute: parseRoute,
    render: render,
    onEnter: onEnter,
    openForm: openForm,
    findItem: findItem,
    itemLink: itemLink
  };
})(window.LM);
