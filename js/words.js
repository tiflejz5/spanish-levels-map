/*
 * words.js — "My words" (pack v6, spec 14): a word or phrase selected in a text of the app
 * goes with one click into the "My words" flashcard deck, together with the sentence it comes from.
 *
 *   Selection menu          "Add to My words" (shortcut M) and "Make a flashcard…" (shortcut Ctrl/Cmd+Shift+F)
 *   Where you can select    topic pages and level summaries, exam pages (.md),
 *                           lab cards, item texts and transcripts AFTER checking the answer,
 *                           elements with the data-fc-selectable attribute (model answers, phrase bank, cheat sheets)
 *   Card                    cloze with the context sentence (LM.cardsLogic.makeWordCard), deck u-moje-slowa
 *
 * Logic without DOM (sentence, gap, language check, deduplication, field cleaning): js/cards-logic.js.
 * Adding a word is NOT a study-day activity (too easy to pad the streak). User content only as text.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/review/decks";
  const WORDS_HASH = "#/review/words";
  const WORDS_ID = "u-moje-slowa";
  const WORDS_TITLE = "My words";

  function L() { return LM.cardsLogic; }
  function F() { return LM.cards.internal; }
  function st() { return F().st(); }
  function hasProfile() { return !!(LM.app && LM.app.getActiveProfile()); }
  function prefs() { return hasProfile() && LM.profileData ? LM.profileData.prefs() : { selectionMenu: true, highlightWords: false }; }

  // =====================================================================
  // WHERE SELECTION WORKS
  // =====================================================================

  const AREAS = "article.md, .md, .lab-view, [data-fc-selectable]";
  const BLOCKS = "p, li, td, th, blockquote, dd";
  const NEVER = "input, textarea, select, [contenteditable], .notes-panel, .fc-session, .fc-sel-menu, .toast-region, dialog, [role='dialog'], .c1-timer";

  function elementOf(node) { return node && (node.nodeType === 1 ? node : node.parentElement); }

  /** A table cell in the "English" / "Meaning" column — the text there is not in the target language (spec 14, 3.4). Stage 3 switches to lang attributes. */
  function inNativeColumn(cell) {
    const table = cell.closest && cell.closest("table");
    if (!table || !/^(TD|TH)$/.test(cell.tagName)) return false;
    const idx = Array.prototype.indexOf.call(cell.parentElement.children, cell);
    const head = table.querySelector("thead tr") || table.rows[0];
    const h = head && head.cells[idx];
    return !!h && h !== cell && /^\s*(english|meaning)\b/i.test(h.textContent);
  }

  function pageTitle() {
    const t = document.title.split(" · " + LM.APP.appTitle)[0].trim();
    if (t && t.indexOf(LM.APP.appTitle) !== 0) return t.slice(0, 120);
    const h = document.querySelector("#view h1");
    return h ? h.textContent.trim().slice(0, 120) : "";
  }

  /**
   * The current selection in an allowed place: { text, word, block, blockText, canWord, source } or null.
   * word — the cleaned word (1–6 words, ≤ 60 characters) or ""; canWord — "Add to My words" is available.
   */
  function info() {
    if (!hasProfile() || !prefs().selectionMenu) return null;
    const s = window.getSelection && window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const anchor = elementOf(s.anchorNode);
    const focus = elementOf(s.focusNode);
    if (!anchor || !focus || anchor.closest(NEVER) || focus.closest(NEVER)) return null;
    const area = anchor.closest(AREAS);
    if (!area || !area.contains(focus)) return null;
    // Texts and transcripts in exercises — only after checking the answer (no distraction)
    if (anchor.closest(".ex-passage-text, .ex-transcript, .ex-set-transcript") && !(LM.exercises && LM.exercises.textSelectable && LM.exercises.textSelectable())) return null;
    const text = s.toString().replace(/\s+/g, " ").trim().slice(0, 300);
    if (!text) return null;
    const block = anchor.closest(BLOCKS) || area;
    const word = L().wordFromSelection(text);
    return {
      text: text, word: word, block: block, blockText: block.textContent || "",
      canWord: !!word && !L().isPolish(text) && !inNativeColumn(block),
      source: { route: /^#\/[^\s<>"]*$/.test(location.hash || "") ? location.hash.slice(0, 200) : "", title: pageTitle() }
    };
  }

  // =====================================================================
  // DECK AND DUPLICATES
  // =====================================================================

  /** Cards of the "My words" deck. */
  function cards() { return st().userCards.filter(function (c) { return c.deck === WORDS_ID; }); }

  /** The card's saved word (the word field, and in older cards — the gap answer or the front). */
  function wordOf(c) {
    if (c.word) return c.word;
    if (c.type === "cloze") { const p = L().parseCloze(c.text); return p.ok ? p.answers[0] : ""; }
    return c.front || "";
  }

  /** The card's sentence (cloze with the gap filled, or the back of a plain card). */
  function sentenceOf(c) {
    if (c.type === "cloze") { const p = L().parseCloze(c.text); return p.ok ? p.before + p.answers[0] + p.after : String(c.text || ""); }
    return String(c.back || "");
  }

  function findByWord(word) {
    const key = L().wordKey(word);
    return cards().find(function (c) { return L().wordKey(wordOf(c)) === key; }) || null;
  }

  function sameSentence(a, b) { return L().normalize(a) === L().normalize(b); }

  function say(text, extra) { LM.ui.toast(Object.assign({ text: text, icon: "layers" }, extra || {})); }

  // =====================================================================
  // ADDING
  // =====================================================================

  function refreshOpenView() { if (LM.state && LM.state.view === "cards" && LM.cards.render) LM.cards.render(); }

  /** "Add a meaning": a small dialog with one field, Enter saves (fills the card's hint). */
  function addMeaning(id, word) {
    LM.dialogs.prompt({ title: "Meaning of “" + word + "”", label: "Meaning in English", confirmLabel: "Save" }).then(function (value) {
      if (!value) return;
      const c = st().userCards.find(function (x) { return x.id === id; });
      if (!c) return;
      c.hint = value.trim().slice(0, L().MAX_FIELD);
      F().saveState();
      say("Meaning saved: “" + word + "” – " + c.hint);
      refreshOpenView();
    });
  }

  /** A second (third) example of an existing card: adds the sentence to examples (at most 3). */
  function addExample(c, sentence) {
    const word = wordOf(c);
    if (!sentence || sameSentence(sentence, sentenceOf(c)) || (c.examples || []).some(function (e) { return sameSentence(e, sentence); })) {
      say("This example of “" + word + "” is already in My words.");
      return;
    }
    if ((c.examples || []).length >= L().EXAMPLES_MAX) {
      say("“" + word + "” already has " + L().EXAMPLES_MAX + " extra examples (the maximum).");
      return;
    }
    const clean = L().sanitizeWordFields({ examples: (c.examples || []).concat(sentence) }).examples;
    c.examples = clean;
    F().saveState();
    say("Another example added to “" + word + "”.", { actions: [{ label: "Undo", onClick: function () {
      c.examples = (c.examples || []).slice(0, -1);
      if (!c.examples.length) delete c.examples;
      F().saveState();
      refreshOpenView();
    } }] });
    refreshOpenView();
  }

  function showWord(word) {
    if (LM.words && LM.words.focusWord) LM.words.focusWord(word);
    location.hash = WORDS_HASH;
  }

  /** "Add to My words": a card with a gap in one click; a duplicate (the same word) → "Show" / "Add a second example". */
  function addWord(i) {
    if (!hasProfile()) { LM.app.withProfile("Words are saved in your profile.", function () { addWord(i); }); return null; }
    if (!i || !i.canWord) return null;
    const sentence = L().extractSentence(i.blockText, i.word);
    const dup = findByWord(i.word);
    if (dup) {
      const actions = [{ label: "Show", onClick: function () { showWord(wordOf(dup)); } }];
      if (sentence && !sameSentence(sentence, sentenceOf(dup)) && (dup.examples || []).length < L().EXAMPLES_MAX) {
        actions.push({ label: "Add a second example", onClick: function () { addExample(dup, sentence); } });
      }
      say("“" + wordOf(dup) + "” is already in My words.", { actions: actions });
      return dup;
    }
    const res = L().makeWordCard({ selection: i.word, sentence: sentence, source: i.source, day: LM.learn.today() });
    if (res.error) { say(res.error); return null; }
    LM.cardsBrowse.ensureDeck(WORDS_ID, WORDS_TITLE, "words");
    const added = LM.cardsBrowse.addCard(WORDS_ID, res.card);
    say("“" + i.word + "” added to My words", { actions: [
      { label: "Add a meaning", onClick: function () { addMeaning(added.id, i.word); } },
      { label: "Undo", onClick: function () { LM.cardsBrowse.removeCard(added.id); refreshOpenView(); } }
    ] });
    refreshOpenView();
    refreshHighlights();
    return added;
  }

  /** "Add to My words" from the phrase bank: a plain card meaning → phrase ({ en, pl, example?, route, title }); a duplicate (the same phrase) → "Show". */
  function addPhrase(p) {
    if (!hasProfile()) { LM.app.withProfile("Words are saved in your profile.", function () { addPhrase(p); }); return null; }
    const phrase = String(p.en || "").replace(/\s*…\s*$/, "").replace(/\s+/g, " ").trim();
    if (!phrase || !p.pl) return null;
    const dup = findByWord(phrase);
    if (dup) {
      say("“" + phrase + "” is already in My words.", { actions: [{ label: "Show", onClick: function () { showWord(wordOf(dup)); } }] });
      return dup;
    }
    const res = L().makeCard({ type: "basic", front: p.pl, back: phrase, hint: "", example: p.example || "" });
    if (res.error) { say(res.error); return null; }
    Object.assign(res.card, L().sanitizeWordFields({ word: phrase, source: { route: p.route, title: p.title }, addedAt: LM.learn.today() }));
    LM.cardsBrowse.ensureDeck(WORDS_ID, WORDS_TITLE, "words");
    const added = LM.cardsBrowse.addCard(WORDS_ID, res.card);
    say("“" + phrase + "” added to My words", { actions: [
      { label: "Undo", onClick: function () { LM.cardsBrowse.removeCard(added.id); refreshOpenView(); } }
    ] });
    refreshOpenView();
    refreshHighlights();
    return added;
  }

  // =====================================================================
  // SELECTION MENU
  // =====================================================================

  let menu = null, timer = null;

  function hideMenu() { if (menu) menu.hidden = true; }

  function ensureMenu() {
    if (menu) return menu;
    menu = el("div", { class: "fc-sel-menu", role: "toolbar", "aria-label": "Selected text", hidden: true,
      onmousedown: function (e) { e.preventDefault(); } }); // keeps the selection
    document.body.appendChild(menu);
    return menu;
  }

  function openForm() {
    const i = info();
    if (i) LM.cards.openFromSelection(i.text);
  }

  function updateMenu() {
    const i = info();
    if (!i) { hideMenu(); return; }
    ensureMenu();
    menu.replaceChildren.apply(menu, [
      i.canWord ? el("button", { type: "button", class: "btn btn-primary btn-small", title: "Shortcut: M",
        onclick: function () { const cur = info(); if (cur) addWord(cur); } }, LM.ui.withIcon("layers", "Add to My words")) : null,
      el("button", { type: "button", class: "btn btn-secondary btn-small", title: "Shortcut: Ctrl+Shift+F", onclick: openForm }, "Make a flashcard…")
    ].filter(Boolean));
    menu.hidden = false;
    // Above the selection; on a phone (the system menu sits above the selection) and when there is no room — below it
    const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const below = coarse || r.top <= 60;
    menu.style.top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, below ? r.bottom + 12 : r.top - menu.offsetHeight - 8)) + "px";
    menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left)) + "px";
  }

  document.addEventListener("selectionchange", function () { clearTimeout(timer); timer = setTimeout(updateMenu, 150); });
  window.addEventListener("hashchange", hideMenu);
  window.addEventListener("scroll", function () { if (menu && !menu.hidden) updateMenu(); }, { passive: true });
  window.addEventListener("resize", function () { if (menu && !menu.hidden) updateMenu(); });

  function typing(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }

  document.addEventListener("keydown", function (e) {
    // Ctrl/Cmd+Shift+F: the flashcard form from the selection (unchanged)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "F" || e.key === "f")) {
      const i = info();
      if (i) { e.preventDefault(); LM.cards.openFromSelection(i.text); }
      return;
    }
    // M (no modifiers): "Add to My words", only with a selection and outside text fields
    if ((e.key === "m" || e.key === "M") && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !typing(e.target)) {
      const i = info();
      if (i && i.canWord) { e.preventDefault(); addWord(i); }
    }
  });

  // =====================================================================
  // VIEW #/review/words (spec 14, section 5)
  // =====================================================================

  const view = { query: "", sort: "newest", noMeaning: false };
  let focusedWord = null;

  /** Status as text (not colour alone): New / Learning / Mastered / Suspended. */
  function statusOf(x) {
    if (x && x.suspended) return { id: "suspended", label: "Suspended", icon: "pause" };
    if (!x || x.state === "new") return { id: "new", label: "New", icon: "sparkles" };
    if (x.state === "review" && x.interval >= 21) return { id: "mastered", label: "Mastered", icon: "check" };
    return { id: "learning", label: "Learning", icon: "rotate-ccw" };
  }

  function focusWord(word) { focusedWord = word; view.query = word || ""; }

  function fmtDay(c) {
    const s = String(c.addedAt || c.createdAt || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : "";
  }

  /** The sentence with the word marked by <mark> (text nodes, no innerHTML). */
  function sentenceNode(c) {
    const s = sentenceOf(c), w = wordOf(c), i = w ? s.toLowerCase().indexOf(w.toLowerCase()) : -1;
    if (i === -1) return el("span", { text: s });
    return el("span", null, [s.slice(0, i), el("mark", { class: "fw-mark", text: s.slice(i, i + w.length) }), s.slice(i + w.length)]);
  }

  function toggleSuspend(id) {
    const cur = st().cards[id];
    if (cur && cur.suspended) {
      delete cur.suspended;
      if (cur.state === "new" && !cur.reps) delete st().cards[id];
    } else {
      st().cards[id] = Object.assign(LM.cardsSchedule.newCard(), cur || {}, { suspended: true });
    }
    F().saveState();
  }

  function removeWord(c, after) {
    LM.dialogs.confirm({ title: "Delete this word?", message: "“" + wordOf(c) + "” will be deleted from My words together with its review history.", confirmLabel: "Delete word" }).then(function (ok) {
      if (!ok) return;
      LM.cardsBrowse.removeCard(c.id);
      refreshHighlights();
      if (after) after();
    });
  }

  function weakness(c) { const x = st().cards[c.id] || {}; return (x.lapses || 0) * 1000 - (x.interval || 0); }

  function renderView(root) {
    const all = cards();
    root.appendChild(LM.review.header("words", "Words and phrases you selected in texts – each with the sentence it comes from."));
    if (!all.length) {
      root.appendChild(LM.ui.emptyState({
        class: "fw-empty", art: "empty-notes", title: "You have not saved any words yet.", hint: "Select a word or phrase in any text (a topic page, a summary, an exam page, the lab), then choose “Add to My words” or press M. A card with a gap lands here and in your daily reviews."
      }));
      return;
    }
    root.appendChild(F().bar(L().deckStats(all, st().cards, Date.now())));

    const actions = [
      el("a", { class: "btn btn-primary", href: "#/review/session?only=deck:" + WORDS_ID }, LM.ui.withIcon("play", "Study now")),
      el("button", { type: "button", class: "btn btn-secondary", onclick: function () {
        F().downloadText(LM.APP.exportName + "-my-words.csv", "﻿" + L().exportWordsCsv(cards()), "text/csv;charset=utf-8");
      } }, LM.ui.withIcon("download", "Export CSV"))
    ];
    root.appendChild(el("div", { class: "fc-actions" }, actions));

    const search = el("input", { id: "fw-search", class: "field", type: "search", value: view.query, placeholder: "Search a word, meaning or sentence…", autocomplete: "off", oninput: function () { view.query = search.value; paint(); } });
    const sort = el("select", { id: "fw-sort", class: "field", onchange: function () { view.sort = sort.value; paint(); } },
      [["newest", "Newest first"], ["az", "A–Z"], ["weakest", "Least known"]].map(function (x) { return el("option", { value: x[0], selected: view.sort === x[0], text: x[1] }); }));
    const nm = el("input", { type: "checkbox", id: "fw-nomeaning", checked: view.noMeaning, onchange: function () { view.noMeaning = nm.checked; paint(); } });
    root.appendChild(el("div", { class: "journal-filters fc-filters", role: "search" }, [
      el("div", { class: "form-field is-grow" }, [el("label", { class: "field-label", for: "fw-search", text: "Search" }), search]),
      el("div", { class: "form-field" }, [el("label", { class: "field-label", for: "fw-sort", text: "Order" }), sort])
    ]));
    root.appendChild(el("div", { class: "fc-check" }, [nm, el("label", { for: "fw-nomeaning", text: "Show only words without a meaning" })]));
    const count = el("p", { class: "journal-count", "aria-live": "polite" });
    const list = el("ul", { class: "fc-card-list fw-list" });
    root.appendChild(count);
    root.appendChild(list);

    function paint() {
      const fold = LM.searchLogic ? LM.searchLogic.fold : function (x) { return String(x).toLowerCase(); };
      const q = fold(view.query.trim());
      const shown = cards().filter(function (c) {
        if (view.noMeaning && c.hint) return false;
        return !q || fold(wordOf(c) + " " + (c.hint || "") + " " + sentenceOf(c)).indexOf(q) !== -1;
      });
      const day = function (c) { return String(c.addedAt || c.createdAt || ""); };
      shown.sort(function (a, b) {
        if (view.sort === "az") return wordOf(a).localeCompare(wordOf(b), LM.APP.targetLang, { sensitivity: "base" });
        if (view.sort === "weakest") return weakness(b) - weakness(a) || day(b).localeCompare(day(a));
        return day(b).localeCompare(day(a));
      });
      count.textContent = "Words: " + shown.length + " of " + all.length;
      list.replaceChildren();
      if (!shown.length) { list.appendChild(LM.ui.emptyState({ tag: "li", art: "no-results", title: "No words match the filters." })); return; }
      shown.forEach(function (c) { list.appendChild(row(c)); });
      if (focusedWord) {
        const first = list.querySelector(".fw-row"); focusedWord = null;
        if (first) { first.setAttribute("tabindex", "-1"); first.focus({ preventScroll: false }); }
      }
    }

    function row(c) {
      const x = st().cards[c.id], sts = statusOf(x), w = wordOf(c);
      const meaning = el("input", { class: "field fw-meaning", type: "text", maxlength: "120", value: c.hint || "", placeholder: "Add a meaning in English", "aria-label": "Meaning of " + w, autocomplete: "off",
        onchange: function () {
          const card = st().userCards.find(function (k) { return k.id === c.id; });
          if (!card) return;
          const v = meaning.value.trim().slice(0, 120);
          if (v) card.hint = v; else delete card.hint;
          F().saveState();
        } });
      const src = c.source && c.source.route ? el("a", { class: "fw-source", href: c.source.route }, LM.ui.withIcon("external-link", c.source.title || "Source")) : null;
      return el("li", { class: "card fc-row fw-row" }, [
        el("div", { class: "fc-row-main" }, [
          el("p", { class: "fc-row-front fw-word", text: w }),
          meaning,
          el("p", { class: "fc-row-back fw-sentence" }, sentenceNode(c)),
          (c.examples || []).length ? el("ul", { class: "fc-example-list" }, c.examples.map(function (s) { return el("li", { text: s }); })) : null,
          el("p", { class: "tool-note" }, [src, src ? " · " : null, fmtDay(c) ? "dodano " + fmtDay(c) : null])
        ]),
        el("div", { class: "fc-row-meta" }, [
          el("span", { class: "fc-status is-" + sts.id }, [LM.icon(sts.icon, { size: 14 }), " " + sts.label]),
          el("span", { class: "tool-note", text: x && x.state !== "new" ? "Due: " + F().fmtWhen(Math.max(x.due, x.buriedUntil || 0)) : "Due: —" })
        ]),
        el("div", { class: "fc-row-actions" }, [
          el("button", { type: "button", class: "btn btn-link btn-small", "aria-label": (x && x.suspended ? "Restore word: " : "Suspend word: ") + w,
            onclick: function () { toggleSuspend(c.id); paint(); } }, x && x.suspended ? "Restore" : "Suspend"),
          el("button", { type: "button", class: "btn btn-danger btn-small", "aria-label": "Delete word: " + w, onclick: function () { removeWord(c, function () { LM.cards.render(); }); } }, "Delete")
        ])
      ]);
    }
    paint();
  }

  /** Numbers for the tile on the Flashcards page and for Stats. */
  function counts() {
    const all = cards();
    let mastered = 0;
    all.forEach(function (c) { if (statusOf(st().cards[c.id]).id === "mastered") mastered++; });
    return { total: all.length, mastered: mastered };
  }

  // =====================================================================
  // UNDERLINING SAVED WORDS (step 7) — refreshed after adding a word and when the setting changes
  // =====================================================================

  const HL_MAX = 300;
  const HL_SKIP = "a, code, pre, kbd, h1, h2, h3, h4, h5, h6, mark, button, script, style, .fw-saved, .ex-passage-text, .ex-transcript, .ex-set-transcript, " + NEVER;
  let hlObserver = null, hlTimer = 0, hlTip = null, hlNoted = false;

  function clearHighlights() {
    document.querySelectorAll("span.fw-saved").forEach(function (s) {
      const parent = s.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(s.textContent), s);
      parent.normalize();
    });
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function tip() {
    if (!hlTip) {
      hlTip = el("div", { class: "fw-tip", role: "tooltip", id: "fw-tip", hidden: true });
      document.body.appendChild(hlTip);
    }
    return hlTip;
  }

  function showTip(target) {
    const t = tip();
    t.textContent = target.dataset.meaning ? target.dataset.meaning : "Saved in My words (no meaning yet)";
    t.hidden = false;
    const r = target.getBoundingClientRect(), tr = t.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2));
    const top = r.top - tr.height - 6 >= 8 ? r.top - tr.height - 6 : r.bottom + 6;
    t.style.left = left + "px";
    t.style.top = top + "px";
    target.setAttribute("aria-describedby", "fw-tip");
  }

  function hideTip(target) { if (hlTip) hlTip.hidden = true; if (target) target.removeAttribute("aria-describedby"); }

  function onTipEvent(e) {
    const s = e.target.closest && e.target.closest("span.fw-saved");
    if (!s) return;
    if (e.type === "mouseover" || e.type === "focusin") showTip(s); else hideTip(s);
  }

  /** Underlines saved words in texts (not headings, links, code or item texts); ≤ 300 words. */
  function applyHighlights() {
    if (hlObserver) hlObserver.disconnect();
    clearHighlights();
    try {
      if (!hasProfile() || !prefs().highlightWords) return;
      const all = cards().slice().sort(function (a, b) { return String(b.addedAt || b.createdAt || "").localeCompare(String(a.addedAt || a.createdAt || "")); });
      if (!all.length) return;
      const used = all.slice(0, HL_MAX);
      if (all.length > HL_MAX && !hlNoted) { hlNoted = true; say("Underlining the " + HL_MAX + " newest of " + all.length + " words."); }
      const byKey = new Map();
      used.forEach(function (c) { const w = wordOf(c); if (w) byKey.set(L().wordKey(w), c); });
      const words = used.map(wordOf).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
      if (!words.length) return;
      const re = new RegExp("(?<![\\p{L}\\p{N}_])(" + words.map(escapeRe).join("|") + ")(?![\\p{L}\\p{N}_])", "giu");
      document.querySelectorAll(AREAS).forEach(function (root) {
        if (root.closest(HL_SKIP)) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: function (n) {
            const p = n.parentElement;
            return p && !p.closest(HL_SKIP) && n.nodeValue.length > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        });
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(function (node) {
          const text = node.nodeValue;
          re.lastIndex = 0;
          let m, last = 0, frag = null;
          while ((m = re.exec(text))) {
            frag = frag || document.createDocumentFragment();
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const card = byKey.get(L().wordKey(m[1]));
            frag.appendChild(el("span", { class: "fw-saved", tabindex: "0", "data-meaning": (card && card.hint) || "", text: m[1] }));
            last = m.index + m[1].length;
          }
          if (frag) {
            if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
            node.parentNode.replaceChild(frag, node);
          }
        });
      });
    } finally {
      if (hlObserver && prefs().highlightWords) hlObserver.observe(document.getElementById("view") || document.body, { childList: true, subtree: true });
    }
  }

  function refreshHighlights() {
    clearTimeout(hlTimer);
    hlTimer = setTimeout(applyHighlights, 150);
  }

  (function initHighlights() {
    hlObserver = new MutationObserver(function (list) {
      // our own changes (span.fw-saved) are detached by disconnect; we react to new view content
      if (list.some(function (m) { return m.addedNodes.length; })) refreshHighlights();
    });
    document.addEventListener("mouseover", onTipEvent);
    document.addEventListener("mouseout", onTipEvent);
    document.addEventListener("focusin", onTipEvent);
    document.addEventListener("focusout", onTipEvent);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && hlTip) hlTip.hidden = true; });
    window.addEventListener("hashchange", refreshHighlights);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refreshHighlights); else refreshHighlights();
  })();

  function prefsChanged() {
    hideMenu();
    refreshHighlights();
  }

  LM.words = {
    WORDS_ID: WORDS_ID, WORDS_HASH: WORDS_HASH, info: info, addWord: addWord, addPhrase: addPhrase, addMeaning: addMeaning, addExample: addExample,
    cards: cards, wordOf: wordOf, sentenceOf: sentenceOf, findByWord: findByWord, hideMenu: hideMenu, prefsChanged: prefsChanged,
    refreshHighlights: refreshHighlights, renderView: renderView, focusWord: focusWord, counts: counts
  };
})(window.LM);
