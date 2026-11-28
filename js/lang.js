/*
 * lang.js — LM.lang: every rule about the target language (Spanish), spec 05 §1.
 * The rest of the code holds generic algorithms and reads language facts from here (spec 09 rule 1).
 * Values (names, locale codes, voices, characters) live in js/config.js.
 * No DOM access: tools/tests.js requires this file (fixtures in tools/fixtures/lang/).
 *
 *   stripMarks(str)          á→a é→e í→i ó→o ú→u ü→u ñ→n, any case; same length as the input
 *   fold(str)                for search: lower case + stripMarks + unified quotes; same length as the input
 *   wordPattern              RegExp source of one word (letters with diacritics, inner hyphen or apostrophe)
 *   normalizeAnswer(str)     short answers and gaps: trim, one space, lower case, ’ → ', no final full stop; keeps diacritics
 *   normalizeSentence(str)   normalizeAnswer + no punctuation (also ¿ ¡ « » — …); keeps diacritics
 *   variants(str)            equivalent spellings, the input included (Spanish: only the input)
 *   countWords(str)
 *   isTarget(text)           fallback when there is no lang attribute: diacritics or ¿ ¡, or two function words, and not mostly English
 *   abbreviations            never end a sentence (sentence extraction for My words)
 *   functionWords            frequent short words used by isTarget
 *   sentenceOpeners          punctuation that may open a sentence before its capital letter (¿ ¡)
 *   keyBase(char)            the plain key of a special character (á → a, ¿ → ?), for the character bar and Alt + key
 *   content                  facts for the content validators (tools/validate-content.js, spec 06 E11):
 *     alphabet               letters and marks of the target language beyond ASCII (anything else in a target field is an error)
 *     subjectPronouns        a typed answer that starts with one of them should also be accepted without it
 *     genderLinks            words after which an -o / -a adjective shows the gender of the speaker or the listener
 *     genderTwin(word)       the other-gender form of an adjective (cansado ↔ cansada) or null
 *     youPlural(answer)      "informal" (a vosotros form) or "formal" (ustedes) — a "you (plural)" task needs both
 */
(function (root) {
  "use strict";
  const LM = root.LM = root.LM || {};

  const MARKS = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
    "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U", "Ñ": "N" };
  const QUOTES = { "‘": "'", "’": "'", "ʼ": "'", "“": "\"", "”": "\"", "«": "\"", "»": "\"" };
  // Spec 05 §1 list, plus short pronouns and prepositions so that short sentences without diacritics are recognised
  const FUNCTION_WORDS = ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "no", "para", "se",
    "a", "al", "del", "me", "te", "mi", "le", "lo", "les", "nos", "su", "es", "muy", "pero", "yo"];
  // The language of explanation: frequent English words that are not Spanish words ("a" and "no" are both)
  const NATIVE_WORDS = ["the", "an", "of", "to", "and", "is", "are", "was", "were", "in", "on", "at", "it", "you", "i", "he", "she",
    "we", "they", "this", "that", "for", "with", "not", "be", "have", "has", "do", "does", "did", "my", "your", "what", "how", "like",
    "from", "or", "but", "if", "can", "will", "would", "there", "their", "about", "which", "when", "who", "use", "means", "say"];
  const MARKED = /[áéíóúüñÁÉÍÓÚÜÑ]/;

  function str(x) { return String(x == null ? "" : x); }

  /** á→a … ñ→n (and capitals); same length as the input. */
  function stripMarks(s) {
    return str(s).replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, function (c) { return MARKS[c]; });
  }

  /** For search: lower case + stripMarks + unified quotes; character by character, so indexes still match the input. */
  function fold(s) {
    const t = stripMarks(s);
    let out = "";
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (QUOTES[c]) { out += QUOTES[c]; continue; }
      const low = c.toLowerCase();
      out += low.length === 1 ? low : c;
    }
    return out;
  }

  /** Short answers and gaps: trim, one space, lower case, ’ → ', no final full stop. Keeps diacritics. */
  function normalizeAnswer(s) {
    return str(s).replace(/[‘’ʼ`´]/g, "'").replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim().toLowerCase();
  }

  /** normalizeAnswer + no punctuation (also ¿ ¡ « » and dashes between words); keeps diacritics and inner hyphens. */
  function normalizeSentence(s) {
    return normalizeAnswer(s)
      .replace(/[¿¡«»“”„"(),.;:!?…—–]/g, " ")
      .replace(/(^|\s)-+(?=\s|$)/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  /** Equivalent spellings, the input included. Spanish has no contractions to expand. */
  function variants(s) { return [str(s)]; }

  function countWords(s) {
    return str(s).split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length;
  }

  /**
   * Fallback when there is no lang attribute. Evidence for Spanish: words with diacritics (2 each), ¿ or ¡ (2),
   * function words (1 each); evidence for English: frequent English words. Spanish when the evidence is ≥ 2 and wins.
   */
  function isTarget(text) {
    const t = str(text);
    if (!t.trim()) return false;
    const words = t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    let es = /[¿¡]/.test(t) ? 2 : 0;
    let en = 0;
    words.forEach(function (w) {
      if (MARKED.test(w)) es += 2;
      else if (FUNCTION_WORDS.indexOf(w) !== -1) es += 1;
      if (NATIVE_WORDS.indexOf(w) !== -1) en += 1;
    });
    return es >= 2 && es > en;
  }

  const OPENER_KEYS = { "¿": "?", "¡": "!" };

  /** The plain key of a special character (character bar, Alt + key): á → a, Ñ → n, ¿ → ?; other characters unchanged. */
  function keyBase(c) { return OPENER_KEYS[c] || stripMarks(c).toLowerCase(); }

  /** Facts for the content validators (spec 06 E11); nothing in the app reads them. */
  const CONTENT = {
    alphabet: "áéíóúüñÁÉÍÓÚÜÑ¿¡«»",
    subjectPronouns: ["yo", "tú", "él", "ella", "usted", "nosotros", "nosotras", "vosotros", "vosotras", "ellos", "ellas", "ustedes"],
    genderLinks: ["estoy", "soy", "estás", "eres"],
    genderTwin: function (word) {
      if (/(ando|iendo|yendo)$/u.test(str(word))) return null; // a gerund has no gender: estoy leyendo
      const m = /^(\p{L}{2,})([oa])(s?)$/u.exec(str(word));
      return m ? m[1] + (m[2] === "o" ? "a" : "o") + m[3] : null;
    },
    youPluralNames: { informal: "vosotros", formal: "ustedes" },
    youPlural: function (answer) {
      const t = " " + normalizeSentence(answer) + " ";
      // vosotros / vosotras, os, vuestro…, or a vosotros verb ending (-áis, -éis, -ís after a consonant: vivís, not país)
      return / (vosotros|vosotras|os|vuestro|vuestra|vuestros|vuestras) /.test(t) || /\p{L}(áis|éis) /u.test(t) || /[^\saeiouáéíóú]ís /u.test(t) ? "informal" : "formal";
    }
  };

  LM.lang = {
    content: CONTENT,

    keyBase: keyBase,
    stripMarks: stripMarks,
    fold: fold,
    wordPattern: "\\p{L}+(?:[-'’]\\p{L}+)*",
    normalizeAnswer: normalizeAnswer,
    normalizeSentence: normalizeSentence,
    variants: variants,
    countWords: countWords,
    isTarget: isTarget,
    abbreviations: ["Sr.", "Sra.", "Srta.", "Dr.", "Dra.", "Ud.", "Uds.", "Vd.", "Vds.", "p. ej.", "etc.", "pág.", "núm.", "aprox.", "EE. UU."],
    functionWords: FUNCTION_WORDS,
    sentenceOpeners: "¿¡"
  };
})(typeof window !== "undefined" ? window : globalThis);
