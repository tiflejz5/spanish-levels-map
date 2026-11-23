/*
 * shortcuts.js — the keyboard shortcuts panel ("?") and shared sentence playback (pack v8, S5).
 *
 *   LM.shortcuts.open()        panel with the shortcuts of the current view (exercises, review session, topic pages)
 *   LM.shortcuts.speak(text)   reads a target-language sentence aloud (LM.speech, with a message when there is no voice);
 *                              a second call while reading stops it. S on a topic page reads the focused example (data-listen).
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
        ["Alt + letter", "in an answer field: a letter with its mark (Alt + U twice: the next form); Alt + Shift: a capital"],
        ["?", "this list"]
      ]
    },
    review: {
      title: "Shortcuts in a review session",
      rows: [
        ["Space", "show the answer, then “Good”"],
        ["1–4", "ratings: Again, Hard, Good, Easy"],
        ["S", "play the sentence on the card (the gap is a pause)"],
        ["Alt + letter", "in the answer field: a letter with its mark (again: the next form)"],
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
        ["S", "play the focused example (Tab to its listen button)"],
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

  /**
   * Reads a target-language sentence aloud through LM.speech; S again stops it. Returns true when it started or stopped
   * (false: no synthesizer or no voice — then a message).
   */
  function speak(text, rate) {
    if (!LM.speech.supported()) {
      if (LM.ui) LM.ui.toast({ text: "This browser has no speech synthesizer.", icon: "volume-x" });
      return false;
    }
    if (!LM.speech.available()) {
      if (LM.ui) LM.ui.toast({ text: "This browser has no " + LM.APP.language + " voice.", icon: "volume-x" });
      return false;
    }
    if (LM.speech.speaking()) { LM.speech.stop(); return true; }
    return LM.speech.speak(text, { rate: rate });
  }

  /** The example around the focus (a row or a quote with a listen button, spec 06 E5): its target-language text, or "". */
  function focusedExample() {
    const a = document.activeElement;
    const host = a && a.closest && a.closest("[data-listen]");
    return host ? host.getAttribute("data-listen") : "";
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || dialogOpen()) return;
    if (e.key === "?") { e.preventDefault(); open(); return; }
    // S on a topic page: reads the focused example (exercises and review sessions handle S themselves)
    if ((e.key === "s" || e.key === "S") && !e.shiftKey && contextNow() !== "exercises" && contextNow() !== "review") {
      const text = focusedExample();
      if (!text) return;
      e.preventDefault();
      if (/\n/.test(text) && LM.speech.available() && !LM.speech.speaking()) LM.speech.speakScript(text); // a dialogue: two voices
      else speak(text);
    }
  });

  LM.shortcuts = { open: open, speak: speak, contextNow: contextNow, CONTEXTS: CONTEXTS };
})(window.LM);
