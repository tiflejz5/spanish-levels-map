/*
 * dialogs.js — simple dialogs (confirm, ask for text, message)
 * built on the <dialog> element.
 * They replace the system confirm()/prompt() so they match the app's look.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const el = LM.utils.el;
  let counter = 0;

  /**
   * Opens a dialog. Options:
   *   title, body (element/text/array), className,
   *   actions: [{ label, value, variant, autofocus }],
   *   cancelValue: value returned after Esc
   * Returns { element, close(value), result: Promise }.
   */
  function open(opts) {
    const titleId = "dlg-title-" + (++counter);
    const previousFocus = document.activeElement;
    let resolveFn;
    const result = new Promise(function (resolve) { resolveFn = resolve; });
    let closed = false;

    const dialog = el("dialog", {
      class: "dialog " + (opts.className || ""),
      "aria-labelledby": titleId
    });

    function close(value) {
      if (closed) return;
      closed = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      // Give focus back to where it was before the dialog opened
      if (previousFocus && document.contains(previousFocus) && previousFocus.focus) previousFocus.focus();
      resolveFn(value);
    }

    const actions = (opts.actions || []).map(function (a) {
      return el("button", {
        type: "button",
        class: "btn " + (a.variant || "btn-secondary"),
        autofocus: a.autofocus || null,
        onclick: function () {
          if (typeof a.onClick === "function") {
            // onClick may return false to keep the dialog open (e.g. a validation error)
            if (a.onClick() === false) return;
          }
          close(a.value);
        }
      }, a.label);
    });

    dialog.appendChild(el("div", { class: "dialog-inner" }, [
      el("h2", { class: "dialog-title", id: titleId, text: opts.title || "" }),
      el("div", { class: "dialog-body" }, opts.body || null),
      actions.length ? el("div", { class: "dialog-actions" }, actions) : null
    ]));

    // Esc → cancel
    dialog.addEventListener("cancel", function (e) {
      e.preventDefault();
      close(opts.cancelValue);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    return { element: dialog, close: close, result: result };
  }

  /** Confirmation dialog. Returns Promise<true|false>. */
  function confirm(opts) {
    return open({
      title: opts.title || "Are you sure?",
      body: el("p", { text: opts.message || "" }),
      cancelValue: false,
      actions: [
        { label: opts.cancelLabel || "Cancel", value: false, variant: "btn-secondary", autofocus: true },
        { label: opts.confirmLabel || "Delete", value: true, variant: opts.danger === false ? "btn-primary" : "btn-danger-solid" }
      ]
    }).result;
  }

  /** Dialog with a text field. Returns Promise<string|null> (null = cancelled). */
  function prompt(opts) {
    const input = el("input", {
      type: "text",
      class: "field",
      value: opts.value || "",
      placeholder: opts.placeholder || "",
      "aria-label": opts.label || opts.title
    });
    const error = el("p", { class: "dialog-error", "aria-live": "polite" });

    function validate() {
      if (!input.value.trim()) {
        error.textContent = "This field cannot be empty.";
        input.focus();
        return false;
      }
      return true;
    }

    const dlg = open({
      title: opts.title,
      body: [
        opts.label ? el("label", { class: "field-label", text: opts.label }) : null,
        input,
        error
      ],
      cancelValue: null,
      actions: [
        { label: "Cancel", value: null },
        { label: opts.confirmLabel || "Save", variant: "btn-primary", onClick: validate, value: "__input__" }
      ]
    });

    // Enter confirms
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (validate()) dlg.close("__input__");
      }
    });
    input.focus();
    input.select();

    return dlg.result.then(function (value) {
      return value === "__input__" ? input.value.trim() : null;
    });
  }

  /** A plain message with a close button. */
  function alert(opts) {
    return open({
      title: opts.title,
      body: el("p", { text: opts.message || "" }),
      cancelValue: true,
      actions: [{ label: "OK", value: true, variant: "btn-primary", autofocus: true }]
    }).result;
  }

  LM.dialogs = { open: open, confirm: confirm, prompt: prompt, alert: alert };
})(window.LM);
