/*
 * cards-browse.js — browsing and editing flashcards (spec 10, section 5.3), part of the js/cards.js tab.
 *
 *   LM.cardsBrowse.render(view, route)   route: { kind: "deck"|"edit"|"import", deck, card }
 *   LM.cardsBrowse.prefill(fields)       fills the new card form (e.g. from a text selection)
 *   LM.cardsBrowse.addCard(deckId, card) adds a card from another part of the app → the saved card
 *
 * The deck's card list with search and status filters, suspending (also built-in cards),
 * your own card form with a live preview and validation (cloze: one gap, 500 characters per field),
 * TSV/CSV import with a preview (valid / refused with a reason) and deck export to TSV (Anki).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/review/decks";

  function F() { return LM.cards.internal; }
  function L() { return LM.cardsLogic; }
  function st() { return F().st(); }
  function now() { return Date.now(); }

  const filter = { deck: null, query: "", status: "all", exam: "all" };
  let pending = null;       // form prefill
  let importTarget = null;  // deck chosen before entering the import

  /** Breadcrumbs: "Flashcards and mistakes › Decks › <deck>" (without a label: ends at "Decks"). */
  function crumb(label) {
    const items = [{ label: "Flashcards and mistakes", href: "#/review" }];
    items.push(label ? { label: "Decks", href: HASH } : { label: "Decks" });
    if (label) items.push({ label: label });
    return LM.ui.breadcrumbs(items);
  }

  function statusOf(x) {
    if (x && x.suspended) return { id: "suspended", label: "Suspended", icon: "pause" };
    if (!x || x.state === "new") return { id: "new", label: "New", icon: "sparkles" };
    if (x.state === "review" && x.interval >= 21) return { id: "mastered", label: "Mastered", icon: "check" };
    return { id: "learning", label: "Learning", icon: "rotate-ccw" };
  }

  function backText(c) {
    if (c.type === "cloze") { const p = L().parseCloze(c.text); return p.ok ? p.answers.join(" | ") : ""; }
    return c.type === "typed" && c.accepted ? c.accepted.join(" | ") : c.back;
  }

  function newId() { return "u-" + U.uid("k").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50); }
  function newDeckId() { return "u-" + U.uid("t").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50); }

  // =====================================================================
  // CARD LIST OF A DECK
  // =====================================================================

  function renderDeck(view, deckId) {
    const d = F().deckById(deckId);
    if (!d) { view.appendChild(crumb()); view.appendChild(el("p", { class: "empty-state-text", text: "There is no such deck." })); return; }
    if (filter.deck !== deckId) { filter.deck = deckId; filter.query = ""; filter.status = "all"; filter.exam = "all"; }
    const cards = F().cardsOf(deckId);
    view.appendChild(crumb(d.title));
    view.appendChild(F().head(d.title, d.description));
    view.appendChild(el("p", { class: "tool-note", text: d.builtIn ? "Built-in deck (read-only; you can suspend cards)." : "Your deck." }));
    view.appendChild(F().bar(L().deckStats(cards, st().cards, now())));

    const s = st().settings;
    const on = s.enabledDecks.indexOf(deckId) !== -1;
    const random = s.randomDecks.indexOf(deckId) !== -1;
    const opts = el("div", { class: "fc-check" }, [
      el("input", { type: "checkbox", id: "fc-random", checked: random, onchange: function (e) {
        const list = st().settings.randomDecks, i = list.indexOf(deckId);
        if (e.target.checked && i === -1) list.push(deckId); else if (!e.target.checked && i !== -1) list.splice(i, 1);
        F().saveState();
      } }),
      el("label", { for: "fc-random", text: "New cards in random order (by default in deck order)" })
    ]);
    const actions = [
      el("button", { type: "button", class: "btn btn-secondary", "aria-pressed": on ? "true" : "false", onclick: function () { F().toggleDeck(deckId, !on); LM.cards.render(); } },
        on ? "Turn off for study" : "Turn on for study"),
      el("button", { type: "button", class: "btn btn-secondary", onclick: function () { F().exportDeck(d); } }, LM.ui.withIcon("download", "Export TSV"))
    ];
    if (!d.builtIn) {
      actions.unshift(el("a", { class: "btn btn-primary", href: HASH + "/deck/" + deckId + "/new" }, LM.ui.withIcon("plus", "Add card")));
      actions.push(el("button", { type: "button", class: "btn btn-secondary", onclick: function () { importTarget = deckId; location.hash = HASH + "/import"; } }, LM.ui.withIcon("upload", "Import")));
      actions.push(el("button", { type: "button", class: "btn btn-secondary", onclick: function () { renameDeck(d); } }, LM.ui.withIcon("pencil", "Rename")));
      actions.push(el("button", { type: "button", class: "btn btn-danger", onclick: function () { deleteDeck(d); } }, LM.ui.withIcon("trash", "Delete deck")));
    }
    // "Study now": a session from this deck outside the day's plan (no limits; new, learning and overdue cards)
    const stats = L().deckStats(cards, st().cards, now());
    const studyNow = stats.new + stats.learning + stats.due;
    const study = studyNow
      ? el("a", { class: "btn btn-primary", href: "#/review/session?only=deck:" + deckId + "&extra=1" }, LM.ui.withIcon("play", "Study now"))
      : el("button", { type: "button", class: "btn btn-primary", disabled: true }, LM.ui.withIcon("play", "Study now"));
    view.appendChild(el("div", { class: "fc-study-now" }, [
      study,
      el("span", { class: "tool-note", text: studyNow
        ? "Outside the day's plan, no limits: " + LM.plural(studyNow, "card") + " (new, learning and overdue)."
        : "Nothing to study now – the other cards come back when they are due." })
    ]));
    view.appendChild(el("div", { class: "fc-actions" }, actions));
    view.appendChild(opts);

    const search = el("input", { id: "fc-search", class: "field", type: "search", value: filter.query, placeholder: "Search the deck…", autocomplete: "off", oninput: function () { filter.query = search.value; paint(); } });
    const statuses = [["all", "All"], ["new", "New"], ["learning", "Learning"], ["mastered", "Mastered"], ["suspended", "Suspended"]];
    const sel = el("select", { id: "fc-status", class: "field", onchange: function () { filter.status = sel.value; paint(); } },
      statuses.map(function (x) { return el("option", { value: x[0], selected: filter.status === x[0], text: x[1] }); }));
    // "Exam" filter — only when the deck has cards tagged with exam codes from the registry
    const present = L().examList().filter(function (e) { return cards.some(function (c) { return L().examsOf(c).some(function (x) { return x.code === e.code; }); }); });
    const examSel = present.length ? el("select", { id: "fc-exam", class: "field", onchange: function () { filter.exam = examSel.value; paint(); } },
      [el("option", { value: "all", selected: filter.exam === "all", text: "All" })].concat(present.map(function (e) { return el("option", { value: e.code, selected: filter.exam === e.code, text: e.short + " – " + e.name }); }))) : null;
    view.appendChild(el("div", { class: "journal-filters fc-filters", role: "search" }, [
      el("div", { class: "form-field is-grow" }, [el("label", { class: "field-label", for: "fc-search", text: "Search" }), search]),
      el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-status", text: "Status" }), sel]),
      examSel ? el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-exam", text: "Exam" }), examSel]) : null
    ]));
    const count = el("p", { class: "journal-count", "aria-live": "polite" });
    const list = el("ul", { class: "fc-card-list" });
    view.appendChild(count);
    view.appendChild(list);

    function paint() {
      const fold = LM.searchLogic ? LM.searchLogic.fold : function (x) { return String(x).toLowerCase(); };
      const q = fold(filter.query.trim());
      const shown = cards.filter(function (c) {
        if (filter.status !== "all" && statusOf(st().cards[c.id]).id !== filter.status) return false;
        if (filter.exam !== "all" && !L().examsOf(c).some(function (e) { return e.code === filter.exam; })) return false;
        return !q || fold(L().frontText(c) + " " + backText(c) + " " + (c.hint || "") + " " + (c.note || "")).indexOf(q) !== -1;
      });
      count.textContent = "Cards: " + shown.length + " of " + cards.length;
      list.replaceChildren();
      if (!shown.length) { list.appendChild(LM.ui.emptyState({ tag: "li", art: "no-results", title: cards.length ? "No cards match the filters." : "This deck has no cards yet." })); return; }
      shown.forEach(function (c) {
        const x = st().cards[c.id];
        const sts = statusOf(x);
        const own = !d.builtIn;
        list.appendChild(el("li", { class: "card fc-row" }, [
          el("div", { class: "fc-row-main" }, [
            el("p", { class: "fc-row-front", text: L().frontText(c) }),
            el("p", { class: "fc-row-back", text: backText(c) }),
            F().examChips(c)
          ]),
          el("div", { class: "fc-row-meta" }, [
            el("span", { class: "fc-status is-" + sts.id }, [LM.icon(sts.icon, { size: 14 }), " " + sts.label]),
            el("span", { class: "tool-note", text: x && x.state !== "new" ? "Due: " + F().fmtWhen(Math.max(x.due, x.buriedUntil || 0)) : "Due: —" })
          ]),
          el("div", { class: "fc-row-actions" }, [
            el("button", { type: "button", class: "btn btn-link btn-small", "aria-label": (x && x.suspended ? "Restore card: " : "Suspend card: ") + L().frontText(c),
              onclick: function () { toggleSuspend(c.id); paint(); } }, x && x.suspended ? "Restore" : "Suspend"),
            own ? el("a", { class: "btn btn-link btn-small", href: HASH + "/deck/" + deckId + "/card/" + c.id, "aria-label": "Edit card: " + L().frontText(c) }, "Edit") : null,
            own ? el("button", { type: "button", class: "btn btn-danger btn-small", "aria-label": "Delete card: " + L().frontText(c), onclick: function () { deleteCard(c, paint); } }, "Delete") : null
          ])
        ]));
      });
    }
    paint();
  }

  function toggleSuspend(id) {
    const cur = st().cards[id];
    if (cur && cur.suspended) {
      delete cur.suspended;
      if (cur.state === "new" && !cur.reps) delete st().cards[id]; // a new card without history — "untouched" again
    } else {
      st().cards[id] = Object.assign(LM.cardsSchedule.newCard(), cur || {}, { suspended: true });
    }
    F().saveState();
  }

  function deleteCard(c, after) {
    LM.dialogs.confirm({ title: "Delete this card?", message: "“" + L().frontText(c) + "” will be deleted together with its review history.", confirmLabel: "Delete card" }).then(function (ok) {
      if (!ok) return;
      const list = st().userCards, i = list.findIndex(function (x) { return x.id === c.id; });
      if (i !== -1) list.splice(i, 1);
      delete st().cards[c.id];
      F().saveState();
      if (after) after(); else LM.cards.render();
    });
  }

  function renameDeck(d) {
    LM.dialogs.prompt({ title: "Rename deck", label: "Deck name", value: d.title, confirmLabel: "Save" }).then(function (name) {
      if (!name) return;
      const x = st().userDecks.find(function (u) { return u.id === d.id; });
      if (x) { x.title = name.trim().slice(0, 80); F().saveState(); LM.cards.render(); }
    });
  }

  function deleteDeck(d) {
    const n = F().cardsOf(d.id).length;
    LM.dialogs.confirm({ title: "Delete this deck?", message: "The deck “" + d.title + "” and its cards (" + n + ") will be deleted together with their review history. This cannot be undone.", confirmLabel: "Delete deck" }).then(function (ok) {
      if (!ok) return;
      const s = st();
      s.userCards = s.userCards.filter(function (c) { if (c.deck === d.id) { delete s.cards[c.id]; return false; } return true; });
      s.userDecks = s.userDecks.filter(function (x) { return x.id !== d.id; });
      ["enabledDecks", "randomDecks"].forEach(function (k) { s.settings[k] = s.settings[k].filter(function (id) { return id !== d.id; }); });
      F().saveState();
      location.hash = HASH;
    });
  }

  // =====================================================================
  // CARD FORM (new / edit)
  // =====================================================================

  function userDecks() { return st().userDecks; }

  function ensureDeck(id, title, system) {
    let d = st().userDecks.find(function (x) { return x.id === id; });
    if (!d) {
      d = { id: id, title: title, createdAt: new Date().toISOString() };
      if (system) d.system = system;
      st().userDecks.push(d);
      if (st().settings.enabledDecks.indexOf(id) === -1) st().settings.enabledDecks.push(id);
    }
    return d;
  }

  /** Adds a ready card (from makeCard) to a deck; returns the saved card. */
  function addCard(deckId, card, extra) {
    const c = Object.assign({ id: newId(), deck: deckId, createdAt: new Date().toISOString() }, card, extra || {});
    st().userCards.push(c);
    F().saveState();
    return c;
  }

  function renderEdit(view, route) {
    const existing = route.card ? st().userCards.find(function (c) { return c.id === route.card; }) : null;
    if (route.card && !existing) { view.appendChild(crumb()); view.appendChild(el("p", { class: "empty-state-text", text: "There is no such card (cards of built-in decks are read-only)." })); return; }
    const decks = userDecks();
    const fill = existing ? {
      deck: existing.deck, type: existing.type, front: existing.type === "cloze" ? existing.text : existing.front,
      back: existing.type === "typed" && existing.accepted ? existing.accepted.join("|") : existing.back || "", hint: existing.hint || "", example: existing.example || "", note: existing.note || "", tags: (existing.tags || []).join(" ")
    } : Object.assign({ deck: route.deck, type: "basic", front: "", back: "", hint: "", example: "", note: "", tags: "" }, pending || {});
    pending = null;
    view.appendChild(crumb(existing ? "Edit card" : "New card"));
    view.appendChild(F().head(existing ? "Edit card" : "New card", "Card with a gap: mark the answer in {{double braces}}, separate alternatives with a bar: {{fui|estuve}}."));
    if (!decks.length && !fill.newDeck) {
      fill.newDeck = true;
    }

    const form = el("form", { class: "card fc-form", novalidate: true });
    const err = el("p", { class: "dialog-error", role: "alert", "aria-live": "assertive" });
    const field = function (id, label, value, opts) {
      opts = opts || {};
      const input = el(opts.area ? "textarea" : "input", Object.assign({ id: id, class: "field", maxlength: "500", value: value || "", rows: opts.area ? "2" : null, type: opts.area ? null : "text", autocomplete: "off" }, opts.attrs || {}));
      if (opts.area) input.value = value || "";
      const wrap = el("div", { class: "form-field" }, [el("label", { class: "field-label", for: id, text: label }), input, opts.help ? el("p", { class: "tool-note", id: id + "-help", text: opts.help }) : null]);
      if (opts.help) input.setAttribute("aria-describedby", id + "-help");
      return { wrap: wrap, input: input };
    };
    const deckSel = el("select", { id: "fc-f-deck", class: "field" }, decks.map(function (d) { return el("option", { value: d.id, selected: d.id === fill.deck, text: d.title }); })
      .concat([el("option", { value: "__new", selected: !decks.some(function (d) { return d.id === fill.deck; }), text: "+ New deck…" })]));
    const typeSel = el("select", { id: "fc-f-type", class: "field" }, [["basic", "Basic (front and back)"], ["cloze", "With a gap (sentence with {{…}})"], ["typed", "Type the answer (front and answers)"]]
      .map(function (t) { return el("option", { value: t[0], selected: fill.type === t[0], text: t[1] }); }));
    const front = field("fc-f-front", "Front", fill.front, { area: true });
    const back = field("fc-f-back", "Back", fill.back, { area: true });
    const hint = field("fc-f-hint", "Hint (optional)", fill.hint);
    const example = field("fc-f-example", "Example (optional)", fill.example);
    const note = field("fc-f-note", "Note (optional)", fill.note);
    const tags = field("fc-f-tags", "Tags (separate with spaces)", fill.tags);
    const preview = el("div", { class: "fc-preview", "aria-live": "polite" });

    function labels() {
      const t = typeSel.value;
      front.wrap.querySelector("label").textContent = t === "cloze" ? "Sentence with a gap {{…}}" : t === "typed" ? "Front (e.g. a word in English)" : "Front";
      back.wrap.querySelector("label").textContent = t === "typed" ? "Accepted answers (separate with a bar |)" : "Back";
      back.wrap.hidden = t === "cloze";
    }
    function fields() {
      return { type: typeSel.value, front: front.input.value, back: typeSel.value === "cloze" ? "" : back.input.value, hint: hint.input.value, example: example.input.value, note: note.input.value, tags: tags.input.value };
    }
    function update() {
      labels();
      const res = L().makeCard(fields());
      preview.replaceChildren();
      if (res.error) { preview.appendChild(el("p", { class: "tool-note", text: "The preview appears when the card is valid: " + res.error })); return res; }
      preview.appendChild(el("p", { class: "review-label", text: "Preview – front" }));
      F().renderFront(res.card).forEach(function (n) { preview.appendChild(n); });
      preview.appendChild(el("p", { class: "review-label", text: "Preview – back" }));
      F().renderBack(res.card).forEach(function (n) { preview.appendChild(n); });
      err.textContent = "";
      return res;
    }
    [typeSel, front.input, back.input, hint.input, example.input, note.input, tags.input].forEach(function (x) { x.addEventListener("input", update); x.addEventListener("change", update); });

    U.appendChildren(form, [
      el("div", { class: "fc-form-grid" }, [
        el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-f-deck", text: "Deck" }), deckSel]),
        el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-f-type", text: "Card type" }), typeSel])
      ]),
      front.wrap, back.wrap, hint.wrap, example.wrap, note.wrap, tags.wrap,
      el("section", { class: "fc-preview-box", "aria-label": "Card preview" }, preview),
      err,
      el("div", { class: "fc-actions" }, [
        el("button", { type: "submit", class: "btn btn-primary" }, existing ? "Save changes" : "Add card"),
        el("a", { class: "btn btn-secondary", href: existing || route.deck ? HASH + "/deck/" + (existing ? existing.deck : route.deck) : HASH }, "Cancel"),
        existing ? el("button", { type: "button", class: "btn btn-danger", onclick: function () { deleteCard(existing, function () { location.hash = HASH + "/deck/" + existing.deck; }); } }, "Delete card") : null
      ])
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const res = update();
      if (res.error) { err.textContent = res.error; front.input.focus(); return; }
      const finish = function (deckId) {
        if (existing) {
          const keep = { id: existing.id, deck: deckId, createdAt: existing.createdAt, sourceItemId: existing.sourceItemId };
          const i = st().userCards.indexOf(existing);
          st().userCards[i] = Object.assign(keep, res.card);
          if (!keep.sourceItemId) delete st().userCards[i].sourceItemId;
          F().saveState();
          LM.ui.toast({ text: "Card saved.", icon: "check" });
          location.hash = HASH + "/deck/" + deckId;
        } else {
          const c = addCard(deckId, res.card);
          LM.ui.toast({ text: "Card added to your flashcards.", icon: "check", action: { label: "Undo", onClick: function () { removeCard(c.id); } } });
          front.input.value = ""; back.input.value = ""; hint.input.value = ""; example.input.value = ""; note.input.value = "";
          update(); front.input.focus();
        }
      };
      if (deckSel.value === "__new") {
        LM.dialogs.prompt({ title: "New deck", label: "Deck name", confirmLabel: "Create" }).then(function (name) {
          if (!name) return;
          const d = ensureDeck(newDeckId(), name.trim().slice(0, 80));
          F().saveState();
          deckSel.insertBefore(el("option", { value: d.id, selected: true, text: d.title }), deckSel.lastChild);
          deckSel.value = d.id;
          finish(d.id);
        });
      } else finish(deckSel.value);
    });
    view.appendChild(form);
    update();
    setTimeout(function () { front.input.focus(); }, 0);
  }

  function removeCard(id) {
    const s = st(), i = s.userCards.findIndex(function (c) { return c.id === id; });
    if (i !== -1) s.userCards.splice(i, 1);
    delete s.cards[id];
    F().saveState();
    if (LM.state && LM.state.view === "cards") LM.cards.render();
  }

  // =====================================================================
  // IMPORT TSV / CSV
  // =====================================================================

  function renderImport(view) {
    view.appendChild(crumb("Import"));
    view.appendChild(F().head("Import flashcards", "A TSV or CSV file (UTF-8, separator: tab or semicolon). Columns: type; front; back; hint; example; note; tags. Anki files (front, back, tags, gaps {{c1::…}}) work too."));
    const decks = userDecks();
    const target = el("select", { id: "fc-i-deck", class: "field" }, decks.map(function (d) { return el("option", { value: d.id, selected: d.id === importTarget, text: d.title }); })
      .concat([el("option", { value: "__new", selected: !decks.length || !importTarget, text: "+ New deck" })]));
    const area = el("textarea", { id: "fc-i-text", class: "field", rows: "8", placeholder: "type\tfront\tback\nbasic\tEstoy de acuerdo.\tI agree.\ncloze\tAyer {{fui}} al cine.", spellcheck: "false" });
    const file = el("input", { id: "fc-i-file", type: "file", accept: ".tsv,.csv,.txt,text/tab-separated-values,text/csv,text/plain" });
    const out = el("section", { class: "fc-import-preview", "aria-live": "polite" });
    file.addEventListener("change", function () {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then(function (t) { area.value = t; show(); }, function () { out.replaceChildren(el("p", { class: "dialog-error", text: "The file could not be read." })); });
    });
    let result = null;
    function show() {
      result = L().importCards(area.value);
      out.replaceChildren();
      out.appendChild(el("h2", { class: "section-title", text: "Import preview" }));
      out.appendChild(el("p", null, [el("strong", { text: "Valid: " + result.cards.length }), " · refused: " + result.rejected.length + " · separator: " + (result.separator === "\t" ? "tab" : result.separator)]));
      if (result.cards.length) {
        out.appendChild(el("ul", { class: "fc-import-sample" }, result.cards.slice(0, 5).map(function (c) {
          return el("li", null, [el("span", { class: "c1-chip", text: c.type }), " " + L().frontText(c) + " → " + backText(c)]);
        })));
        if (result.cards.length > 5) out.appendChild(el("p", { class: "tool-note", text: "…and " + (result.cards.length - 5) + " more." }));
      }
      if (result.rejected.length) {
        out.appendChild(el("h3", { class: "c1-check-title", text: "Refused rows" }));
        out.appendChild(el("ul", { class: "fc-import-rejected" }, result.rejected.slice(0, 50).map(function (r) { return el("li", { text: "Row " + r.line + ": " + r.reason }); })));
      }
      if (result.cards.length) {
        out.appendChild(el("button", { type: "button", class: "btn btn-primary", onclick: commit }, "Import " + LM.plural(result.cards.length, "card")));
      }
    }
    function commit() {
      const go = function (deckId) {
        const added = result.cards.map(function (c) { return Object.assign({ id: newId(), deck: deckId, createdAt: new Date().toISOString() }, c); });
        st().userCards = st().userCards.concat(added);
        F().saveState();
        LM.ui.toast({ text: LM.plural(added.length, "card") + " imported.", icon: "check",
          action: { label: "Undo", onClick: function () { const ids = {}; added.forEach(function (c) { ids[c.id] = true; }); st().userCards = st().userCards.filter(function (c) { return !ids[c.id]; }); F().saveState(); } } });
        importTarget = null;
        location.hash = HASH + "/deck/" + deckId;
      };
      if (target.value === "__new") {
        LM.dialogs.prompt({ title: "New deck", label: "Deck name", value: "Import " + LM.fmt.date(new Date()), confirmLabel: "Create" }).then(function (name) {
          if (!name) return;
          const d = ensureDeck(newDeckId(), name.trim().slice(0, 80));
          F().saveState();
          go(d.id);
        });
      } else go(target.value);
    }
    view.appendChild(el("div", { class: "card fc-form" }, [
      el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-i-deck", text: "Into deck" }), target]),
      el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-i-file", text: "File" }), file]),
      el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fc-i-text", text: "…or paste text" }), area]),
      el("div", { class: "fc-actions" }, [el("button", { type: "button", class: "btn btn-secondary", onclick: show }, "Show preview")])
    ]));
    view.appendChild(out);
  }

  function render(view, route) {
    if (route.kind === "deck") renderDeck(view, route.deck);
    else if (route.kind === "edit") renderEdit(view, route);
    else if (route.kind === "import") renderImport(view);
  }

  LM.cardsBrowse = {
    render: render,
    prefill: function (fields) { pending = fields; },
    addCard: addCard, ensureDeck: ensureDeck, removeCard: removeCard, newId: newId
  };
})(window.LM);
