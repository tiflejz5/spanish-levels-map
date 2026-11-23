/*
 * motion.js — GSAP animations in one place (DESIGN.md, section 4).
 *
 *   LM.motion.run(plugins, setup)
 *     Loads GSAP (and plugins) on demand, then calls setup(gsap, reduce)
 *     inside gsap.matchMedia(): with prefers-reduced-motion reduce = true
 *     and motion must be skipped. The previous animation is cleaned up
 *     (mm.revert()) on the next run() and on a page change (cleanup()).
 *     When GSAP cannot load or motion is reduced, setup gets
 *     gsap = null — the view then shows its end state at once.
 *
 *   LM.motion.countUp(gsap, el, to)  — a number counting up from zero (tabular-nums)
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  let current = null;

  function cleanup() {
    if (current && current.mm) current.mm.revert();
    current = null;
  }

  function run(plugins, setup) {
    cleanup();
    const token = {};
    current = token;
    if (LM.reducedMotion && LM.reducedMotion()) { setup(null, true); return Promise.resolve(); }
    return LM.loadGsap(plugins).then(function (gsap) {
      if (current !== token) return; // the page changed in the meantime
      const mm = gsap.matchMedia();
      token.mm = mm;
      mm.add({ reduce: "(prefers-reduced-motion: reduce)", ok: "(prefers-reduced-motion: no-preference)" }, function (ctx) {
        setup(gsap, !!ctx.conditions.reduce);
      });
    }).catch(function () {
      if (current === token) setup(null, true);
    });
  }

  /** Counts the number in an element from 0 up to "to" (the final text is already in the HTML). */
  function countUp(gsap, el, to, duration) {
    if (!gsap || !el || !to) return null;
    const proxy = { v: 0 };
    return gsap.to(proxy, {
      v: to,
      duration: duration || 0.9,
      ease: "power2.out",
      onUpdate: function () { el.textContent = String(Math.round(proxy.v)); },
      onComplete: function () { el.textContent = String(to); }
    });
  }

  LM.motion = { run: run, cleanup: cleanup, countUp: countUp };
})(window.LM);
