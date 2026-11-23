/*
 * exam-ui.js — shared exam elements (spec 12; generic, everything from the registry):
 *   LM.examMy            "My exams" per profile: list(), isMine(id), info(id), pin(id), unpin(id)
 *   LM.examDate.card     one exam date card (exams from the registry)
 *   LM.examCover         covers: full (start page), compact (sub-pages), mini (tile: home, Today)
 * Pure logic (myExams, formatDateLong, daysBetween) is in js/exam-logic.js and has tests.
 * Exam dates live in slm.exams (js/profile-data.js), per profile.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  function L() { return LM.examLogic; }
  function pd() { return LM.profileData; }
  function registry() { return LM.EXAM_REGISTRY || { exams: [] }; }
  function byId(id) { return registry().exams.find(function (e) { return e.id === id; }) || null; }

  // =====================================================================
  // EXAM DATE AND STATE
  // =====================================================================

  function getDate(e) {
    return pd() ? pd().examData(e.id).examDate : "";
  }

  function setDate(e, value) {
    if (!pd()) return;
    pd().examData(e.id).examDate = value || "";
    pd().saveExams();
  }

  function examsRecord() {
    const rec = { exams: {}, my: pd() ? pd().examMy() : {} };
    registry().exams.forEach(function (e) { if (pd()) rec.exams[e.id] = { examDate: pd().examData(e.id).examDate }; });
    return rec;
  }

  function state() {
    return L().examMyState({
      registry: registry(),
      examsRecord: examsRecord(),
      isSetDone: function (id) { return !!(pd() && pd().setScore(id)); }
    });
  }

  /** My exams: [{ id, reason, days }] (pure logic in exam-logic.js). */
  function list() { return L().myExams(state(), registry()); }

  function isMine(id) { return list().some(function (x) { return x.id === id; }); }

  /** { date, days, done, total } for covers and the panel. */
  function info(id) {
    const e = byId(id);
    const st = state();
    const date = e ? getDate(e) : "";
    return { date: date, days: date ? L().daysBetween(date) : null, done: st.doneSets[id] || 0, total: st.totalSets[id] || 0 };
  }

  function pin(id) { if (pd() && pd().setExamMy(id, "pinned")) changed(); }
  function unpin(id) { if (pd() && pd().setExamMy(id, "hidden")) changed(); }

  // =====================================================================
  // COUNTDOWN TEXTS
  // =====================================================================

  /** State text without the big number: "Exam tomorrow", "The exam was 3 days ago", "Set a date…". */
  function stateText(days) {
    if (days === null) return "Set a date to see the countdown";
    if (days === 1) return "Exam tomorrow";
    if (days === 0) return "Exam today";
    if (days < 0) return "The exam was " + LM.plural(-days, "day") + " ago";
    return LM.plural(days, "day") + " until the exam";
  }

  /** Short, for tiles and the panel: "188 days until the exam", or null when there is no date. */
  function shortCountdown(days) { return days === null ? null : stateText(days); }

  // =====================================================================
  // REFRESH AFTER A CHANGE (date, pin): covers, buttons and the panel
  // =====================================================================

  function changed() {
    document.querySelectorAll("[data-exam-cover]").forEach(function (node) {
      const e = byId(node.getAttribute("data-exam-cover"));
      if (e) node.replaceWith(cover(e, node.getAttribute("data-variant")));
    });
    document.querySelectorAll("[data-exam-pin]").forEach(function (node) {
      const e = byId(node.getAttribute("data-exam-pin"));
      if (e) node.replaceWith(pinButton(e));
    });
    if (LM.exams) LM.exams.renderNav();
  }

  // =====================================================================
  // DATE CARD (B2)
  // =====================================================================

  /**
   * LM.examDate.card({ examId, getDate, setDate, suggested, hint }): on the left a big number of days or the state text,
   * on the right the date field with the date written out and the actions "Use the main date" / "Remove the date".
   */
  function dateCard(o) {
    const inputId = "exam-date-" + o.examId;
    const number = el("span", { class: "exam-date-number num" });
    const text = el("span", { class: "exam-date-text" });
    const pretty = el("p", { class: "exam-date-pretty", id: inputId + "-pretty" });
    const actions = el("div", { class: "exam-date-actions" });
    const input = el("input", {
      type: "date", id: inputId, class: "field exam-date-input", value: o.getDate(),
      "aria-describedby": inputId + "-pretty",
      onchange: function () { save(input.value); }
    });

    function save(value) {
      o.setDate(value || "");
      input.value = value || "";
      update();
      changed();
    }

    function update() {
      const date = o.getDate();
      const days = date ? L().daysBetween(date) : null;
      const big = days !== null && days > 1;
      number.textContent = big ? String(days) : "";
      number.hidden = !big;
      text.textContent = big ? "days until the exam" : stateText(days);
      pretty.textContent = date ? L().formatDateLong(date) : "";
      pretty.hidden = !date;
      actions.replaceChildren();
      if (o.suggested && date !== o.suggested) {
        actions.appendChild(el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { save(o.suggested); } },
          "Use the main date: " + L().formatDateLong(o.suggested).replace(/^[^,]+, /, "")));
      }
      if (date) actions.appendChild(el("button", { type: "button", class: "btn btn-link btn-small", onclick: function () { save(""); } }, "Remove the date"));
    }
    update();
    return el("section", { class: "card exam-date-card", "aria-label": "Exam countdown" }, [
      el("div", { class: "exam-date-main", "aria-live": "polite" }, [number, text]),
      el("div", { class: "exam-date-side" }, [
        el("label", { class: "field-label", for: inputId, text: "Exam date" }),
        input,
        pretty,
        actions,
        o.hint ? el("p", { class: "exam-date-hint" }, o.hint) : null
      ])
    ]);
  }

  /** Date card for an exam from the registry: exams without a fixed date get a hint about the exam center. */
  function dateCardFor(e) {
    return dateCard({
      examId: e.id,
      getDate: function () { return getDate(e); },
      setDate: function (v) { setDate(e, v); },
      suggested: e.suggestedDate || null,
      hint: e.suggestedDate ? null : "The date depends on the exam center."
    });
  }

  // =====================================================================
  // COVERS (B3)
  // =====================================================================

  /** Exam colours as CSS variables (from the registry; the app accent when an exam has none). */
  function colorStyle(e) {
    return "--exam-accent:" + (e.accent || "var(--accent)") + ";--exam-accent-2:" + (e.accent2 || e.accent || "var(--accent)");
  }

  function href(e) { return "#/exams/" + e.id; }

  /** Full width: code, name, level and institution; on the right the date or "Set a date". */
  function coverFull(e) {
    const i = info(e.id);
    let side;
    if (i.days === null) {
      side = el("button", {
        type: "button", class: "btn btn-link exam-cover-setdate",
        onclick: function () {
          const input = document.getElementById("exam-date-" + e.id);
          if (input) { input.scrollIntoView({ block: "center" }); input.focus(); }
        }
      }, "Set a date");
    } else {
      side = el("p", { class: "exam-cover-date" }, [
        el("span", { class: "exam-cover-date-day", text: L().formatDateLong(i.date).replace(/^[^,]+, /, "") }),
        el("span", { class: "exam-cover-date-left", text: stateText(i.days) })
      ]);
    }
    return el("header", { class: "exam-cover is-full", "data-exam-cover": e.id, "data-variant": "full", style: colorStyle(e) }, [
      el("span", { class: "exam-cover-bar", "aria-hidden": "true" }),
      el("span", { class: "exam-cover-code", "aria-hidden": "true", text: e.code }),
      el("div", { class: "exam-cover-text" }, [
        el("h1", { class: "exam-cover-title", text: e.label }),
        e.subtitle ? el("p", { class: "exam-cover-sub", text: e.subtitle }) : null
      ]),
      el("div", { class: "exam-cover-side" }, side)
    ]);
  }

  /** Compact, on sub-pages: a 6 px bar, a 28 px code, the name and the countdown (link to the start page). */
  function coverCompact(e) {
    const i = info(e.id);
    return el("header", { class: "exam-cover is-compact", "data-exam-cover": e.id, "data-variant": "compact", style: colorStyle(e) }, [
      el("span", { class: "exam-cover-bar", "aria-hidden": "true" }),
      el("a", { class: "exam-cover-home", href: href(e) }, [
        el("span", { class: "exam-cover-code", "aria-hidden": "true", text: e.code }),
        el("span", { class: "exam-cover-title", text: e.label }),
        el("span", { class: "visually-hidden", text: " – exam overview" })
      ]),
      el("a", { class: "exam-cover-count" + (i.days === null ? " is-unset" : ""), href: href(e) },
        i.days === null ? "Set a date" : shortCountdown(i.days))
    ]);
  }

  /** Mini: a "My exams" tile (home, Today). */
  function coverMini(e) {
    const i = info(e.id);
    const progress = i.total ? "zestawy " + i.done + "/" + i.total : null;
    return el("a", { class: "card exam-cover is-mini", href: href(e), "data-exam-cover": e.id, "data-variant": "mini", style: colorStyle(e) }, [
      el("span", { class: "exam-cover-bar", "aria-hidden": "true" }),
      el("span", { class: "exam-cover-code", "aria-hidden": "true", text: e.code }),
      el("span", { class: "exam-cover-body" }, [
        el("span", { class: "exam-cover-title", text: e.label }),
        el("span", { class: "exam-cover-count" + (i.days === null ? " is-unset" : ""), text: i.days === null ? "Set a date" : shortCountdown(i.days) }),
        progress ? el("span", { class: "exam-cover-progress", text: progress }) : null
      ]),
      el("span", { class: "exam-cover-chev", "aria-hidden": "true" }, LM.icon("chevron-right", { size: 20 }))
    ]);
  }

  /** Exam choice tile (home, when nothing is pinned): code, name, level and institution; no countdown or date. */
  function coverPick(e) {
    return el("a", { class: "card exam-cover is-mini is-pick", href: href(e), "data-exam-cover": e.id, "data-variant": "pick", style: colorStyle(e) }, [
      el("span", { class: "exam-cover-bar", "aria-hidden": "true" }),
      el("span", { class: "exam-cover-code", "aria-hidden": "true", text: e.code }),
      el("span", { class: "exam-cover-body" }, [
        el("span", { class: "exam-cover-title", text: e.label }),
        el("span", { class: "exam-cover-count", text: e.subtitle || "" })
      ]),
      el("span", { class: "exam-cover-chev", "aria-hidden": "true" }, LM.icon("chevron-right", { size: 20 }))
    ]);
  }

  function cover(e, variant) {
    return variant === "compact" ? coverCompact(e) : variant === "mini" ? coverMini(e) : coverFull(e);
  }

  // =====================================================================
  // PINNING (B1) AND TILES
  // =====================================================================

  /** "Pin to Today" / "Unpin from Today and home" — the state comes from myExams. */
  function pinButton(e) {
    const mine = isMine(e.id);
    return el("p", { class: "exam-pin", "data-exam-pin": e.id }, el("button", {
      type: "button", class: "btn btn-secondary",
      "aria-pressed": mine ? "true" : "false",
      onclick: function () { if (mine) unpin(e.id); else pin(e.id); }
    }, LM.ui.withIcon(mine ? "pin-off" : "pin", mine ? "Unpin from Today and home" : "Pin to Today")));
  }

  /** The "Your exams" section on the home page (or one line when nothing is mine). */
  function homeSection() {
    const mine = list();
    const section = el("section", { class: "home-exams", "aria-labelledby": "home-exams-title" }, [
      el("h2", { id: "home-exams-title", class: "home-exams-title", text: mine.length ? "Your exams" : "Exams" })
    ]);
    if (!mine.length) {
      // Nothing is pinned (also in guest mode): tiles of all exams instead of a single sentence (spec v7 14, P6)
      section.appendChild(el("p", { class: "tool-note", text: "Preparing for an exam? Choose it. On its page you can pin it to Today." }));
      section.appendChild(el("div", { class: "home-exams-grid" }, registry().exams.filter(function (e) { return e.status !== "hidden"; }).map(coverPick)));
      return section;
    }
    section.appendChild(el("div", { class: "home-exams-grid" }, mine.map(function (m) { return coverMini(byId(m.id)); })));
    return section;
  }

  /** Tiles on Today: at most 2 of my exams, the nearest date first. */
  function todayTiles() {
    return list().slice(0, 2).map(function (m) {
      const tile = coverMini(byId(m.id));
      tile.classList.add("bento-tile", "bento-exam");
      return tile;
    });
  }

  /** Caption in the panel: a countdown only for my exams; for the others the level and institution. */
  function navSub(e) {
    const i = info(e.id);
    return isMine(e.id) && i.days !== null && i.days > 0 ? stateText(i.days) : (e.subtitle || "");
  }

  LM.examMy = { navSub: navSub, list: list, isMine: isMine, info: info, pin: pin, unpin: unpin, getDate: getDate, setDate: setDate, byId: byId };
  LM.examDate = { card: dateCard, cardFor: dateCardFor, stateText: stateText };
  LM.examCover = { full: coverFull, compact: coverCompact, mini: coverMini, pinButton: pinButton, homeSection: homeSection, todayTiles: todayTiles, changed: changed, shortCountdown: shortCountdown };
})(window.LM);
