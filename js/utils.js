/*
 * utils.js — small helpers used across the app.
 *
 * SECURITY: text typed by the user goes into the DOM only as text (textContent / value). innerHTML is never used with
 * user data, so for example <script>alert(1)</script> shows up as plain text.
 *
 * Also: LM.plural (English count + noun) and LM.fmt (dates and numbers in en-US), spec 04 §1.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  /**
   * Creates a DOM element.
   *   el("button", { class: "btn", text: "Save", onclick: fn }, [children])
   * - "text"     → textContent (safe)
   * - "value"    → value of a form field
   * - "onXxx"    → event listener for "xxx"
   * - checked/disabled/hidden → boolean properties
   * - anything else → HTML attributes (null/false = skip)
   * Children: an element, text (always as a text node) or an array.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const value = attrs[key];
        if (key === "checked" || key === "disabled" || key === "hidden") {
          node[key] = !!value;
          return;
        }
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "value") node.value = value;
        else if (key.indexOf("on") === 0 && typeof value === "function") {
          node.addEventListener(key.slice(2), value);
        } else node.setAttribute(key, value === true ? "" : String(value));
      });
    }
    appendChildren(node, children);
    return node;
  }

  /** Appends children to a parent; text always as a safe text node. */
  function appendChildren(parent, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { appendChildren(parent, c); });
      return;
    }
    if (children instanceof Node) parent.appendChild(children);
    else parent.appendChild(document.createTextNode(String(children)));
  }

  /**
   * Turns text into a DOM fragment with **bold** support.
   * CSS keeps the line breaks (white-space: pre-wrap).
   * Every piece goes into the DOM as text, so HTML is never executed.
   */
  function formatText(text) {
    const frag = document.createDocumentFragment();
    const parts = String(text || "").split(/\*\*([\s\S]+?)\*\*/);
    parts.forEach(function (part, i) {
      if (!part) return;
      // Odd indexes are the pieces between ** **
      if (i % 2 === 1) frag.appendChild(el("strong", { text: part }));
      else frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  /** Unique id: prefix + time + random string, e.g. "t_lq2k9x8f3a". */
  function uid(prefix) {
    let rand = "";
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(2);
      window.crypto.getRandomValues(arr);
      rand = arr[0].toString(36) + arr[1].toString(36);
    } else {
      rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return prefix + "_" + Date.now().toString(36) + rand.slice(0, 8);
  }

  /** true when the text is empty or only spaces. */
  function isBlank(text) {
    return !text || !String(text).trim();
  }

  /** Fits the height of a text area to its content. */
  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = (textarea.scrollHeight + 2) + "px";
  }

  /** Today's date as YYYY-MM-DD (local time). */
  function dateStamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** Whether a value is a plain object {…} (not an array, not null). */
  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  /**
   * Scroll position. On a computer <main> scrolls; on a phone (narrow layout) the whole page does, so both are handled.
   */
  function getScroll() {
    const main = document.getElementById("main");
    return (main && main.scrollTop) || window.scrollY || 0;
  }

  function setScroll(y) {
    const main = document.getElementById("main");
    if (main) main.scrollTop = y;
    window.scrollTo(0, y);
  }

  LM.utils = {
    getScroll: getScroll,
    setScroll: setScroll,
    el: el,
    appendChildren: appendChildren,
    formatText: formatText,
    uid: uid,
    isBlank: isBlank,
    autoGrow: autoGrow,
    dateStamp: dateStamp,
    isPlainObject: isPlainObject
  };

  // =====================================================================
  // NUMBERS AND DATES IN ENGLISH (spec 04 §1)
  // =====================================================================

  const LOCALE = "en-US";
  const NUM = typeof Intl !== "undefined" ? new Intl.NumberFormat(LOCALE) : null;

  /** A Date from "YYYY-MM-DD" (local day, no time-zone shift), an ISO string, a timestamp or a Date; null when invalid. */
  function toDate(value) {
    if (value instanceof Date) return isNaN(value) ? null : value;
    if (typeof value === "number") { const d = new Date(value); return isNaN(d) ? null : d; }
    const s = String(value || "");
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function dtf(opts) { return new Intl.DateTimeFormat(LOCALE, opts); }

  LM.fmt = {
    /** 1234 → "1,234" */
    number: function (n) { return NUM ? NUM.format(n) : String(n); },
    /** 0.42 → "42%" (a fraction, like Intl; rounded to whole percent) */
    percent: function (fraction) { return Math.round(Number(fraction) * 100) + "%"; },
    /** "2026-11-12" → "Nov 12, 2026"; "" for an invalid date */
    date: function (value) { const d = toDate(value); return d ? dtf({ month: "short", day: "numeric", year: "numeric" }).format(d) : ""; },
    /** "2026-11-12" → "November 12, 2026" */
    dateLong: function (value) { const d = toDate(value); return d ? dtf({ month: "long", day: "numeric", year: "numeric" }).format(d) : ""; },
    /** "2026-11-12" → "Nov 12" */
    dayMonth: function (value) { const d = toDate(value); return d ? dtf({ month: "short", day: "numeric" }).format(d) : ""; },
    /** "2026-11-12" → "Thursday" */
    weekday: function (value) { const d = toDate(value); return d ? dtf({ weekday: "long" }).format(d) : ""; },
    /** "2026-11-12" → "Thu" */
    weekdayShort: function (value) { const d = toDate(value); return d ? dtf({ weekday: "short" }).format(d) : ""; },
    /** ISO time → "2:05 PM" */
    time: function (value) { const d = toDate(value); return d ? dtf({ hour: "numeric", minute: "2-digit" }).format(d) : ""; },
    toDate: toDate
  };

  /**
   * English count + noun: LM.plural(1, "day", "days") → "1 day", LM.plural(3, "day", "days") → "3 days".
   * The plural defaults to one + "s": LM.plural(2, "set") → "2 sets". The number uses LM.fmt.number ("1,200 cards").
   */
  LM.plural = function (n, one, other) {
    return LM.fmt.number(n) + " " + (n === 1 ? one : (other || one + "s"));
  };

  /**
   * TEMPORARY (stage 2): the Polish three-form plural of the reference app, used only by files not translated yet.
   * Removed at the end of stage 2; a unit test checks that nothing calls it then.
   */
  LM.pluralPl = function (n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10, t = n % 100;
    return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
  };
})(window.LM);
