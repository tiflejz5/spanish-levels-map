/*
 * profiles.js — the profile menu at the top right and the welcome screen.
 *
 * The button (initials + name of the active profile) opens the menu:
 *   - list of profiles (the active one marked, a click switches),
 *   - for each profile: rename (in place) and delete (with confirmation),
 *   - "+ Add profile" — a name field (Enter confirms, Esc cancels),
 *   - the "Data" section: export, import and reset (logic in data-menu.js).
 *
 * Opening: click / tap (always) and — only with a mouse
 * (hover: hover) and (pointer: fine) — hover, with a short delay
 * before closing. Closing: click outside, Esc, choosing an action. After closing
 * focus returns to the button. Arrow keys ↑/↓ move between items.
 *
 * The user creates the profiles — the code has no built-in profiles.
 * Without any profile the page content is the welcome screen (renderWelcome).
 * Profiles and progress are saved only in this browser (localStorage).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const MAX_NAME = 30;
  const CLOSE_DELAY_MS = 250;

  function app() { return LM.app; }
  function data() { return LM.state.profiles; }

  // Menu state
  let root = null, button = null, menu = null;
  let isOpen = false;
  let openedBy = null;      // "click" | "hover"
  let form = null;          // null | { type: "add" } | { type: "rename", id }
  let errorText = "";
  let closeTimer = null;

  const hoverQuery = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };

  // =====================================================================
  // NAZWY PROFILI
  // =====================================================================

  /** Checks a name: trimmed spaces, at most 30 characters, no duplicates. */
  function validateName(raw, exceptId) {
    const name = String(raw || "").trim().replace(/\s+/g, " ");
    if (!name) return { name: name, error: "Type a profile name." };
    if (name.length > MAX_NAME) return { name: name, error: "A name can have up to " + MAX_NAME + " characters." };
    const taken = (data() ? data().profiles : []).some(function (p) {
      return p.id !== exceptId && p.name.toLocaleLowerCase("pl") === name.toLocaleLowerCase("pl");
    });
    if (taken) return { name: name, error: "A profile called “" + name + "” already exists." };
    return { name: name, error: null };
  }

  /** Circle with initials: "Ola" → O, "Class 4" → C4, "Jan Nowak" → JN. */
  function avatar(profile) {
    const words = profile.name.trim().split(/\s+/);
    const initials = ((words[0] || "?")[0] + (words[1] ? words[1][0] : "")).toUpperCase();
    return el("span", { class: "avatar" + (initials.length > 1 ? " is-small-text" : ""), "aria-hidden": "true", text: initials });
  }

  // =====================================================================
  // BUTTON AND MENU (elements created once, then only updated)
  // =====================================================================

  function ensureDom() {
    if (root) return;
    button = el("button", {
      type: "button",
      class: "profile-btn",
      id: "profile-btn",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-controls": "profile-menu",
      onclick: onButtonClick,
      onkeydown: function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); openMenu("click", true); }
      }
    });
    menu = el("div", {
      class: "profile-menu",
      id: "profile-menu",
      role: "dialog",
      "aria-label": "Profile and data",
      hidden: true,
      onkeydown: onMenuKey
    });
    root = el("div", { class: "profile-switcher" }, [button, menu]);
    root.addEventListener("mouseenter", onPointerEnter);
    root.addEventListener("mouseleave", onPointerLeave);
    // Focus leaves the menu (e.g. Tab) → close
    root.addEventListener("focusout", function (e) {
      const to = e.relatedTarget;
      if (isOpen && to && !root.contains(to) && !to.closest("dialog")) close(false);
    });
    document.getElementById("profile-slot").replaceChildren(root);
  }

  function render() {
    if (!data()) return;
    ensureDom();
    const active = app().getActiveProfile();
    button.replaceChildren.apply(button, active ? [
      avatar(active),
      el("span", { class: "profile-btn-text" }, [
        el("span", { class: "profile-btn-label", text: "Profile" }), " ",
        el("span", { class: "profile-btn-name", text: active.name }),
        el("span", { class: "visually-hidden", text: " – open the profile menu" })
      ]),
      el("span", { class: "profile-caret", "aria-hidden": "true" }, LM.icon("chevron-down", { size: 16 }))
    ] : [
      el("span", { class: "avatar", "aria-hidden": "true" }, LM.icon("user-round", { size: 18 })),
      el("span", { class: "profile-btn-text" }, [
        el("span", { class: "profile-btn-name", text: "Profile" }),
        el("span", { class: "visually-hidden", text: " – no profile, open the menu" })
      ]),
      el("span", { class: "profile-caret", "aria-hidden": "true" }, LM.icon("chevron-down", { size: 16 }))
    ]);
    // The accessible name contains the visible text ("Profile" + name; WCAG 2.5.3). Below ~480 px the button shrinks to the avatar
    // (spec v7 14, P5), so the full name must be in aria-label, not only in hidden text.
    button.setAttribute("aria-label", active ? "Profile " + active.name + " – open the profile menu" : "Profile – no profile, open the menu");
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    root.classList.toggle("is-open", isOpen);
    menu.hidden = !isOpen;
    if (isOpen) renderMenu();
  }

  function renderMenu() {
    const list = data().profiles;
    const activeId = data().activeId;
    const parts = [el("p", { class: "menu-title", text: "Profiles" })];

    if (!list.length) parts.push(el("p", { class: "menu-empty", text: "You have no profile yet." }));

    list.forEach(function (p) {
      if (form && form.type === "rename" && form.id === p.id) {
        parts.push(nameForm({
          value: p.name,
          label: "New name for profile " + p.name,
          submitLabel: "Save",
          onSubmit: function (raw) {
            const v = validateName(raw, p.id);
            if (v.error) return v.error;
            p.name = v.name;
            form = null;
            app().profilesChanged();
            focusInMenu('[data-profile-id="' + CSS.escape(p.id) + '"]');
            return null;
          }
        }));
        return;
      }
      const isActive = p.id === activeId;
      parts.push(el("div", { class: "profile-row" }, [
        el("button", {
          type: "button",
          class: "profile-item" + (isActive ? " is-active" : ""),
          "aria-current": isActive ? "true" : null,
          "data-profile-id": p.id,
          "data-menu-item": "",
          onclick: function () { select(p.id); }
        }, [
          avatar(p),
          el("span", { class: "profile-item-name", text: p.name }),
          el("span", { class: "profile-item-count", text: app().countDone(p.progress) + " known" }),
          el("span", { class: "profile-check", "aria-hidden": "true" }, isActive ? LM.icon("check", { size: 16 }) : null)
        ]),
        el("button", {
          type: "button",
          class: "icon-btn menu-icon",
          "aria-label": "Rename profile " + p.name,
          "data-tooltip": "Rename",
          "data-menu-item": "",
          onclick: function () { startForm({ type: "rename", id: p.id }); }
        }, LM.icon("pencil", { size: 18 })),
        el("button", {
          type: "button",
          class: "icon-btn menu-icon is-danger",
          "aria-label": "Delete profile " + p.name,
          "data-tooltip": "Delete profile",
          "data-tooltip-align": "end",
          "data-menu-item": "",
          onclick: function () { remove(p.id); }
        }, LM.icon("x", { size: 18 }))
      ]));
    });

    if (form && form.type === "add") {
      parts.push(nameForm({
        value: "",
        label: "Name of the new profile",
        placeholder: "e.g. a first name or a class name",
        submitLabel: "Add",
        onSubmit: function (raw) {
          const v = validateName(raw, null);
          if (v.error) return v.error;
          form = null;
          close(true);
          app().addProfile(v.name); // the new profile is active at once
          return null;
        }
      }));
    } else {
      parts.push(el("button", {
        type: "button",
        class: "menu-action menu-add",
        "data-menu-item": "",
        onclick: function () { startForm({ type: "add" }); }
      }, LM.ui.withIcon("plus", "Add profile")));
    }

    // "Learning settings" section (for the active profile)
    if (activeId && LM.profileData) {
      const prefs = LM.profileData.prefs();
      parts.push(el("div", { class: "menu-sep", role: "separator" }));
      parts.push(el("p", { class: "menu-title", text: "Learning settings" }));
      [
        ["autoJournal", "Add mistakes from exercises to the mistake log automatically"],
        ["selectionMenu", "Show a menu when you select text (My words, flashcards)"],
        ["highlightWords", "Underline my words in texts"]
      ].forEach(function (sw) {
        const on = !!prefs[sw[0]];
        parts.push(el("button", {
          type: "button",
          class: "menu-action menu-switch",
          role: "switch",
          "aria-checked": on ? "true" : "false",
          "data-menu-item": "",
          "data-switch": sw[0],
          onclick: function () {
            LM.profileData.setPref(sw[0], !on);
            if (LM.words) LM.words.prefsChanged();
            renderMenu();
            focusInMenu('[data-switch="' + sw[0] + '"]');
          }
        }, [
          el("span", { class: "menu-switch-text" }, sw[1]),
          el("span", { class: "switch-track", "aria-hidden": "true" }, el("span", { class: "switch-thumb" }))
        ]));
      });
    }

    // "Mine" section: pages taken out of the left panel (same routes)
    if (activeId) {
      parts.push(el("div", { class: "menu-sep", role: "separator" }));
      parts.push(el("p", { class: "menu-title", text: "Mine" }));
      [
        ["#/stats", "chart-column", "Stats"],
        ["#/notes", "notebook", "My notes"],
        ["#/placement", "target", "Placement test"]
      ].forEach(function (it) {
        parts.push(el("a", {
          class: "menu-action", href: it[0], "data-menu-item": "",
          "aria-current": location.hash === it[0] ? "page" : null,
          onclick: function () { close(false); }
        }, LM.ui.withIcon(it[1], it[2])));
      });
    }

    // "Data" section
    parts.push(el("div", { class: "menu-sep", role: "separator" }));
    parts.push(el("p", { class: "menu-title", text: "Data" }));
    parts.push(dataAction("Export data", function () { LM.dataMenu.exportAll(); }, false, "download"));
    parts.push(dataAction("Import data…", function () { LM.dataMenu.importAll(); }, false, "upload"));
    parts.push(dataAction("Reset data…", function () { LM.dataMenu.resetAll(); }, true, "rotate-ccw"));
    parts.push(el("p", { class: "menu-note", text: "Your data is saved only in this browser. Export it from time to time." }));

    menu.replaceChildren.apply(menu, parts);
  }

  function dataAction(label, fn, danger, iconName) {
    return el("button", {
      type: "button",
      class: "menu-action" + (danger ? " is-danger" : ""),
      "data-menu-item": "",
      onclick: function () { close(true); fn(); }
    }, iconName ? LM.ui.withIcon(iconName, label) : label);
  }

  /** Name form (add / rename). onSubmit returns an error message or null. */
  function nameForm(opts) {
    const input = el("input", {
      type: "text",
      class: "field menu-input",
      value: opts.value,
      maxlength: String(MAX_NAME + 10),
      placeholder: opts.placeholder || "",
      autocomplete: "off",
      "aria-label": opts.label,
      "aria-describedby": "profile-form-error",
      "aria-invalid": errorText ? "true" : "false",
      "data-menu-item": "",
      "data-form-input": ""
    });
    const error = el("p", { class: "menu-error", id: "profile-form-error", "aria-live": "polite", text: errorText });
    return el("form", {
      class: "menu-form",
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        const message = opts.onSubmit(input.value);
        if (message) {
          errorText = message;
          error.textContent = message;
          input.setAttribute("aria-invalid", "true");
          input.focus();
        }
      }
    }, [
      el("div", { class: "menu-form-row" }, [
        input,
        el("button", { type: "submit", class: "btn btn-primary btn-small", "data-menu-item": "" }, opts.submitLabel),
        el("button", { type: "button", class: "btn btn-secondary btn-small", "data-menu-item": "", onclick: cancelForm }, "Cancel")
      ]),
      error
    ]);
  }

  // =====================================================================
  // OTWIERANIE / ZAMYKANIE
  // =====================================================================

  function focusInMenu(selector) {
    const target = selector ? menu.querySelector(selector) : null;
    (target || menu.querySelector(".profile-item.is-active") || menu.querySelector("[data-menu-item]") || button).focus();
  }

  function openMenu(by, focusFirst) {
    clearTimeout(closeTimer);
    isOpen = true;
    openedBy = by;
    form = null;
    errorText = "";
    render();
    if (focusFirst) focusInMenu();
  }

  function close(focusButton) {
    clearTimeout(closeTimer);
    if (!isOpen) return;
    isOpen = false;
    openedBy = null;
    form = null;
    errorText = "";
    render();
    if (focusButton) button.focus();
  }

  function onButtonClick(e) {
    if (isOpen && openedBy === "hover") { openedBy = "click"; return; } // pins a menu opened by hover
    if (isOpen) { close(true); return; }
    openMenu("click", e.detail === 0); // from the keyboard (Enter/Space) focus goes into the menu at once
  }

  function onPointerEnter() {
    if (!hoverQuery.matches) return;
    clearTimeout(closeTimer);
    if (!isOpen) openMenu("hover", false);
  }

  function onPointerLeave() {
    if (!hoverQuery.matches || openedBy !== "hover" || form) return;
    if (root.contains(document.activeElement) && document.activeElement !== button) return;
    closeTimer = setTimeout(function () { close(false); }, CLOSE_DELAY_MS);
  }

  function startForm(f) {
    openedBy = "click";
    form = f;
    errorText = "";
    render();
    focusInMenu("[data-form-input]");
  }

  function cancelForm() {
    const was = form;
    form = null;
    errorText = "";
    render();
    focusInMenu(was && was.type === "rename" ? '[data-profile-id="' + CSS.escape(was.id) + '"]' : ".menu-add");
  }

  function onMenuKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (form) cancelForm(); else close(true);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      if (e.target.matches("input") && (e.key === "Home" || e.key === "End")) return; // in a field: the caret
      const items = Array.prototype.slice.call(menu.querySelectorAll("[data-menu-item]"));
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      let next;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % items.length;
      else next = i <= 0 ? items.length - 1 : i - 1;
      items[next].focus();
    }
  }

  /** Click / tap outside the menu and Esc close it (registered once at start). */
  function bindEvents() {
    function outside(e) {
      if (!isOpen) return;
      if (root.contains(e.target) || e.target.closest("dialog")) return;
      close(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen && !document.querySelector("dialog[open]")) close(true);
    });
  }

  // =====================================================================
  // ACTIONS ON PROFILES
  // =====================================================================

  function select(profileId) {
    close(true);
    app().selectProfile(profileId);
  }

  function remove(profileId) {
    const list = data().profiles;
    const index = list.findIndex(function (p) { return p.id === profileId; });
    if (index === -1) return;
    const profile = list[index];
    close(false);
    LM.dialogs.confirm({
      title: "Delete this profile?",
      message: "The profile “" + profile.name + "” will be deleted together with its progress (" +
        app().countDone(profile.progress) + " topics marked “I know this”), mistake log, streak and placement result. This cannot be undone.",
      confirmLabel: "Delete profile"
    }).then(function (ok) {
      if (ok) {
        list.splice(index, 1);
        LM.storage.deleteProfile(profileId); // every per-profile key of the registry (js/profile-data.js)
        if (data().activeId === profileId) {
          // After deleting the last profile: no active profile → welcome screen
          data().activeId = list.length ? list[Math.min(index, list.length - 1)].id : null;
        }
        app().profilesChanged();
      }
      if (button) button.focus();
    });
  }

  // =====================================================================
  // WELCOME SCREEN (when the browser has no profile)
  // =====================================================================

  /**
   * Guest mode (spec v7 14, P1): an action that saves something (I know this, a note, a result, a flashcard…) without a profile.
   * Opens the "Create a profile to save your progress…" dialog with a name field. Returns Promise<boolean>:
   * true = a profile was created (the caller then does its action), false = cancelled.
   * With an active profile it returns true at once. One dialog at a time.
   */
  let pending = null;
  function requireProfile(opts) {
    opts = opts || {};
    if (app().getActiveProfile()) return Promise.resolve(true);
    if (pending) return pending;
    const input = el("input", {
      type: "text", class: "field", id: "guest-name", maxlength: String(MAX_NAME + 10), autocomplete: "off",
      "aria-describedby": "guest-error", placeholder: "e.g. a first name, a class name or “My progress”"
    });
    const error = el("p", { class: "dialog-error", id: "guest-error", "aria-live": "polite" });
    function submit() {
      const v = validateName(input.value, null);
      if (v.error) { error.textContent = v.error; input.setAttribute("aria-invalid", "true"); input.focus(); return false; }
      app().addProfile(v.name);
      return true;
    }
    const dlg = LM.dialogs.open({
      title: "Create a profile",
      className: "dialog-guest",
      body: [
        el("p", { text: (opts.reason ? opts.reason + " " : "") + "Create a profile to save your progress (the data stays in this browser)." }),
        el("label", { class: "field-label", for: "guest-name", text: "Profile name" }),
        input,
        error
      ],
      cancelValue: false,
      actions: [
        { label: "Not now", value: false },
        { label: "Create a profile", variant: "btn-primary", value: true, onClick: function () { return submit(); } }
      ]
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); if (submit()) dlg.close(true); }
    });
    input.focus();
    pending = dlg.result.then(function (ok) { pending = null; return !!ok; });
    return pending;
  }

  function renderWelcome(opts) {
    opts = opts || {};
    const view = document.getElementById("view");
    view.className = "view welcome-view";
    view.dataset.file = "#welcome";
    view.replaceChildren();
    document.title = LM.APP.appTitle + " (A1–C2)";

    const input = el("input", {
      type: "text",
      id: "welcome-name",
      class: "field",
      maxlength: String(MAX_NAME + 10),
      autocomplete: "off",
      "aria-describedby": "welcome-error",
      placeholder: "e.g. a first name, a class name or “My progress”"
    });
    const error = el("p", { class: "menu-error", id: "welcome-error", "aria-live": "polite" });
    // "Add profile and take the placement test" — a nudge for a new profile (no progress yet)
    let thenTest = false;
    const welcomeForm = el("form", {
      class: "welcome-form",
      novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        const v = validateName(input.value, null);
        if (v.error) { error.textContent = v.error; input.setAttribute("aria-invalid", "true"); input.focus(); thenTest = false; return; }
        const goTest = thenTest && LM.placement;
        thenTest = false;
        app().addProfile(v.name);
        if (goTest) location.hash = LM.placement.HASH;
        else if (LM.trail && /^#\/today\/?$/.test(location.hash)) location.hash = LM.trail.HASH; // first visit: "placement test or start at A1" on the trail
      }
    }, [
      el("label", { class: "field-label", for: "welcome-name", text: "Profile name" }),
      el("div", { class: "welcome-row" }, [input, el("button", { type: "submit", class: "btn btn-primary" }, "Add profile")]),
      error,
      LM.placement ? el("div", { class: "welcome-test" }, [
        el("p", { class: "tool-note", text: "Not sure which level to start at? After adding a profile, take the short placement test (12 questions, about 6 minutes)." }),
        el("button", { type: "submit", class: "btn btn-secondary", onclick: function () { thenTest = true; } }, "Add profile and take the placement test")
      ]) : null
    ]);

    view.appendChild(el("section", { class: "card welcome", "aria-labelledby": "welcome-title" }, [
      el("h1", { id: "welcome-title", class: "welcome-title", text: opts.personal ? "This page needs a profile" : "Welcome to " + LM.APP.appTitle }),
      opts.personal ? el("p", { class: "welcome-lead", text: "Today, flashcards, stats and notes show your progress, so they belong to a profile. Create one and you come back to this page. You can browse the content (levels, practice, the lab, exams) without a profile." })
        : el("p", { class: "welcome-lead", text: "A map of " + LM.APP.language + " from A1 to C2, explained in English: what to know at each level, " +
        "with explanations, examples and practice." }),
      el("ul", { class: "welcome-list" }, [
        el("li", { text: "Mark “I know this” on the topics you know and follow your progress at each level." }),
        el("li", { text: "A profile is a person or a group whose progress you follow. You can add more than one." }),
        el("li", { text: "Profiles and progress are saved only in this browser – nothing is sent anywhere." })
      ]),
      welcomeForm
    ]));
    input.focus();
  }

  LM.profiles = {
    render: render,
    renderWelcome: renderWelcome,
    requireProfile: requireProfile,
    bindEvents: bindEvents,
    validateName: validateName
  };
})(window.LM);
