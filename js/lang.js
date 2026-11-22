/*
 * lang.js — LM.lang: all rules about the target language (Spanish), spec 05 §1.
 *
 * STAGE 1 STUB: enough for the app to boot and for later code to call the interface.
 * Nothing uses it yet; the real implementation and its tests come in stage 3 (spec 05 §6).
 * Must stay free of DOM access so tools/tests.js can require it.
 */
(function (root) {
  "use strict";
  const LM = root.LM = root.LM || {};

  const MARKS = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
    "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U", "Ñ": "N" };
  const FUNCTION_WORDS = ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "no", "para", "se"];

  /** á→a … ñ→n; same length as the input. */
  function stripMarks(str) {
    return String(str == null ? "" : str).replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, function (c) { return MARKS[c]; });
  }

  /** For search: lower case + stripMarks + unified quotes; same length as the input. */
  function fold(str) {
    return stripMarks(str).toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[“”«»]/g, "\"");
  }

  /** Short answers and gaps: trim, one space, lower case, ’ → ', no final full stop. Keeps diacritics. */
  function normalizeAnswer(str) {
    return String(str == null ? "" : str).replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim().toLowerCase();
  }

  /** normalizeAnswer + no punctuation (including ¿ ¡ « »); keeps diacritics. */
  function normalizeSentence(str) {
    return normalizeAnswer(str).replace(/[¿¡«»“”"(),.;:!?]/g, " ").replace(/\s[–—-]+\s/g, " ").replace(/\s+/g, " ").trim();
  }

  /** Equivalent spellings; Spanish has no contractions to expand. */
  function variants(str) { return [String(str == null ? "" : str)]; }

  function countWords(str) { return String(str == null ? "" : str).split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length; }

  /** Fallback when there is no lang attribute: diacritics, or two function words. Stage 3 refines this. */
  function isTarget(text) {
    const t = String(text == null ? "" : text);
    if (/[áéíóúüñ¿¡]/i.test(t)) return true;
    const words = t.toLowerCase().split(/[^\p{L}]+/u);
    return words.filter(function (w) { return FUNCTION_WORDS.indexOf(w) !== -1; }).length >= 2;
  }

  LM.lang = {
    stripMarks: stripMarks,
    fold: fold,
    wordPattern: "[\\p{L}]+(?:[-'][\\p{L}]+)*",
    normalizeAnswer: normalizeAnswer,
    normalizeSentence: normalizeSentence,
    variants: variants,
    countWords: countWords,
    isTarget: isTarget,
    abbreviations: ["Sr.", "Sra.", "Dr.", "Dra.", "Ud.", "Uds.", "p. ej.", "etc."],
    functionWords: FUNCTION_WORDS
  };
})(typeof window !== "undefined" ? window : globalThis);
