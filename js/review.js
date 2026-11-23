/*
 * review.js — the "Flashcards and mistakes" view (#/review, pack v8, spec 20 R3).
 *
 *   #/review                    "Due today" tab: card with the number, the split and "Review now" (this file)
 *   #/review/decks[/…]          "Decks" tab (js/cards.js, js/cards-browse.js)
 *   #/review/mistakes           "My mistakes" tab (js/mistakes.js)
 *   #/review/words              "My words" tab (js/words.js)
 *   #/review/session[?only=…]   the unified session (js/cards.js)
 *
 * Numbers and queue: js/review-queue.js. Here: the shared header with tabs (role="tablist"), the "Due today" card
 * (the same one on Today) and the view of the first tab.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const HOME = "#/review";
  const TABS = [
    { id: "today", label: "Due today", href: HOME },
    { id: "decks", label: "Decks", href: "#/review/decks" },
    { id: "mistakes", label: "My mistakes", href: "#/review/mistakes" },
    { id: "words", label: "My words", href: "#/review/words" }
  ];
  const ROWS = [
    { kind: "card", label: "Flashcards from decks", only: "decks" },
    { kind: "mistake", label: "Mistakes from the log", only: "mistakes" },
    { kind: "exercise", label: "Weak spots from exercises", only: "weak" }
  ];

  function hasProfile() { return !!(LM.app && LM.app.getActiveProfile()); }
  function plural(n, one, other) { return LM.plural(n, one, other); }

  function parseRoute(hash) {
    return /^#\/review\/?$/.test(hash || "") ? { kind: "today" } : null;
  }

  // ---------- header and tabs ----------

  /** Tabs of the view. The active one has aria-selected and tabindex 0; arrows, Home and End move focus, Enter / Space opens. */
  function tabs(active) {
    const items = TABS.map(function (t) {
      const on = t.id === active;
      return el("a", {
        class: "pw-tab" + (on ? " is-active" : ""), href: t.href, role: "tab", id: "pw-tab-" + t.id,
        "aria-selected": on ? "true" : "false", tabindex: on ? "0" : "-1"
      }, t.label);
    });
    const list = el("div", { class: "pw-tabs", role: "tablist", "aria-label": "Flashcards and mistakes" }, items);
    list.addEventListener("keydown", function (e) {
      const i = items.indexOf(document.activeElement);
      if (i === -1) return;
      let j = -1;
      if (e.key === "ArrowRight") j = (i + 1) % items.length;
      else if (e.key === "ArrowLeft") j = (i + items.length - 1) % items.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = items.length - 1;
      else if (e.key === " ") { e.preventDefault(); items[i].click(); return; }
      if (j === -1) return;
      e.preventDefault();
      items.forEach(function (n, k) { n.tabIndex = k === j ? 0 : -1; });
      items[j].focus();
    });
    return list;
  }

  /** Header of the "Flashcards and mistakes" page (eyebrow "Learn", number due today) with tabs; tab: today | decks | mistakes | words. */
  function header(tab, lead) {
    const count = hasProfile() && LM.reviewQueue ? LM.reviewQueue.dueCount() : 0;     // due
    const fresh = hasProfile() && LM.reviewQueue ? LM.reviewQueue.freshCount() : 0;   // new today (apart, spec v7 14, P3)
    const head = LM.ui.pageHead({ eyebrow: "Learn", title: "Flashcards and mistakes", lead: lead });
    const h1 = head.querySelector("h1");
    if (h1 && count) h1.appendChild(el("span", { class: "pw-count num", text: count + " due", "aria-label": plural(count, "item") + " due today" }));
    if (h1 && fresh) h1.appendChild(el("span", { class: "pw-count pw-count-new num", text: "New today: " + fresh, "aria-label": "New today: " + fresh }));
    return el("div", { class: "pw-head" }, [head, tabs(tab)]);
  }

  // ---------- the "Due today" card ----------

  function openAddMistake(after) {
    if (!LM.mistakes) return;
    LM.mistakes.openForm().then(function (r) { if (r && after) after(); });
  }

  /**
   * Card: number of items for today, split into flashcards / mistakes / items, "Review now" and "Short session (10)".
   * opts.today — the version on Today (grid 220 px / 1fr / 240 px, no "Short session"); when nothing is waiting, a low card with one line.
   * On the "Due today" tab the zero state is an empty state with the nearest due time.
   */
  function card(opts) {
    opts = opts || {};
    const all = LM.reviewQueue.breakdown();
    const due = all.due, fresh = all.fresh;
    const b = all.total ? Object.assign({}, due.total ? due : fresh, { total: all.total }) : all; // main number and split: due, and when nothing is due, new
    const minutes = LM.reviewQueue.estimateMinutes(all);
    const titleId = "pw-card-title" + (opts.today ? "-today" : "");
    const section = el("section", { class: "card pw-card" + (opts.today ? " is-today" : ""), "aria-labelledby": titleId });

    if (!b.total && opts.today) return zeroCard();
    if (!b.total) {
      const next = LM.reviewQueue.nextDue(Date.now());
      section.appendChild(el("h2", { class: "tile-title", id: titleId, text: "Flashcards and mistakes" }));
      section.appendChild(LM.ui.emptyState({
        art: "nothing-due", title: "Done for today",
        hint: next ? "Next review: " + LM.cards.internal.fmtWhen(next) + "." : "Turn on a deck, save a mistake or do a few exercises – they come back here at growing intervals.",
        class: "es-tile"
      }));
      section.appendChild(links());
      return section;
    }

    section.appendChild(el("div", { class: "pw-card-main" }, [
      el("h2", { class: "pw-card-label", id: titleId, text: "Flashcards and mistakes" }),
      el("p", { class: "pw-card-count" }, el("strong", { class: "num today-number", text: String(due.total ? due.total : fresh.total) })),
      el("p", { class: "pw-card-sub", text: (due.total ? "due" : "new today") + " · about " + minutes + " min" }),
      due.total && fresh.total ? el("p", { class: "pw-card-new num", text: "New today: " + fresh.total }) : null
    ]));
    section.appendChild(el("ul", { class: "pw-rows" }, ROWS.map(function (r) {
      return el("li", { class: "pw-row is-" + r.kind }, [
        el("span", { class: "pw-dot", "aria-hidden": "true" }),
        b[r.kind]
          ? el("a", { class: "pw-row-label", href: "#/review/session?only=" + r.only, "aria-label": r.label + ": " + b[r.kind] + ". Review only these." }, r.label)
          : el("span", { class: "pw-row-label", text: r.label }),
        el("span", { class: "pw-row-n num", text: String(b[r.kind]) })
      ]);
    })));
    const actions = [el("a", { class: "btn btn-primary pw-start", href: "#/review/session" }, due.total ? "Review now (" + due.total + ")" : "Learn new ones")];
    if (b.total > 10 && !opts.today) actions.push(el("a", { class: "btn btn-secondary", href: "#/review/session?max=10" }, "Short session (10)"));
    section.appendChild(el("div", { class: "pw-card-actions" }, [el("div", { class: "pw-card-buttons" }, actions), links()]));
    return section;
  }

  /** Today, when everything is done: a low card with one line ("Done for today. Next: tomorrow (6).") and a "Decks" link. */
  function zeroCard() {
    const u = LM.reviewQueue.upcoming();
    let text = "Done for today.";
    if (u.tomorrow) text += " Next: tomorrow (" + u.tomorrow + ").";
    else if (u.next) text += " Next: " + LM.cards.internal.fmtWhen(u.next) + ".";
    else text += " Turn on a deck or save a mistake – they come back here at growing intervals.";
    return el("section", { class: "card pw-card is-today is-zero", "aria-label": "Flashcards and mistakes" }, [
      el("p", { class: "pw-zero-text" }, [el("strong", { text: "Flashcards and mistakes" }), " · ", text]),
      el("a", { class: "btn-link pw-zero-link", href: "#/review/decks" }, "Decks")
    ]);
  }

  function links() {
    return el("p", { class: "pw-links" }, [
      el("a", { href: "#/review/decks", text: "Decks" }),
      el("a", { href: "#/review/mistakes", text: "My mistakes" }),
      el("button", { type: "button", class: "btn btn-link", onclick: function () { openAddMistake(function () { if (LM.app.refreshLearning) LM.app.refreshLearning(); render(); }); } }, "+ Add mistake")
    ]);
  }

  /** Card on Today (the same number as in the sidebar): a state with a number or a low zero card. */
  function todayCard() {
    if (!hasProfile() || !LM.reviewQueue) return null;
    const n = card({ today: true });
    n.classList.add("bento-tile", "pw-today");
    return n;
  }

  // ---------- view of the "Due today" tab ----------

  function render() {
    const view = document.getElementById("view");
    view.className = "view tool-view powtorki-view";
    view.dataset.file = HOME;
    view.replaceChildren();
    document.title = "Flashcards and mistakes · " + LM.APP.appTitle;
    if (!hasProfile()) {
      view.appendChild(header("today", "Flashcards, your own mistakes and weak spots from exercises in one queue."));
      view.appendChild(el("div", { class: "empty-state" }, [
        el("p", { class: "empty-state-text", text: "Reviews save progress in a profile." }),
        el("p", { class: "empty-state-hint", text: "Add or choose a profile at the top right to start." })
      ]));
      return;
    }
    view.appendChild(header("today", "Flashcards from decks, mistakes from the log and weak spots from exercises in one queue – overdue first."));
    view.appendChild(card());
  }

  LM.review = { HOME: HOME, parseRoute: parseRoute, render: render, header: header, tabs: tabs, card: card, todayCard: todayCard };
})(window.LM);
