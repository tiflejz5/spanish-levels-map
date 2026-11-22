/*
 * config.js — LM.APP: every value that names this app or its target language (spec 02 §3).
 * Language-neutral files read these values and never hard-code them (spec 09, rule 1).
 * LM.VERSION is the cache-busting stamp; `npm run build -- --bump` rewrites it together with ?v= in index.html.
 */
window.LM = window.LM || {};

(function (LM) {
  "use strict";

  LM.VERSION = "1"; // lm-version (rewritten by tools/build.js --bump; do not edit by hand)

  LM.APP = {
    id: "es",
    language: "Spanish",
    nativeName: "español",
    appTitle: "Spanish Levels Map",
    tagline: "Your map of Spanish, A1–C2",
    targetLang: "es",
    storagePrefix: "slm.",
    exportName: "spanish-levels-map",
    speech: {
      voices: ["es-ES", "es-MX", "es-US", "es"],
      rate: 0.9,
      variants: [
        { id: "es-ES", label: "Spain", voices: ["es-ES"] },
        { id: "es-419", label: "Latin America", voices: ["es-MX", "es-US", "es"] }
      ]
    },
    chars: "á é í ó ú ü ñ ¿ ¡".split(" "),
    mistakesHeading: "Common mistakes",
    lab: { title: "Tense & Mood Lab" },
    reportUrl: "https://github.com/tiflejz5/spanish-levels-map/issues/new?labels=content&title=",
    reportMail: ""
  };
})(window.LM);
