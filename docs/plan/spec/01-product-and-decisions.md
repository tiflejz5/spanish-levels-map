# Spec 01 — Product and decisions

## 1. What we build

**Spanish Levels Map**: Spanish A1–C2 (CEFR), explained in English. Repository `spanish-levels-map`, served from GitHub Pages at `…/spanish-levels-map/`.

**Learner.** First of all the owner himself: a native speaker of Polish with good English who wants to learn Spanish *through English* and so practise both languages at once. Later anyone who reads English. Consequences: all explanations, instructions and translations are in natural, clear English (not simplified to the point of being unnatural: good English is part of the value); translation tasks go from English into Spanish; there is no Polish anywhere in the app.

Same promise as the original: an open skills map. For every level it shows what you need to know; every point has an explanation with examples and practice; you tick off what you know; a trail leads from A1 to C2; flashcards and a mistake log bring things back at the right time. No accounts, no server, data stays in the browser.

## 2. What stays exactly as in the original

Levels with categories and an "I know this" checklist · topic pages · level summaries · trail (stops, quizzes, checkpoints) · Today · placement test · level final tests and badges · practice hub (sets, mixes, generator, weak spots) · flashcards with scheduling, My words, mistake log, one review queue · stats · notes · search · cheat sheets and print · writing (model answers, phrase bank, trainer) · speaking trainer with recording · profiles, guest mode, export / import / reset · themes · sidebar · celebrations · keyboard shortcuts.

## 3. Decisions (made; do not reopen without the owner)

**D1. A standalone app in its own repository.** The original English app is not touched. The Polish app is a separate project with its own repository and plan; it will be started from a *copy* of this engine (spec 09), after which the two never depend on each other.

**D2. Port, do not rewrite.** Code is imported from the reference at commit `275be9f` and adapted.

**D3. Fresh start for data.** Storage prefix `slm.`, schema version 1 everywhere, no legacy migration code.

**D4. UI text is English, written directly in the code.** No translation layer: this app has one UI language. Rules and glossary: spec 04.

**D5. Spanish variety: international standard.** Neutral model sentences. `vosotros` is taught and shown in tables (marked *Spain*); `ustedes` forms are always accepted where both fit. Vocabulary with regional variants lists and accepts them. Speech prefers `es-ES`, then Latin American voices; a setting switches "Voice: Spain / Latin America". Details: spec 08.

**D6. Mistakes sections are called "Common mistakes"** and list typical learner errors. Introductions compare with English where it helps, because English is the language of explanation.

**D7. Accents and diacritics count.** An answer that differs only in diacritics is wrong, **with a specific hint**, and a special-character bar (á é í ó ú ü ñ ¿ ¡) sits under every answer field. A setting "Accept answers without accents" (default off) turns such answers into "correct, with a reminder". Details: spec 05.

**D8. Checklist = topics, 1:1.** A topic is the checklist item (same id). No editable content store in localStorage.

**D9. Categories come from the syllabus.** verbs, grammar, functions, vocabulary.**D10. Vocabulary is split into several topics per level**, so the trail and decks have natural homes for words.

**D11. New item type "Fill the table"** (`paradigm`) for conjugation and declension: the core drill of an inflected language.

**D12. Exams come last and research-first** (spec 12). The generic exam module is kept and tested with a fixture; the special "Certyfikat C1" module of the original is dropped.

**D13. "Real life vs exam" sections are postponed** to the exams stage.

**D14. Usable early.** A level without content shows as "coming soon". The app is deployed to GitHub Pages as soon as A1 is done, for the owner's own study; it is announced to others only after a native speaker has spot-checked the published levels. Every page has a "Report a mistake" link (E12).

**D15. Lands are reused** with English names: Meadow (A1), Forest (A2), Hills (B1), Lake (B2), Mountains (C1), Summit (C2). Same symbols and level colours (they are computed for colour-blind safety).

## 4. Out of scope

Accounts and sync · native mobile apps · AI tutor or chat inside the app · human audio recordings (speech synthesis only) · UI in other languages · any shared code or shared build with other apps.

## 5. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| Language errors in generated content | two independent reviewer subagents per batch, validators, "Report a mistake" link; the owner cannot judge Spanish, so a native spot-check is required before sharing the app |
| Old-language logic left in the code | inventory in stage 0, `check:lang`, rule "language facts only in `lang.js` / `config.js`" |
| Volume: 130 topics | units as batches, levels released one by one, "coming soon" state |
| Same origin as the owner's other apps on GitHub Pages | storage prefix `slm.`; QA with the other apps' data present |
| Exam facts out of date | research-first stage, official links, "checked on" note |
| No speech voice on the device | every speech feature degrades (transcript, hidden buttons, dictation skipped); QA covers it |
