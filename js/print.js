/*
 * print.js — gets the page ready for printing (pack v6, spec 16, section 1.3).
 *
 * While printing it forces the light theme and a neutral colour scope (paper and ink), and restores the previous
 * settings afterwards. The rest (hiding the interface, A4 layout, answers at the end) is in css/print.css.
 *
 *   LM.print.now()   window.print() after forcing the light theme (also for the "Print" buttons)
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  let saved = null;

  function before() {
    if (saved) return;
    const root = document.documentElement;
    saved = { theme: root.getAttribute("data-theme"), section: root.getAttribute("data-section") };
    root.setAttribute("data-theme", "light");
    root.setAttribute("data-section", "app");
  }

  function after() {
    if (!saved) return;
    const root = document.documentElement;
    if (saved.theme === null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", saved.theme);
    if (saved.section === null) root.removeAttribute("data-section"); else root.setAttribute("data-section", saved.section);
    saved = null;
  }

  window.addEventListener("beforeprint", before);
  window.addEventListener("afterprint", after);

  LM.print = {
    before: before,
    after: after,
    now: function () { window.print(); }
  };
})(window.LM);
