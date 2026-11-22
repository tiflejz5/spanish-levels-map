/*
 * notes.js — your own notes (spec 04, part B).
 *
 *   LM.notes.button(key, { title, route })   "Notes" button (with a dot when a note exists);
 *                                              the panel opens only after a click
 *   #/notes                                   "My notes": list, search, delete
 *
 * Page keys: topic id ("a1-verbs-gustar"), "<exam code>:<page>",
 * "lab:<card>", "set:<set>". Data: LM.profileData (slm.notes, per profile):
 * plain text, at most 10,000 characters, empty text = delete.
 * Saved automatically after 500 ms of no typing, when the panel closes and when the page changes.
 * Panel: at the side on a wide screen, a bottom drawer on a narrow one. Esc closes it (and saves).
 * The text goes into the page only as text (textarea.value / textContent).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;
  const HASH = "#/notes";
  const DEBOUNCE = 500;

  function pd() { return LM.profileData; }
  function max() { return pd().NOTE_MAX; }

  let panel = null, area = null, statusEl = null, countEl = null, titleEl = null;
  let current = null;       // { key, title, route, button }
  let timer = null;
  let dirty = false;

  // =====================================================================
  // PRZYCISK
  // =====================================================================

  function button(key, meta) {
    const has = !!pd().getNote(key);
    const b = el("button", {
      type: "button", class: "btn btn-secondary btn-small notes-btn" + (has ? " has-note" : ""),
      "aria-expanded": "false", "aria-controls": "notes-panel",
      "aria-label": has ? "Notes – this page has a note" : "Notes",
      "data-note-key": key,
      onclick: function () {
        if (current && current.key === key && panel && !panel.hidden) { close(true); return; }
        // guest mode: notes belong to a profile — first a profile, then the panel opens
        LM.app.withProfile("Notes are saved in your profile.", function () { open(key, meta, document.querySelector('[data-note-key="' + key + '"]') || b); });
      }
    }, [
      LM.icon("notebook", { size: 16 }),
      el("span", { text: "Notes" }),
      el("span", { class: "notes-dot", "aria-hidden": "true" })
    ]);
    return b;
  }

  function refreshButton(b, has) {
    if (!b) return;
    b.classList.toggle("has-note", has);
    b.setAttribute("aria-label", has ? "Notes – this page has a note" : "Notes");
  }

  // =====================================================================
  // PANEL
  // =====================================================================

  function build() {
    titleEl = el("p", { class: "notes-page", id: "notes-page" });
    area = el("textarea", {
      class: "field notes-area", id: "notes-area", rows: "10", maxlength: String(max()),
      "aria-labelledby": "notes-title notes-page", "aria-describedby": "notes-status",
      placeholder: "Your notes on this page – only for you, saved automatically.",
      oninput: function () { dirty = true; setStatus("Saving…"); updateCount(); clearTimeout(timer); timer = setTimeout(flush, DEBOUNCE); }
    });
    statusEl = el("span", { class: "notes-status", id: "notes-status", role: "status", "aria-live": "polite" });
    countEl = el("span", { class: "notes-count", "aria-live": "polite" });
    panel = el("aside", { class: "notes-panel", id: "notes-panel", hidden: true, "aria-labelledby": "notes-title" }, [
      el("div", { class: "notes-head" }, [
        el("div", null, [el("h2", { class: "notes-title", id: "notes-title" }, [LM.icon("notebook", { size: 18 }), " Notes"]), titleEl]),
        el("button", { type: "button", class: "icon-btn notes-close", "aria-label": "Close notes", onclick: function () { close(true); } }, LM.icon("x", { size: 18 }))
      ]),
      area,
      el("div", { class: "notes-foot" }, [statusEl, countEl, el("a", { class: "notes-all", href: HASH, onclick: function () { close(false); } }, "All notes")])
    ]);
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); close(true); } });
    document.body.appendChild(panel);
    // Page change: save and close
    window.addEventListener("hashchange", function () { if (panel && !panel.hidden) close(false); });
    window.addEventListener("beforeunload", flush);
  }

  function open(key, meta, btn) {
    if (!panel) build();
    if (current && current.key !== key) flush();
    if (current && current.button) current.button.setAttribute("aria-expanded", "false");
    current = { key: key, title: meta && meta.title || "", route: meta && meta.route || location.hash, button: btn };
    const note = pd().getNote(key);
    area.value = note ? note.text : "";
    dirty = false;
    titleEl.textContent = current.title;
    setStatus(note ? "Saved" : "");
    updateCount();
    panel.hidden = false;
    document.body.classList.add("notes-open");
    if (btn) btn.setAttribute("aria-expanded", "true");
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }

  function close(restore) {
    if (!panel || panel.hidden) return;
    flush();
    panel.hidden = true;
    document.body.classList.remove("notes-open");
    const b = current && current.button;
    if (b) b.setAttribute("aria-expanded", "false");
    if (restore !== false && b && document.contains(b)) b.focus();
  }

  /** Saves the current note (empty text deletes the entry). */
  function flush() {
    clearTimeout(timer);
    if (!current || !dirty) return;
    dirty = false;
    const saved = pd().setNote(current.key, area.value, { title: current.title, route: current.route });
    refreshButton(current.button, !!saved);
    setStatus(saved ? "Saved" : "Empty note – deleted");
  }

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  /** Character counter after 80% of the limit. */
  function updateCount() {
    const n = area.value.length;
    countEl.textContent = n >= max() * 0.8 ? LM.fmt.number(n) + " / " + LM.fmt.number(max()) : "";
    countEl.classList.toggle("is-full", n >= max());
  }

  // =====================================================================
  // "MY NOTES" PAGE
  // =====================================================================

  const filter = { query: "" };

  function parseRoute(hash) { return /^#\/notes\/?$/.test(hash || "") ? { kind: "notes" } : null; }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return LM.fmt.date(d) + ", " + LM.fmt.time(d);
  }

  function render() {
    const view = document.getElementById("view");
    view.className = "view tool-view notes-view";
    view.dataset.file = HASH;
    view.replaceChildren();
    document.title = "My notes · " + LM.APP.appTitle;
    view.appendChild(LM.ui.pageHead({ eyebrow: "Your progress · My notes", title: "My notes", lead: "Notes from topic pages, exams, the lab and exercise sets. Only you can see them, in this profile." }));
    const all = pd().noteList();
    if (!all.length) {
      view.appendChild(LM.ui.emptyState({
        art: "empty-notes", title: "You have no notes yet.",
        hint: "Every content page has a “Notes” button. Select it and type your thoughts – they are saved automatically and show up here."
      }));
      return;
    }
    const listBox = el("ul", { class: "notes-list", "aria-live": "polite" });
    const count = el("p", { class: "journal-count", "aria-live": "polite" });
    function paint() {
      const q = filter.query.trim();
      const fold = LM.searchLogic ? LM.searchLogic.fold : function (s) { return String(s).toLocaleLowerCase("pl"); };
      const shown = all.filter(function (n) { return !q || fold(n.title + " " + n.text).indexOf(fold(q)) !== -1; });
      count.textContent = "Notes: " + shown.length + " of " + all.length;
      listBox.replaceChildren();
      if (!shown.length) { listBox.appendChild(LM.ui.emptyState({ tag: "li", art: "no-results", title: "No notes match your search." })); return; }
      shown.forEach(function (n) {
        listBox.appendChild(el("li", { class: "card notes-item" }, [
          el("div", { class: "notes-item-head" }, [
            n.route ? el("a", { class: "notes-item-title", href: n.route, text: n.title || "Note" }) : el("span", { class: "notes-item-title", text: n.title || "Note" }),
            el("span", { class: "notes-item-date", text: "Changed: " + fmtDate(n.updatedAt) })
          ]),
          el("p", { class: "notes-item-text", text: n.text.length > 320 ? n.text.slice(0, 320) + "…" : n.text }),
          el("div", { class: "journal-actions" }, [
            n.route ? el("a", { class: "btn btn-secondary btn-small", href: n.route }, "Go to the page") : null,
            el("button", {
              type: "button", class: "btn btn-danger btn-small", "aria-label": "Delete note: " + (n.title || "Note"),
              onclick: function () {
                LM.dialogs.confirm({
                  title: "Delete this note?",
                  message: "The note on “" + (n.title || "Note") + "” will be deleted. This cannot be undone.",
                  confirmLabel: "Delete note"
                }).then(function (ok) { if (ok) { pd().removeNote(n.key); render(); } });
              }
            }, "Delete")
          ])
        ]));
      });
    }
    const search = el("input", { id: "notes-search", class: "field", type: "search", value: filter.query, placeholder: "Search your notes…", autocomplete: "off", oninput: function () { filter.query = search.value; paint(); } });
    view.appendChild(el("div", { class: "journal-filters", role: "search" }, el("div", { class: "form-field is-grow" }, [el("label", { class: "field-label", for: "notes-search", text: "Search" }), search])));
    view.appendChild(count);
    view.appendChild(listBox);
    paint();
  }

  LM.notes = { HASH: HASH, button: button, parseRoute: parseRoute, render: render, close: close, flush: flush };
})(window.LM);
