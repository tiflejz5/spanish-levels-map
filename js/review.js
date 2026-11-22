/*
 * review.js — widok „Fiszki i błędy” (#/review, paczka v8, spec 20 R3).
 *
 *   #/review                      zakładka „Na dziś”: karta z liczbą, rozbiciem i „Powtarzaj teraz” (ten plik)
 *   #/review/decks[/…]        zakładka „Talie” (js/cards.js, js/cards-browse.js)
 *   #/review/mistakes       zakładka „Moje błędy” (js/mistakes.js)
 *   #/review/words       zakładka „Moje słowa” (js/words.js)
 *   #/review/session[?tylko=…]  sesja zunifikowana (js/cards.js)
 *
 * Liczby i kolejka: js/review-queue.js. Tu: wspólny nagłówek z zakładkami (role="tablist"), karta „Na dziś”
 * (ta sama na stronie Dziś) i widok pierwszej zakładki.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const HOME = "#/review";
  const TABS = [
    { id: "dzis", label: "Na dziś", href: HOME },
    { id: "talie", label: "Talie", href: "#/review/decks" },
    { id: "bledy", label: "Moje błędy", href: "#/review/mistakes" },
    { id: "slowa", label: "Moje słowa", href: "#/review/words" }
  ];
  const ROWS = [
    { kind: "card", label: "Fiszki z talii", only: "decks" },
    { kind: "mistake", label: "Błędy z dziennika", only: "mistakes" },
    { kind: "exercise", label: "Słabe punkty z ćwiczeń", only: "weak" }
  ];

  function hasProfile() { return !!(LM.app && LM.app.getActiveProfile()); }
  function plural(n, one, few, many) { return LM.plural(n, one, few, many); }

  function parseRoute(hash) {
    return /^#\/review\/?$/.test(hash || "") ? { kind: "today" } : null;
  }

  // ---------- nagłówek i zakładki ----------

  /** Zakładki widoku. Aktywna ma aria-selected i tabindex 0; strzałki, Home i End przesuwają fokus, Enter / Spacja otwiera. */
  function tabs(active) {
    const items = TABS.map(function (t) {
      const on = t.id === active;
      return el("a", {
        class: "pw-tab" + (on ? " is-active" : ""), href: t.href, role: "tab", id: "pw-tab-" + t.id,
        "aria-selected": on ? "true" : "false", tabindex: on ? "0" : "-1"
      }, t.label);
    });
    const list = el("div", { class: "pw-tabs", role: "tablist", "aria-label": "Fiszki i błędy" }, items);
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

  /** Nagłówek strony „Fiszki i błędy” (etykieta „Nauka”, liczba na dziś) z zakładkami; tab: dzis | talie | bledy | slowa. */
  function header(tab, lead) {
    const count = hasProfile() && LM.reviewQueue ? LM.reviewQueue.dueCount() : 0;     // do powtórki
    const fresh = hasProfile() && LM.reviewQueue ? LM.reviewQueue.freshCount() : 0;   // nowe dziś (osobno, spec v7 14, P3)
    const head = LM.ui.pageHead({ eyebrow: "Nauka", title: "Fiszki i błędy", lead: lead });
    const h1 = head.querySelector("h1");
    if (h1 && count) h1.appendChild(el("span", { class: "pw-count num", text: count + " do powtórki", "aria-label": count + " " + plural(count, "pozycja", "pozycje", "pozycji") + " do powtórki dziś" }));
    if (h1 && fresh) h1.appendChild(el("span", { class: "pw-count pw-count-new num", text: "Nowe dziś: " + fresh, "aria-label": "Nowe dziś: " + fresh }));
    return el("div", { class: "pw-head" }, [head, tabs(tab)]);
  }

  // ---------- karta „Na dziś” ----------

  function openAddMistake(after) {
    if (!LM.mistakes) return;
    LM.mistakes.openForm().then(function (r) { if (r && after) after(); });
  }

  /**
   * Karta: liczba pozycji na dziś, rozbicie na fiszki / błędy / zadania, „Powtarzaj teraz” i „Krótka sesja (10)”.
   * opts.today — wersja na stronie Dziś (siatka 220 px / 1fr / 240 px, bez „Krótka sesja”); gdy nic nie czeka, niska karta z jedną linijką.
   * Na zakładce „Na dziś” stan zerowy to stan pusty z najbliższym terminem.
   */
  function card(opts) {
    opts = opts || {};
    const all = LM.reviewQueue.breakdown();
    const due = all.due, fresh = all.fresh;
    const b = all.total ? Object.assign({}, due.total ? due : fresh, { total: all.total }) : all; // główna liczba i rozbicie: do powtórki, a gdy nic nie zalega, nowe
    const minutes = LM.reviewQueue.estimateMinutes(all);
    const titleId = "pw-card-title" + (opts.today ? "-today" : "");
    const section = el("section", { class: "card pw-card" + (opts.today ? " is-today" : ""), "aria-labelledby": titleId });

    if (!b.total && opts.today) return zeroCard();
    if (!b.total) {
      const next = LM.reviewQueue.nextDue(Date.now());
      section.appendChild(el("h2", { class: "tile-title", id: titleId, text: "Fiszki i błędy" }));
      section.appendChild(LM.ui.emptyState({
        art: "brak-powtorek", title: "Na dziś koniec",
        hint: next ? "Najbliższa powtórka: " + LM.cards.internal.fmtWhen(next) + "." : "Włącz talię, zapisz błąd albo zrób kilka ćwiczeń – wrócą tu w rosnących odstępach.",
        class: "es-tile"
      }));
      section.appendChild(links());
      return section;
    }

    section.appendChild(el("div", { class: "pw-card-main" }, [
      el("h2", { class: "pw-card-label", id: titleId, text: "Fiszki i błędy" }),
      el("p", { class: "pw-card-count" }, el("strong", { class: "num today-number", text: String(due.total ? due.total : fresh.total) })),
      el("p", { class: "pw-card-sub", text: (due.total ? "do powtórki" : "nowe na dziś") + " · ok. " + minutes + " min" }),
      due.total && fresh.total ? el("p", { class: "pw-card-new num", text: "Nowe dziś: " + fresh.total }) : null
    ]));
    section.appendChild(el("ul", { class: "pw-rows" }, ROWS.map(function (r) {
      return el("li", { class: "pw-row is-" + r.kind }, [
        el("span", { class: "pw-dot", "aria-hidden": "true" }),
        b[r.kind]
          ? el("a", { class: "pw-row-label", href: "#/review/session?only=" + r.only, "aria-label": r.label + ": " + b[r.kind] + ". Powtarzaj tylko to." }, r.label)
          : el("span", { class: "pw-row-label", text: r.label }),
        el("span", { class: "pw-row-n num", text: String(b[r.kind]) })
      ]);
    })));
    const actions = [el("a", { class: "btn btn-primary pw-start", href: "#/review/session" }, due.total ? "Powtarzaj teraz" : "Ucz się nowych")];
    if (b.total > 10 && !opts.today) actions.push(el("a", { class: "btn btn-secondary", href: "#/review/session?max=10" }, "Krótka sesja (10)"));
    section.appendChild(el("div", { class: "pw-card-actions" }, [el("div", { class: "pw-card-buttons" }, actions), links()]));
    return section;
  }

  /** Dziś, gdy wszystko zrobione: niska karta z jedną linijką („Na dziś zrobione. Następne: jutro (6).”) i linkiem „Talie”. */
  function zeroCard() {
    const u = LM.reviewQueue.upcoming();
    let text = "Na dziś zrobione.";
    if (u.tomorrow) text += " Następne: jutro (" + u.tomorrow + ").";
    else if (u.next) text += " Następne: " + LM.cards.internal.fmtWhen(u.next) + ".";
    else text += " Włącz talię albo zapisz błąd – wrócą tu w rosnących odstępach.";
    return el("section", { class: "card pw-card is-today is-zero", "aria-label": "Fiszki i błędy" }, [
      el("p", { class: "pw-zero-text" }, [el("strong", { text: "Fiszki i błędy" }), " · ", text]),
      el("a", { class: "btn-link pw-zero-link", href: "#/review/decks" }, "Talie")
    ]);
  }

  function links() {
    return el("p", { class: "pw-links" }, [
      el("a", { href: "#/review/decks", text: "Talie" }),
      el("a", { href: "#/review/mistakes", text: "Moje błędy" }),
      el("button", { type: "button", class: "btn btn-link", onclick: function () { openAddMistake(function () { if (LM.app.refreshLearning) LM.app.refreshLearning(); render(); }); } }, "+ Dodaj błąd")
    ]);
  }

  /** Karta na stronie Dziś (ta sama liczba co w pasku): stan z liczbą albo niska karta zerowa. */
  function todayCard() {
    if (!hasProfile() || !LM.reviewQueue) return null;
    const n = card({ today: true });
    n.classList.add("bento-tile", "pw-today");
    return n;
  }

  // ---------- widok zakładki „Na dziś” ----------

  function render() {
    const view = document.getElementById("view");
    view.className = "view tool-view powtorki-view";
    view.dataset.file = HOME;
    view.replaceChildren();
    document.title = "Fiszki i błędy · " + LM.APP.appTitle;
    if (!hasProfile()) {
      view.appendChild(header("dzis", "Fiszki, własne błędy i słabe punkty z ćwiczeń w jednej kolejce."));
      view.appendChild(el("div", { class: "empty-state" }, [
        el("p", { class: "empty-state-text", text: "Powtórki zapisują postęp w profilu." }),
        el("p", { class: "empty-state-hint", text: "Dodaj albo wybierz profil w prawym górnym rogu, żeby zacząć." })
      ]));
      return;
    }
    view.appendChild(header("dzis", "Fiszki z talii, błędy z dziennika i słabe punkty z ćwiczeń w jednej kolejce – najpierw to, co zaległe."));
    view.appendChild(card());
  }

  LM.review = { HOME: HOME, parseRoute: parseRoute, render: render, header: header, tabs: tabs, card: card, todayCard: todayCard };
})(window.LM);
