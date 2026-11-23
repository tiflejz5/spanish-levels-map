/*
 * speech.js — LM.speech: the one speech module (spec 05 §4, spec 06 E5). It replaces the separate voice code of the
 * exercise engine, the S key, the speaking trainer, the lab and the review queue of the reference app.
 *
 *   LM.speech.supported()                  the browser has the Web Speech API
 *   LM.speech.available()                  a voice in the target language exists (true while the list is still loading)
 *   LM.speech.voices()                     matching voices, best first (preference voiceVariant, then LM.APP.speech.voices; local first)
 *   LM.speech.speak(text, opts)            opts { rate, onend, owner }; a second call while speaking stops (→ false)
 *   LM.speech.speakScript(lines, opts)     a dialogue "A: … / B: …" in two voices when there are two; labels are not read
 *   LM.speech.stop()
 *   LM.speech.speaking(owner?)             whether something (of this owner) is being read
 *   LM.speech.onChange(fn)                 called when the voice list or the voice variant changes
 *   LM.speech.variants()                   LM.APP.speech.variants with the current one marked { id, label, current, hasVoice }
 *
 * Only target-language text may be passed here (never English instructions). Gaps are read as a short pause " … ".
 * Without a voice the views fall back: transcript instead of listening, dictation skipped, listen buttons hidden
 * (html[data-voice="none"] hides .listen-btn in CSS).
 * Language facts (locale codes, rate) come from LM.APP.speech (js/config.js).
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  const LINE_PAUSE = 450; // ms between lines of a script
  // A speaker label at the start of a line ("A:", "Speaker 2:", a name with diacritics); any capital letter
  const SPEAKER = /^(\p{Lu}[\p{L}\p{N}]*(?: [\p{Lu}\p{N}][\p{L}\p{N}]*)?):\s*(.*)$/u;

  let current = null;       // { owner, cancelled }
  const listeners = [];

  function cfg() { return (LM.APP && LM.APP.speech) || { voices: [], rate: 1, variants: [] }; }
  function synth() {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function" ? window.speechSynthesis : null;
  }
  function allVoices() { const s = synth(); try { return s ? s.getVoices() || [] : []; } catch (e) { return []; } }
  function langOf(v) { return String(v && v.lang || "").replace(/_/g, "-").toLowerCase(); }
  function fits(v, prefix) { const l = langOf(v), p = String(prefix).toLowerCase(); return l === p || l.indexOf(p + "-") === 0 || (p.indexOf("-") === -1 && l.indexOf(p) === 0); }

  /** The voice variant chosen in the learning settings (an entry of LM.APP.speech.variants), or the first one. */
  function variant() {
    const list = cfg().variants || [];
    let id = "";
    try { if (LM.profileData && LM.app && LM.app.getActiveProfile()) id = LM.profileData.prefs().voiceVariant || ""; } catch (e) { id = ""; }
    return list.find(function (x) { return x.id === id; }) || list[0] || null;
  }

  /** Voices matching a list of locale prefixes, in the order of the prefixes, local voices first within each. */
  function matching(prefixes) {
    const all = allVoices();
    const out = [];
    prefixes.forEach(function (p) {
      const group = all.filter(function (v) { return fits(v, p) && out.indexOf(v) === -1; });
      group.sort(function (a, b) { return (b.localService ? 1 : 0) - (a.localService ? 1 : 0); });
      group.forEach(function (v) { out.push(v); });
    });
    return out;
  }

  /** Target-language voices, best first: the chosen variant, then any other target voice. */
  function voices() {
    const v = variant();
    return matching(((v && v.voices) || []).concat(cfg().voices || []));
  }

  function supported() { return !!synth(); }

  /** A target voice exists; while the browser has not loaded its voice list yet, we assume it will. */
  function available() {
    if (!synth()) return false;
    return !allVoices().length || voices().length > 0;
  }

  function mark() {
    try { document.documentElement.setAttribute("data-voice", available() ? "ok" : "none"); } catch (e) { /* no DOM */ }
  }

  function changed() {
    mark();
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
  }

  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }

  function stop() {
    const s = synth();
    if (current) { current.cancelled = true; current = null; }
    if (s) { try { s.cancel(); } catch (e) { /* ignore */ } }
  }

  function speaking(owner) { return !!current && (owner === undefined || current.owner === owner); }

  function utterance(text, voice, rate) {
    const u = new window.SpeechSynthesisUtterance(text);
    if (voice) { try { u.voice = voice; } catch (e) { /* not a SpeechSynthesisVoice: the lang below still picks one */ } }
    u.lang = voice ? voice.lang : ((variant() && variant().voices && variant().voices[0]) || (cfg().voices || [])[0] || LM.APP.targetLang);
    u.rate = rate || cfg().rate || 1;
    return u;
  }

  /**
   * Reads one text. A second call while something is being read stops it and returns false (a toggle, as the S key expects).
   * Returns true when reading started. opts: { rate, onend, owner, force } — force: stop the current reading and start this one.
   */
  function speak(text, opts) {
    opts = opts || {};
    const s = synth();
    const t = String(text == null ? "" : text).trim();
    if (!s || !t || !available()) return false;
    if (current && !opts.force) { stop(); return false; }
    stop();
    const token = { owner: opts.owner === undefined ? null : opts.owner, cancelled: false };
    current = token;
    const u = utterance(t, voices()[0] || null, opts.rate);
    u.onend = u.onerror = function () {
      if (token.cancelled) return;
      if (current === token) current = null;
      if (typeof opts.onend === "function") opts.onend();
    };
    s.speak(u);
    return true;
  }

  /**
   * Reads a script: lines (an array or text with new lines). "A:" is the first voice and "B:" the second; other labels
   * (a name, "Speaker 2:") take the voices in turn, in order of appearance. Labels are not read. Always starts (force).
   */
  function speakScript(lines, opts) {
    opts = opts || {};
    const s = synth();
    const list = (Array.isArray(lines) ? lines : String(lines || "").split("\n")).map(function (l) { return String(l).trim(); }).filter(Boolean);
    if (!s || !list.length || !available()) return false;
    stop();
    const vs = voices();
    const token = { owner: opts.owner === undefined ? null : opts.owner, cancelled: false };
    current = token;
    const order = [];
    function voiceIndex(label) {
      if (!label) return 0;
      if (label === "A" || label === "B") return label === "B" ? 1 : 0;
      if (order.indexOf(label) === -1) order.push(label);
      return order.indexOf(label) % 2;
    }
    let i = 0;
    function next() {
      if (token.cancelled) return;
      if (i >= list.length) {
        if (current === token) current = null;
        if (typeof opts.onend === "function") opts.onend();
        return;
      }
      const m = SPEAKER.exec(list[i]);
      const k = voiceIndex(m && m[1]);
      const u = utterance(m ? m[2] : list[i], vs.length ? vs[k && vs.length > 1 ? 1 : 0] : null, opts.rate);
      u.onend = function () { i++; setTimeout(next, LINE_PAUSE); };
      u.onerror = function () { i++; setTimeout(next, 50); };
      s.speak(u);
    }
    next();
    return true;
  }

  /** The voice variants for the settings: { id, label, current, hasVoice }. */
  function variants() {
    const cur = variant();
    return (cfg().variants || []).map(function (v) {
      return { id: v.id, label: v.label, current: !!cur && cur.id === v.id, hasVoice: matching(v.voices || []).length > 0 };
    });
  }

  // The voice list arrives asynchronously (empty until "voiceschanged")
  (function init() {
    const s = synth();
    if (s) {
      try {
        if (typeof s.addEventListener === "function") s.addEventListener("voiceschanged", changed);
        else s.onvoiceschanged = changed;
      } catch (e) { /* ignore */ }
    }
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mark); else mark();
      window.addEventListener("pagehide", stop);
    }
  })();

  LM.speech = {
    supported: supported,
    available: available,
    voices: voices,
    speak: speak,
    speakScript: speakScript,
    stop: stop,
    speaking: speaking,
    onChange: onChange,
    variants: variants,
    changed: changed,
    SPEAKER: SPEAKER
  };
})(window.LM);
