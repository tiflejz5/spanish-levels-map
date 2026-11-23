/*
 * charbar.js — LM.charbar: the special-character bar (spec 06 E3) under every input that expects target-language text.
 *
 * Attaching: an element with the attribute data-charbar — a text field or a container of fields (an item body, a form) —
 * gets one bar after it (field) or at its end (container). A MutationObserver adds bars to new views; LM.charbar.attach(node)
 * does it at once. The characters come from LM.APP.chars (js/config.js).
 *
 *   Click / tap        inserts the character at the cursor of the last focused field of that scope; focus stays in the field
 *   Shift + click      the capital letter; a long press (500 ms) does the same on touch screens
 *   Alt + letter       in a field of a scope: the marked form of the letter (Alt + U again: the next form, then the plain letter);
 *                      Alt + Shift: capitals; Alt + ? and Alt + ! give the opening marks (LM.lang.keyBase)
 * Insertion uses execCommand("insertText") so Ctrl+Z undoes it, with setRangeText as the fallback (then an input event).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const LONG_PRESS = 500;
  const FIELD = "textarea, input:not([type]), input[type='text'], input[type='search']";

  function chars() { return (LM.APP && LM.APP.chars) || []; }
  function upper(c) { const u = c.toUpperCase(); return u.length === 1 ? u : c; }
  function isField(n) { return !!(n && n.matches && n.matches(FIELD) && !n.disabled && !n.readOnly); }

  /** Base key → its marked forms, from LM.APP.chars and LM.lang.keyBase (e.g. u → two forms, ? → the opening mark). */
  function forms() {
    const out = {};
    chars().forEach(function (c) {
      const base = LM.lang && LM.lang.keyBase ? LM.lang.keyBase(c) : c;
      if (!base || base === c) return;
      (out[base] = out[base] || []).push(c);
    });
    return out;
  }

  /** The field to type into: the last focused field of the scope, else its first field. */
  function targetOf(scope) {
    const last = scope.__charbarLast;
    if (last && scope.contains(last) && isField(last)) return last;
    if (isField(scope)) return scope;
    const all = scope.querySelectorAll ? Array.prototype.filter.call(scope.querySelectorAll(FIELD), isField) : [];
    return all[0] || null;
  }

  /** Inserts text at the cursor (replacing a selection); undo works where the browser supports insertText. */
  function insert(field, text) {
    if (!field) return;
    if (document.activeElement !== field) field.focus({ preventScroll: true });
    let done = false;
    try { done = document.execCommand && document.execCommand("insertText", false, text); } catch (e) { done = false; }
    if (!done) {
      const start = field.selectionStart == null ? field.value.length : field.selectionStart;
      const end = field.selectionEnd == null ? start : field.selectionEnd;
      field.setRangeText(text, start, end, "end");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /** Replaces the character just before the cursor (Alt + letter cycling). */
  function replaceBefore(field, text) {
    const pos = field.selectionStart;
    field.setSelectionRange(pos - 1, pos);
    insert(field, text);
  }

  function bar(scope) {
    const node = LM.utils.el("div", { class: "charbar", role: "group", "aria-label": "Special characters", "data-charbar-for": "" });
    chars().forEach(function (c) {
      let timer = 0, longDone = false;
      const btn = LM.utils.el("button", {
        type: "button", class: "charbar-key", lang: LM.APP.targetLang, "aria-label": "Insert " + c, "data-char": c, text: c
      });
      // Keep the focus (and the cursor) in the field
      btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
      btn.addEventListener("pointerdown", function () {
        longDone = false;
        clearTimeout(timer);
        timer = setTimeout(function () { longDone = true; insert(targetOf(scope), upper(c)); }, LONG_PRESS);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(function (t) { btn.addEventListener(t, function () { clearTimeout(timer); }); });
      btn.addEventListener("contextmenu", function (e) { if (longDone) e.preventDefault(); });
      btn.addEventListener("click", function (e) {
        if (longDone) { longDone = false; return; }
        insert(targetOf(scope), e.shiftKey ? upper(c) : c);
      });
      node.appendChild(btn);
    });
    return node;
  }

  /** Adds the bar to every [data-charbar] inside root (or root itself) that has none yet and holds a text field. */
  function attach(root) {
    const list = [];
    const up = root && root.closest ? root.closest("[data-charbar]") : null; // a field added inside an existing scope
    if (up) list.push(up);
    if (root && root.querySelectorAll) Array.prototype.push.apply(list, root.querySelectorAll("[data-charbar]"));
    list.forEach(function (scope) {
      if (scope.__charbar && scope.__charbar.isConnected) return;
      if (!isField(scope) && !targetOf(scope)) return;
      const b = bar(scope);
      scope.__charbar = b;
      if (isField(scope)) scope.insertAdjacentElement("afterend", b);
      else scope.appendChild(b);
    });
  }

  /** The scope of a field: the nearest [data-charbar] (the field itself or a container). */
  function scopeOf(field) { return field && field.closest ? field.closest("[data-charbar]") : null; }

  document.addEventListener("focusin", function (e) {
    const s = scopeOf(e.target);
    if (s && isField(e.target)) s.__charbarLast = e.target;
  });

  // Alt + letter: the marked forms of the letter, again → the next form (the last one is the plain letter again)
  document.addEventListener("keydown", function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const field = e.target;
    if (!isField(field) || !scopeOf(field)) return;
    let base = null;
    const m = /^Key([A-Z])$/.exec(e.code || "");
    if (m) base = m[1].toLowerCase();
    else if (e.shiftKey && e.code === "Slash") base = "?";
    else if (e.shiftKey && e.code === "Digit1") base = "!";
    const list = base && forms()[base];
    if (!list) return;
    e.preventDefault();
    const caps = e.shiftKey && /[a-z]/.test(base);
    const cycle = list.concat(/[a-z]/.test(base) ? [base] : []).map(function (c) { return caps ? upper(c) : c; });
    const pos = field.selectionStart, prev = pos > 0 && pos === field.selectionEnd ? field.value.charAt(pos - 1) : "";
    const k = cycle.indexOf(prev);
    if (k !== -1 && k < cycle.length - 1 && field.__charbarCycle === pos) replaceBefore(field, cycle[k + 1]);
    else if (k === cycle.length - 1 && field.__charbarCycle === pos) replaceBefore(field, cycle[0]);
    else insert(field, cycle[0]);
    field.__charbarCycle = field.selectionStart;
  });

  (function init() {
    const start = function () {
      attach(document.body);
      new MutationObserver(function (list) {
        list.forEach(function (m) {
          Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && !(n.classList && n.classList.contains("charbar"))) attach(n); });
        });
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  })();

  LM.charbar = { attach: attach, insert: insert, forms: forms };
})(window.LM);
