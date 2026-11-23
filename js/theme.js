/*
 * theme.js — light / dark theme.
 *
 * Three settings: "auto" (as in the system, prefers-color-scheme),
 * "light" and "dark". The button at the top right cycles through them.
 * The choice is stored in localStorage under slm.theme — device-wide
 * (not in the profile and not in the data export).
 *
 * A small script in <head> (index.html) sets data-theme on <html> before
 * the page paints, so there is no flash of the wrong theme. This file
 * handles the button and live changes.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const KEY = LM.storage.key("theme"); // device-wide, not exported (registry in js/profile-data.js)
  const ORDER = ["auto", "light", "dark"];
  const NAMES = { auto: "Auto (as in your system)", light: "Light", dark: "Dark" };
  const THEME_COLOR = { light: "#faf6ee", dark: "#0e1526" };

  const query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : { matches: false };
  let pref = readPref();
  let animTimer = null;

  function readPref() {
    try {
      const v = window.localStorage.getItem(KEY);
      return ORDER.indexOf(v) !== -1 ? v : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function savePref(v) {
    try { window.localStorage.setItem(KEY, v); } catch (e) { /* not saved — works until the tab closes */ }
  }

  function resolved() {
    return pref === "auto" ? (query.matches ? "dark" : "light") : pref;
  }

  /** Sets the theme on <html>, the browser bar colour and the button look. */
  function apply(animate) {
    const root = document.documentElement;
    if (animate) {
      // A short colour transition only at the moment the theme changes
      root.classList.add("theme-anim");
      clearTimeout(animTimer);
      animTimer = setTimeout(function () { root.classList.remove("theme-anim"); }, 320);
    }
    root.setAttribute("data-theme", resolved());
    root.setAttribute("data-theme-pref", pref);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[resolved()]);
    paintButton();
  }

  // ---------- Button ----------

  // Lucide icons (js/ui.js): sun, moon, sun with moon = as in the system
  const ICON = { light: "sun", dark: "moon", auto: "sun-moon" };

  function icon(kind) {
    return LM.icon ? LM.icon(ICON[kind], { size: 20 }) : document.createTextNode("");
  }

  function nextPref() {
    return ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  }

  function paintButton() {
    const btn = document.getElementById("theme-btn");
    if (!btn) return;
    const label = "Theme: " + NAMES[pref] + ". Select to switch to: " + NAMES[nextPref()];
    btn.replaceChildren(icon(pref));
    btn.setAttribute("aria-label", label);
    btn.setAttribute("data-tooltip", "Theme: " + NAMES[pref]);
    btn.setAttribute("data-tooltip-align", "end");
    btn.setAttribute("data-pref", pref);
  }

  function init() {
    const btn = document.getElementById("theme-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        pref = nextPref();
        savePref(pref);
        apply(true);
      });
    }
    // In "Auto" mode, follow a change of the system setting live
    const onSystemChange = function () {
      if (pref === "auto" && document.documentElement.getAttribute("data-theme") !== resolved()) apply(true);
    };
    if (query.addEventListener) query.addEventListener("change", onSystemChange);
    else if (query.addListener) query.addListener(onSystemChange);
    // Fallback: check again when the tab becomes visible (some browsers do not send
    // "change" while the tab is in the background)
    window.addEventListener("focus", onSystemChange);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) onSystemChange(); });
    apply(false);
  }

  LM.theme = { init: init, get: function () { return { pref: pref, resolved: resolved() }; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window.LM);
