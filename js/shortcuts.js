/*
 * shortcuts.js — the keyboard shortcuts panel ("?") and shared sentence playback (pack v8, S5).
 *
 *   LM.shortcuts.open()        panel with the shortcuts of the current view (exercises, review session, topic pages)
 *   LM.shortcuts.speak(text)   reads a sentence aloud (stage 3 moves voice choice into LM.speech); a second call while
 *                              reading stops it
 *
 * Shortcuts do not work in text fields (except Enter, which each view handles itself).
 * Exercises: js/exercise-engine.js, review session: js/cards.js, topic pages: js/handbook.js; here: "?".
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const U = LM.utils;
  const el = U.el;

  const CONTEXTS = {
    exercises: {
      title: "Shortcuts in exercises",
      rows: [
        ["1–4 or A–D", "choose an answer (with options A–H: the option's letter)"],
        ["Enter", "Check, then Next"],
        ["S", "play the sentence (before checking, the gap is a pause)"],
        ["Tab", "next gap"],
        ["Backspace", "undo the last word (Put in order)"],
        ["Ctrl + Enter", "Check in a multi-line field"],
        ["?", "this list"]
      ]
    },
    review: {
      title: "Shortcuts in a review session",
      rows: [
        ["Space", "show the answer, then “Good”"],
        ["1–4", "ratings: Again, Hard, Good, Easy"],
        ["S", "play the sentence on the card (the gap is a pause)"],
        ["Z", "undo the last rating"],
        ["W", "suspend the card"],
        ["B", "put the card off until tomorrow"],
        ["E", "edit the card (your own decks)"],
        ["?", "this list"]
      ]
    },
    page: {
      title: "Shortcuts on a topic page",
      rows: [
        ["[", "previous topic of the level"],
        ["]", "next topic of the level"],
        ["/", "search"],
        ["Ctrl + K", "search"],
        ["?", "this list"]
      ]
    },
    general: {
      title: "Shortcuts",
      rows: [
        ["/", "search"],
        ["Ctrl + K", "search"],
        ["?", "this list"]
      ]
    }
  };

  function contextNow() {
    if (document.querySelector(".ex-view .ex-card")) return "exercises";
    if (document.querySelector(".fc-session")) return "review";
    const v = LM.state && LM.state.view;
    if (v === "page") return "page";
    return "general";
  }

  function typing(t) {
    return !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
  }

  function dialogOpen() { return !!document.querySelector("dialog[open], .dialog-backdrop:not([hidden])"); }

  function open() {
    const c = CONTEXTS[contextNow()];
    const list = el("dl", { class: "kbd-list" });
    c.rows.forEach(function (r) {
      list.appendChild(el("dt", null, r[0].split(" or ").map(function (k, i) {
        return [i ? " or " : null, el("kbd", { text: k })];
      })));
      list.appendChild(el("dd", { text: r[1] }));
    });
    return LM.dialogs.open({
      title: c.title, className: "dialog-shortcuts",
      body: [list, el("p", { class: "tool-note", text: "Shortcuts do not work in text fields (except Enter)." })],
      cancelValue: true,
      actions: [{ label: "Close", value: true, variant: "btn-primary", autofocus: true }]
    }).result;
  }

  // ---------- playback ----------

  let current = null;

  function enVoice() {
    const all = window.speechSynthesis.getVoices();
    return all.filter(function (v) { return /^en[-_]GB/i.test(v.lang); })[0]
      || all.filter(function (v) { return /^en[-_]US/i.test(v.lang); })[0]
      || all.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
  }

  /** Reads a sentence aloud; true when it started (false: no synthesizer or no voice — then a message). S again stops it. */
  function speak(text, rate) {
    const s = window.speechSynthesis;
    if (!s || typeof window.SpeechSynthesisUtterance !== "function") {
      if (LM.ui) LM.ui.toast({ text: "This browser has no speech synthesizer.", icon: "volume-x" });
      return false;
    }
    if (current) { s.cancel(); current = null; return true; }
    const voice = enVoice();
    const all = s.getVoices();
    if (all.length && !voice) {
      if (LM.ui) LM.ui.toast({ text: "This browser has no " + LM.APP.language + " voice.", icon: "volume-x" });
      return false;
    }
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : "en-GB";
    u.rate = rate || 0.95;
    u.onend = u.onerror = function () { current = null; };
    current = u;
    s.speak(u);
    return true;
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || dialogOpen()) return;
    if (e.key === "?") { e.preventDefault(); open(); }
  });

  LM.shortcuts = { open: open, speak: speak, contextNow: contextNow, CONTEXTS: CONTEXTS };
})(window.LM);
