# Port inventory: english-levels-map@275be9f → Spanish Levels Map

Stage 0 output. Spec 03 says the inventory wins where the two disagree. The disagreements are listed in §9.
Reference: `reference/english-levels-map`, commit `275be9f8d2ca` (12 Nov 2026, "Merge feature/szlak-v7"), 676 tracked files.

## 0. Summary in numbers

| Folder | Files | Size | String literals with Polish letters | Likely user-visible literals (heuristic) |
|---|---|---|---|---|
| `js/` | 61 | 1,126 kB | 1,521 | 2,504 |
| `css/` | 2 | 280 kB | — | — |
| `tools/` | 24 | 333 kB | 788 | 1,213 |
| `assets/` | 16 | 396 kB | 0 | (vendor code only) |

How the counts were made: a small tokenizer collected the string literals in every `.js` file, outside comments and regular expressions. **PL** = the literal contains Polish letters or „”. **Visible** = PL, or the literal looks like prose: two words, or a capitalised word of 3+ letters. Selectors, identifiers, keys, paths and URLs are excluded. Both numbers are estimates. Stage 2 should count again with `tools/extract-strings.js`. The `js/` PL number (1,521) matches the "about 1,500" in spec 03 §4.

Snapshot imported unchanged: 107 files (`index.html`, `css/`, `js/`, `assets/`, `tools/`, `package.json`, `DESIGN.md`, and the fixture `dane/fiszki/scheduler-vectors.json`). Their git blob hashes are identical to the reference commit. No teaching content was copied.

## 1. Every file: role, decision, new name

Decision legend as in spec 03: **keep** (rename, `ELM`→`LM`, strings to English), **adapt** (real changes), **drop**, **replace** (new implementation of the same job), **defer** (kept but only revived in stage E).

| Reference file | Size | Lines | Role | Decision | New name | Specs | Strings PL / visible |
|---|---|---|---|---|---|---|---|
| `js/app.js` | 27.4 kB | 672 | Boot, global state, hash router, events, save | **adapt** | app.js | 02 §6, 03, 04, 06 E1 E2 E8 | 20 / 29 |
| `js/base-content.js` | 25.5 kB | 767 | Built-in checklist A1–C2 (Polish labels of English topics) | **drop** | — | 03, 06 E2 (D8) | 102 / 160 |
| `js/c1-core.js` | 25.4 kB | 591 | C1 Advanced tab: pages, nav, store elm_c1_v1, exam boxes; ALSO shared plural(), timer, exam-box helpers | **drop (extract shared parts first)** | — (plural → utils.js, timer → writing-trainer.js, exam boxes → exam-core.js) | 03, 06 E8 | 16 / 31 |
| `js/c1-exercises.js` | 20.0 kB | 439 | C1 Use of English sets (Part 1–4 cloze views); renderWith/single used by exam-core and mistake-task | **drop (extract renderer if exams need it)** | — | 03, 06 E8, 12 | 18 / 35 |
| `js/c1-speaking.js` | 6.7 kB | 128 | C1 Speaking trainer wrapper | **drop** | — | 03, 06 E8 | 9 / 31 |
| `js/c1-writing.js` | 3.7 kB | 78 | C1 Writing trainer config | **drop** | — | 03, 06 E8 | 7 / 19 |
| `js/callouts.js` | 7.0 kB | 139 | Callout boxes chosen by Polish heading text; scrollable tables | **adapt** | callouts.js | 03 §3.8, 04, 07 §1 | 5 / 12 |
| `js/celebrate.js` | 10.9 kB | 224 | Milestone toasts (one per profile) | **keep** | celebrate.js | 02 §5, 04 | 29 / 36 |
| `js/data-menu.js` | 10.1 kB | 224 | Profile menu 'Data': export / import / reset | **adapt** | data-menu.js | 02 §5, 04 | 30 / 48 |
| `js/default-data.js` | 2.4 kB | 68 | LEVEL_IDS, default categories, empty data factories | **drop (LEVEL_IDS → syllabus)** | — | 03, 06 E2 | 0 / 1 |
| `js/dialogs.js` | 4.6 kB | 149 | Confirm / prompt dialogs | **keep** | dialogs.js | 04 | 2 / 6 |
| `js/exam-core.js` | 45.5 kB | 818 | Exams from registry: nav, pages, 'in progress', exam boxes, countdown | **adapt** | exam-core.js | 03, 06 E8, 12 | 71 / 112 |
| `js/exam-logic.js` | 7.4 kB | 155 | E8 word count, writing zones, myExams, navSplit, Polish date format | **adapt** | exam-logic.js | 03 §3.7, 06 E8, 12 | 9 / 9 |
| `js/exam-ui.js` | 14.8 kB | 317 | Exam date card, covers, pin, 'Your exams' | **adapt** | exam-ui.js | 06 E8, 12 | 16 / 21 |
| `js/exercise-engine.js` | 97.4 kB | 1799 | Exercise session view, all item types, listening/dictation voice, result | **adapt** | exercise-engine.js | 03 §3.2, 05, 06 E3 E4 E5 E6 | 183 / 273 |
| `js/exercise-hub.js` | 18.3 kB | 324 | Practice hub, ready mixes, generator | **keep** | practice-hub.js | 03, 04, 06 E6 | 26 / 46 |
| `js/exercise-logic.js` | 27.0 kB | 590 | Pure exercise logic: grading, normalisation, contractions, transformations, mixes | **adapt** | exercise-logic.js | 03 §3.1 §3.9, 05 §2, 06 E4 E6 | 12 / 16 |
| `js/final-logic.js` | 5.4 kB | 119 | Pure: level final test draw (largest remainder by category), pass, breakdown | **adapt** | final-logic.js | 03 §3.12, 06 E10 | 0 / 0 |
| `js/fiszki-browse.js` | 26.4 kB | 423 | Deck browser, import, card editor, exam filter | **keep** | cards-browse.js | 03, 04 | 63 / 116 |
| `js/fiszki-harmonogram.js` | 6.0 kB | 135 | Pure flashcard scheduler (intervals, fuzz) | **keep** | cards-schedule.js | 03 | 0 / 1 |
| `js/fiszki-logic.js` | 46.0 kB | 840 | Pure flashcard logic: check, cloze, queue, TSV, word cards, exam tags, journal→cards migration | **adapt** | cards-logic.js | 03 §3.3, 05 §1 §2, 06 E4 | 16 / 21 |
| `js/fiszki-store.js` | 7.0 kB | 159 | Flashcard state per profile (elm.<id>.fiszki) | **keep** | cards-store.js | 02 §5 | 2 / 2 |
| `js/fiszki-words.js` | 28.1 kB | 544 | My words: selection menu, list, CSV export, underline | **adapt** | words.js | 03 §3.4, 05 §5 | 54 / 70 |
| `js/fiszki.js` | 62.6 kB | 1113 | Flashcards tab, session view, deck list | **keep** | cards.js | 03, 04, 06 E3 E5 | 108 / 154 |
| `js/journal.js` | 20.7 kB | 481 | Mistake log list and form | **adapt** | mistakes.js | 03, 04 | 46 / 80 |
| `js/learning-stats.js` | 9.5 kB | 231 | Pure: attempts log, aggregates, weak topics, weights, 'I know this' suggestion | **keep** | learning-stats.js | 03, 06 E4 | 0 / 0 |
| `js/learning.js` | 9.1 kB | 219 | Pure: today(), streak, REVIEW_STEPS (legacy), placement algorithm, mapProgress, topicNeighbors | **adapt** | learning.js | 03, 06 E10 | 0 / 0 |
| `js/level-final.js` | 19.9 kB | 345 | Level final test: start screen, result, badge, level card | **adapt** | final.js | 03, 04, 06 E1 E10 | 47 / 69 |
| `js/level-test.js` | 18.9 kB | 372 | Placement test (12 adaptive questions) | **keep** | placement.js | 03, 04, 06 E10 | 24 / 55 |
| `js/markdown.js` | 17.3 kB | 451 | Small Markdown renderer (GFM tables, lists, quotes, [[id]] chips, checklists) | **adapt** | markdown.js | 05 §5, 06 E5 | 3 / 5 |
| `js/mistake-task.js` | 8.6 kB | 160 | Renders the original task of a mistake-log card in a review session | **adapt** | mistake-task.js | 03 | 4 / 8 |
| `js/motion.js` | 2.0 kB | 58 | GSAP wrapper with reduced-motion branch | **keep** | motion.js | — | 0 / 0 |
| `js/niezbednik.js` | 23.4 kB | 496 | Topic pages: route #/a1/…, label matching, CATEGORY_MAP, cheat sheets, prev/next | **adapt** | handbook.js | 02 §6, 03, 06 E1 E2 E12 | 16 / 36 |
| `js/notes.js` | 10.4 kB | 209 | My notes (panel + #/notatki) | **keep** | notes.js | 04 | 16 / 36 |
| `js/pisanie-wzorzec.js` | 15.4 kB | 297 | Model essay with margin comments (lazy) | **keep** | writing-model.js | 03, 04 | 9 / 30 |
| `js/pisanie-zwroty.js` | 13.1 kB | 217 | Phrase bank + panel in writing trainer (lazy) | **keep** | writing-phrases.js | 03, 04 | 20 / 53 |
| `js/pisanie.js` | 11.0 kB | 202 | Writing: list of model texts, routes | **keep** | writing.js | 03, 04 | 20 / 37 |
| `js/powtorki.js` | 9.7 kB | 188 | 'Flashcards and mistakes' view: tabs, today card | **keep** | review.js | 03, 04 | 34 / 45 |
| `js/print.js` | 1.4 kB | 41 | Switches to light theme for printing | **keep** | print.js | — | 0 / 0 |
| `js/profile-data.js` | 48.6 kB | 1082 | Per-profile learning data (all elm_* KEYS), markActivity, export/import parts | **adapt** | profile-data.js | 02 §5, 06 | 5 / 13 |
| `js/profiles.js` | 23.8 kB | 574 | Profile menu, welcome screen, learning settings | **adapt** | profiles.js | 02 §5, 04, 06 E4 E5 | 37 / 77 |
| `js/recorder.js` | 9.0 kB | 182 | Shared audio recorder for speaking trainers (lazy) | **keep** | recorder.js | 03 | 17 / 30 |
| `js/render.js` | 22.2 kB | 441 | Sidebar tools and levels, level page, progress bars | **adapt** | render.js | 03, 06 E1 E2 | 16 / 31 |
| `js/reviews.js` | 16.4 kB | 326 | Pure: one review queue (cards, mistakes, weak tasks), legacy redirects | **keep (drop redirectFor)** | review-queue.js | 02 §6, 03 | 0 / 0 |
| `js/search-logic.js` | 8.3 kB | 190 | Pure search engine: fold, tokenize, prefix/fuzzy, snippets | **adapt** | search-logic.js | 03 §3.5, 05 §1 | 2 / 2 |
| `js/search.js` | 15.9 kB | 324 | Search bar UI, shortcuts, combobox, recent searches | **adapt** | search.js | 03, 04, 06 E1 | 25 / 41 |
| `js/shortcuts.js` | 7.3 kB | 185 | Keyboard shortcuts, help panel, speech for S key | **adapt** | shortcuts.js | 03 §3.2, 05 §4, 06 E3 | 26 / 39 |
| `js/sidebar.js` | 6.9 kB | 171 | Sidebar behaviour (rail / expanded / pinned / drawer) | **keep** | sidebar.js | 02 §5 | 2 / 7 |
| `js/speaking-trainer.js` | 37.8 kB | 641 | Speaking trainer for matura / E8 / B2 formats (lazy), own voice code | **adapt** | speaking-trainer.js | 03 §3.2, 05 §4, 12 | 57 / 113 |
| `js/stats-page.js` | 17.2 kB | 295 | Stats page: tiles, accuracy bars, trend, activity map | **keep** | stats-page.js | 03, 04, 06 E4 | 56 / 76 |
| `js/store.js` | 16.8 kB | 434 | localStorage: content store, profiles, migrations, validation, export/import, corrupt screen | **adapt** | store.js | 02 §5, 03, 06 E2 | 16 / 22 |
| `js/szlak-logic.js` | 10.8 kB | 191 | Pure trail logic: statuses, passing rules, start level | **adapt** | trail-logic.js | 06 E9 | 2 / 2 |
| `js/szlak-store.js` | 6.5 kB | 160 | Trail state per profile (elm.<id>.szlak) | **adapt** | trail-store.js | 02 §5, 06 E9 | 2 / 2 |
| `js/szlak.js` | 36.7 kB | 630 | Trail view, stop sheet, quizzes (lazy per level) | **adapt** | trail.js | 03, 04, 06 E1 E9 | 81 / 121 |
| `js/tense-lab.js` | 34.5 kB | 642 | Tense Lab: fixed 3×4 English grid, SVG timeline, 'pick a tense', compare, own voice code | **adapt** | lab.js | 03 §3.6, 06 E7, 08 §4, 09 rule 2 | 43 / 72 |
| `js/theme.js` | 4.1 kB | 111 | Theme toggle auto/light/dark, elm_theme_v1 | **keep** | theme.js | 02 §5 | 1 / 6 |
| `js/toc.js` | 3.6 kB | 88 | Table of contents with scrollspy | **keep** | toc.js | 04 | 1 / 3 |
| `js/today.js` | 25.8 kB | 498 | Today page: map card, reviews card, streak, compact trail | **keep** | today.js | 04, 06 E1 | 44 / 57 |
| `js/ui.js` | 19.5 kB | 425 | Icons, logo, progress ring, toast, breadcrumbs, LANDS, loadScript/loadModule/loadGsap, emptyState | **keep (LANDS names → English)** | ui.js | 02 §1 §4, 06 D15, 11 | 9 / 16 |
| `js/utils.js` | 4.9 kB | 138 | DOM builder el(), bold, uid, dates | **keep** | utils.js | 04 (LM.plural, LM.fmt) | 0 / 0 |
| `js/writing-trainer.js` | 24.0 kB | 438 | Shared writing trainer (timer from ELM.c1.timer, word count from exam cfg) | **adapt** | writing-trainer.js | 03, 12 | 42 / 71 |
| `css/print.css` | 7.6 kB | 116 | Print layout (A4, answers at end, cheat sheet 2 columns) | **adapt** | css/print.css | 03, 04, 11 | — |
| `css/style.css` | 272.5 kB | 4407 | All tokens and components; per-exam themes html[data-section=…] | **adapt** | css/style.css | 03, 11, DESIGN | — |
| `tools/e2e-start.js` | 17.7 kB | 287 | Playwright smoke tests of pre-launch fixes (skips without playwright-core) | **keep (rewrite cases)** | tools/e2e.js | 03, 13 | 42 / 71 |
| `tools/kontrast.js` | 13.8 kB | 214 | WCAG contrast of token pairs, all theme scopes (1906 checks) | **adapt** | tools/contrast.js | 03, 11, 13 | 81 / 101 |
| `tools/rozklad-odpowiedzi.js` | 7.0 kB | 164 | One-off rebalancing of A–D answer letters in C1 sets (writes data) | **drop** | — | — (not in spec 03) | 4 / 4 |
| `tools/rozklad-regula.js` | 3.2 kB | 72 | Rule: ≤ 50% one letter, ≤ 2 in a row (used by tests and C1 validator) | **keep (generic rule)** | tools/build/answer-spread.js | — (not in spec 03), 06 E11 | 2 / 2 |
| `tools/sciagi-pdf.js` | 5.8 kB | 115 | Prints cheat sheets to PDF, checks 1 A4 page | **keep** | tools/cheatsheets-pdf.js | 03 | 7 / 8 |
| `tools/testy.js` | 155.1 kB | 2374 | All unit tests (193) | **adapt** | tools/tests.js | 03, 05 §6 | 359 / 551 |
| `tools/waliduj-c1-uoe.js` | 3.3 kB | 65 | Runs scripts/validate_c1_uoe.py | **drop** | — | 03 | 4 / 8 |
| `tools/waliduj-cwiczenia.js` | 38.6 kB | 575 | Validator of exercise sets, lab, mixes, exams, final tests | **adapt** | tools/validate-exercises.js | 03, 06 E11, 07 | 117 / 191 |
| `tools/waliduj-fiszki.js` | 6.0 kB | 127 | Runs scripts/validate_fiszki.py + deck rules | **adapt (to JS)** | tools/validate-decks.js | 03, 07 §7 | 9 / 16 |
| `tools/waliduj-mowienie.js` | 8.0 kB | 143 | Speaking-trainer data rules | **defer (stage E)** | tools/validate-speaking.js | 03, 12 | 15 / 27 |
| `tools/waliduj-szlak.js` | 2.5 kB | 52 | Runs scripts/validate_szlak.py | **replace (trail is generated)** | tools/validate-trail.js | 06 E9 | 1 / 9 |
| `tools/waliduj-v6.js` | 3.7 kB | 63 | Cheat sheets + full validate_v6.py | **adapt (cheat-sheet part)** | tools/validate-pages.js | 03, 07 | 13 / 20 |
| `tools/waliduj-wzorce.js` | 5.6 kB | 93 | Model-essay annotation rules | **defer (stage E)** | tools/validate-writing.js | 03, 12 | 15 / 21 |
| `tools/waliduj-zwroty.js` | 4.0 kB | 73 | Phrase-bank rules (counts, ids, genres) | **adapt** | tools/validate-phrases.js | 03 | 23 / 27 |
| `tools/waliduj-zycie.js` | 5.8 kB | 95 | 'Życie i egzamin' section rules | **drop (D13)** | — | 01 D13 | 20 / 22 |
| `tools/zbuduj-cwiczenia.js` | 6.9 kB | 138 | Sets + lab JSON → lazy .js | **adapt** | tools/build/exercises.js | 02 §4 | 5 / 9 |
| `tools/zbuduj-egzaminy.js` | 6.0 kB | 107 | Exam registry + per-exam data | **adapt** | tools/build/exams.js | 02 §4, 12 | 4 / 7 |
| `tools/zbuduj-fiszki.js` | 2.0 kB | 41 | Decks → index + lazy deck .js | **adapt** | tools/build/decks.js | 02 §4 | 1 / 4 |
| `tools/zbuduj-niezbednik.js` | 12.1 kB | 228 | Pages, summaries, cheat sheets, home, C1, placement → .js | **adapt** | tools/build/pages.js | 02 §4 | 27 / 41 |
| `tools/zbuduj-szlak.js` | 2.0 kB | 43 | Trail + quizzes → .js | **replace (generate from syllabus)** | tools/build/trail.js | 06 E9 | 1 / 5 |
| `tools/zbuduj-szukaj.js` | 15.0 kB | 251 | Search index | **adapt** | tools/build/search.js | 02 §4, 05 | 22 / 43 |
| `tools/zbuduj-testy-koncowe.js` | 2.5 kB | 52 | Final-test pools → lazy .js | **adapt** | tools/build/tests.js | 02 §4 | 8 / 8 |
| `tools/zbuduj-zasoby.js` | 5.0 kB | 104 | Copies fonts, Lucide icons, GSAP from node_modules to assets/ | **keep** | tools/build-assets.js | — (not in spec 03) | 7 / 16 |
| `tools/zbuduj-zwroty.js` | 1.2 kB | 28 | Phrase bank → lazy .js | **adapt** | tools/build/phrases.js | 02 §4 | 1 / 2 |
| `assets/favicon-180.png` | 9.7 kB | — | PNG favicon | **replace** | assets/favicon-180.png | 11 | — |
| `assets/favicon.svg` | 1.1 kB | 23 | SVG favicon (compass, brand gradient) | **replace** | assets/favicon.svg | 11 | — |
| `assets/fonts/fraunces-latin-ext.woff2` | 58.0 kB | — | Self-hosted font subset (latin / latin-ext covers á é í ó ú ü ñ ¿ ¡) | **keep** | assets/fonts/fraunces-latin-ext.woff2 | — | — |
| `assets/fonts/fraunces-latin.woff2` | 65.7 kB | — | Self-hosted font subset (latin / latin-ext covers á é í ó ú ü ñ ¿ ¡) | **keep** | assets/fonts/fraunces-latin.woff2 | — | — |
| `assets/fonts/Fraunces-LICENSE.txt` | 4.5 kB | 94 | License text | **keep** | assets/fonts/Fraunces-LICENSE.txt | 13 | — |
| `assets/fonts/inter-latin-ext.woff2` | 83.1 kB | — | Self-hosted font subset (latin / latin-ext covers á é í ó ú ü ñ ¿ ¡) | **keep** | assets/fonts/inter-latin-ext.woff2 | — | — |
| `assets/fonts/inter-latin.woff2` | 47.1 kB | — | Self-hosted font subset (latin / latin-ext covers á é í ó ú ü ñ ¿ ¡) | **keep** | assets/fonts/inter-latin.woff2 | — | — |
| `assets/fonts/Inter-LICENSE.txt` | 4.5 kB | 94 | License text | **keep** | assets/fonts/Inter-LICENSE.txt | 13 | — |
| `assets/ikony.js` | 11.0 kB | 8 | Generated Lucide icon nodes (ELM.ICON_NODES) | **keep** | assets/icons.js | 03 | 0 / 0 |
| `assets/krainy.js` | 1.5 kB | 4 | Land symbols A1–C2 (ELM.LAND_NODES) | **keep** | assets/lands.js | 03, 01 D15 | 0 / 0 |
| `assets/Lucide-LICENSE.txt` | 3.2 kB | 44 | License text | **keep** | assets/Lucide-LICENSE.txt | 13 | — |
| `assets/stany-puste.js` | 1.6 kB | 4 | Empty-state illustrations (ELM.EMPTY_ART) | **keep** | assets/empty-states.js | 03 | 0 / 0 |
| `assets/vendor/DrawSVGPlugin.min.js` | 4.3 kB | 12 | GSAP / plugin (lazy) | **keep** | assets/vendor/DrawSVGPlugin.min.js | — | 0 / 3 |
| `assets/vendor/gsap.min.js` | 71.2 kB | 12 | GSAP / plugin (lazy) | **keep** | assets/vendor/gsap.min.js | — | 0 / 30 |
| `assets/vendor/MotionPathPlugin.min.js` | 21.5 kB | 12 | GSAP / plugin (lazy) | **keep** | assets/vendor/MotionPathPlugin.min.js | — | 0 / 6 |
| `assets/warstwice.svg` | 8.5 kB | 1 | Contour pattern (inlined in CSS as data: mask) | **keep** | assets/contours.svg | — | — |

Extra files I recommend:
- `js/config.js` and `js/lang.js` (spec 02 §3, spec 05).
- `js/speech.js` (one voice module that replaces 5 copies of the voice code, see §2.2).
- `js/charbar.js` (E3).
- `tools/check-lang.js`, `tools/extract-strings.js`, `tools/strip-keys.js`.
- `tools/fixtures/` holding `scheduler-vectors.json`, `exam-demo/` and `lang/`.

## 2. English-specific and Polish-exam-specific logic

Spec 03 §3 is the starting list. Each item below is marked confirmed, corrected or new, with `file:line` in the reference.

### 2.1 Answer checking (`js/exercise-logic.js`, `js/fiszki-logic.js`)

1. **Confirmed.** Contraction handling in `exercise-logic.js`:
   - `FIXED_CONTRACTIONS` (`:205`), `expandWord` (`:219`), `AMBIGUOUS` 's/'d and `sentenceVariants` (`:229–243`, up to 64 readings), `matchesSentence` (`:246`);
   - `trNorm` (`:372`) upper-cases text and keeps only the apostrophe;
   - `CONTRACTION` (`:382`) counts `N'T 'S 'RE 'VE 'D 'LL 'M` as two words in `trTokens` (`:385`);
   - word-limit message "skróty liczą się jako dwa" (`:322`).
2. **New.** `normalize` (`:32`) strips only `[.,!?;]` at the end. `normalizeSentence` (`:212`) strips `,.!?;:"“”„«»()` but **not `¿ ¡`**, so a Spanish answer that starts with `¿` or `¡` never matches. This moves to `LM.lang.normalizeAnswer` / `normalizeSentence`.
3. **New.** The typo rule is duplicated:
   - `exercise-logic.js` has `distance` (`:51`), used by short-answer and gap-fill;
   - `fiszki-logic.js` has `levenshtein` / `checkAnswer` (`:45`, `:72`; rule: distance 1 and at least 5 letters);
   - both become `LM.exLogic.match` (spec 05 §2).
4. **New.** `speechText` (`:529`): the speaker-label regex `^[A-Z][A-Za-z0-9 ]{0,12}:` is ASCII only. It would miss labels like "Señora:". Move the label pattern into `LM.lang`, or make it Unicode (`\p{Lu}\p{L}`).
5. **Confirmed.** `scoreTransformationParts` (`:417`) has Cambridge Part 4 rules (3–6 words, keyword unchanged, `TR_DEFAULT_LIMIT` `:413`). The rules are generic once `trTokens` stops splitting contractions.

### 2.2 Speech: five copies, not four (spec 03 §3.2 corrected)

| File | Code | Hard-coded |
|---|---|---|
| `exercise-engine.js` | `synth` `:440`, `englishVoices` `:442`, `noEnglishVoice` `:450`, two-voice script reader `:463–500`, dictation `:968–985` | `"en-GB"` `:491`, `:978`; "bez głosu angielskiego" `:211`, `:1139` |
| `shortcuts.js` | `speak` `:105–140` | en-GB then en-US `:5`, `"en-GB"` `:133` |
| `speaking-trainer.js` | `synthOk` / voice pick / speak `:40–60` | `"en-GB"` `:54` |
| `tense-lab.js` | `canSpeak` / speak `:75–95` | `"en-GB"` `:88` |
| `reviews.js` | `noVoice()` `:248` reads `ELM.exercises.noEnglishVoice` | dictation filter `:61` |

**New.** **53 hard-coded `lang: "en"` attributes** sit on target-language text:
- `exercise-engine.js` 16, `speaking-trainer.js` 13, `tense-lab.js` 12, `fiszki.js` 4, `writing-trainer.js` 3, `level-test.js` 2, `pisanie-zwroty.js` 2, `pisanie-wzorzec.js` 1;
- one more is `exercise-engine.js:855`, where match mode `translation` picks `"pl"` or `"en"`.

All of them must become `LM.APP.targetLang`. The `"pl"` case is the English side and becomes `"en"`.

### 2.3 Flashcards and My words

1. **Confirmed.** `fiszki-logic.js:369`: `isPolish` (Polish letters disable "Add to My words"). It is used in `fiszki-words.js:80` and `fiszki.js:719–720`.
2. **Confirmed.** `ABBREVIATIONS` (`:363`) is an English list (`e.g`, `mr`, `mrs`, …).
3. **New.** `splitSentences` (`:397`) ends a sentence only before `["“‘'(\[]?\p{Lu}`. A Spanish sentence that starts with `¿` or `¡` is therefore **not split off**, and the next question is glued to the previous sentence. Add `¿¡` to the lookahead, best via `LM.lang`.
4. **Checked.** `findWord` and `makeCloze` (`:378`, `:446`) already use Unicode word boundaries `(?<![\p{L}\p{N}])`, so `ñ`, accented letters and inner hyphens work. Only apostrophes are folded (`foldApostrophes` `:366`). Spanish has no word-internal apostrophes, so this is harmless. `wordFromSelection` (`:375`) already trims `¡¿`.
5. **Confirmed.** `fiszki-words.js:42–50`: `inPolishColumn` matches column headers `polski | po polsku | znaczenie`. Replace it with the `lang` attribute (spec 05 §5).
6. **New.** `fiszki-words.js:52`: `pageTitle()` strips the hard-coded "English Levels Map" from `document.title`. Use `LM.APP.appTitle`.
7. **New.** `fiszki-words.js:364`: `localeCompare(…, "en")` for the A–Z sort. Use `LM.APP.targetLang`.
8. **Confirmed (spec 03 §3.11).** Exam codes:
   - `fiszki-logic.js:619–632`: `EXAMS` (e8, mp, mr, b2, c1 with Polish names) and `examsOf`;
   - `fiszki.js:1002`: deck map `"certyfikat-c1": ["czasowniki-frazowe", "kolokacje"]`;
   - `fiszki-store.js:20`: `C1_DECK` one-time enable.

### 2.4 Search

- **Confirmed.** `search-logic.js:21`: `FOLD` table `ł ß ø`, plus an NFD strip in `fold` (`:24`). The NFD strip already handles `á→a` and `ñ→n` with the same length.
- **Confirmed.** The tokeniser is `[^a-z0-9']+` (`:37`), with highlight regexes `[a-z0-9']+` at `:141` and `:174`. After `fold` these are safe for Spanish, because every Spanish letter folds to a–z. They still move to `LM.lang.fold` / `wordPattern`, as spec 05 says.

### 2.5 Tense Lab

- **Confirmed.** `tense-lab.js:28–37`: fixed `GROUPS` (present/past/future, with Polish `pl` labels) × `ASPECTS` (simple/continuous/perfect/perfect-continuous).
- **New.**
  - `isForm` (`:52`) has a future special case;
  - `lastTense = "present-simple"` (`:41`) is an English default;
  - "forma przyszła" (`:371`).
- E7 makes the grid data-driven.

### 2.6 Exams: Polish exam specifics

- **Confirmed.** `exam-logic.js`:
  - `countWordsE8` (`:18`) has CKE rules (opening skipped, "XYZ" signature not counted);
  - `MONTHS_GEN` / `WEEKDAYS` / `formatDatePl` (`:53–80`).
- **New.** `exam-core.js:116`: `toLocaleDateString("pl-PL")`.
- **New.** Per-exam CSS themes: `html[data-section="…"]` blocks for `certyfikat` (3), `egzamin-osmoklasisty` (7), `matura-podstawowa` (10), `matura-rozszerzona` (11) and `certyfikat-b2` (10) in `style.css`. `tools/kontrast.js` checks every one of these scopes (1,906 checks in total).
- **Confirmed.** `writing-trainer.js`: E8 zones live in the exam configuration. This is already data-driven via `cfg`.

### 2.7 Callouts

**Confirmed.** `callouts.js:18–23` matches Polish heading text:
- "najczęstsza pułapka | typowe błędy | pułapka";
- "na egzaminie c1";
- "życie i egzamin";
- "kluczowe myśli | co umiesz";
- "jesteś gotow | co dalej";
- "przykład | kluczowe zwroty | typowe połączenia".

The labels are Polish too. The section "Życie i egzamin" is dropped (D13).

### 2.8 Plural, dates, typography

1. **Corrected (spec 03 §3.9).** There are **six** implementations of the Polish three-form `plural` / `plural(n, one, few, many)`:
   - full implementations: `c1-core.js:250`, `exam-ui.js:21`, `exercise-logic.js:365`, `fiszki.js:43`, `level-final.js:44`, `szlak.js:31`;
   - delegating stubs: `exam-core.js:37`, `exercise-engine.js:1348`, `journal.js:224`, `pisanie.js:37`, `powtorki.js:35`, `search.js:272`, `stats-page.js:35`, `today.js:34` all **delegate to `ELM.c1.plural`**, and `pisanie-zwroty.js:37` delegates to `ELM.pisanie.plural`.

   There are about 60 uses in 18 files. They all go to `LM.plural` (stage 2).
2. **New.** The `pl-PL` locale appears in:
   - `fiszki.js:116`, `:120`, `:1082` (weekday labels);
   - `notes.js:135`, `:150`;
   - `fiszki-browse.js:394`;
   - `exam-core.js:116`.
3. **New.** Hand-made `dd.mm.yyyy` / `dd.mm` dates appear in `fiszki-words.js:290`, `level-final.js:41`, `stats-page.js:154`, `:210` and `speaking-trainer.js:628`. Day names live in `today.js` (`DAY_NAMES`).
4. **Confirmed.** 545 lines in `js/` contain Polish quotes „…”.
5. **New.** `ui.js:56–59`: `LANDS` are Polish names (Polana, Las, Wzgórza, Jezioro, Góry, Szczyt). They become English (D15).
6. **New.** The app name is hard-coded **44 times in 24 files** ("English Levels Map" / `english-levels-*`), for example `app.js:314` (`document.title`), `data-menu.js` (export file name) and `niezbednik.js` (6). Use `LM.APP`.

### 2.9 Categories

**Confirmed (spec 03 §3.12) and extended.** The four reference categories are `czasy`, `gramatyka`, `funkcje` and `slownictwo`. Places that use them:

| Place | What it does |
|---|---|
| `niezbednik.js:25` `CATEGORY_MAP` | maps the four categories to `cat_grammar` / `cat_functions` / `cat_vocabulary` |
| `level-final.js:52` `categoryOf` | falls back to `"gramatyka"` |
| `level-test.js:313` | maps the category to a skill label |
| `szlak.js:24` `CAT_NAME` | short category codes `g` / `f` / `v` / `mix` |
| `render.js:395` | `cat_vocabulary` + A1–B1 → themed deck link |

`final-logic.js` itself is category-agnostic: it reads `item.category`.

The syllabus categories are `verbs`, `grammar`, `functions` and `vocabulary`. The likely mapping is czasy→verbs, gramatyka→grammar, funkcje→functions, slownictwo→vocabulary.

### 2.10 Things that look language-specific but are not

`findWord`, `makeCloze` and `wordFromSelection` (Unicode-aware), `final-logic.js`, `learning-stats.js`, `fiszki-harmonogram.js`, `reviews.js` (except `noVoice`), and `szlak-logic.js`.

## 3. localStorage keys actually used (vs spec 02 §5)

Where keys are defined:
- `store.js:22–27` (content, progress, profiles, ui, corrupt backup);
- `profile-data.js:57–59` (`KEYS`: journal, activity, levelTest, celebrated, attempts, autojournal, prefs, notes, exams, speaking, levelTests, phrases);
- `theme.js:18`, `sidebar.js:23`, `search.js:25`, `c1-core.js:29`;
- `fiszki-store.js:19` and `szlak-store.js:19` (prefix `"elm." + profileId + suffix`).

`index.html` reads `elm_theme_v1` and `elm_sidebar_v1` in the head script.

| Key in code | In spec 02 §5 | Exported? (reference) | Note |
|---|---|---|---|
| `elm_theme_v1`, `elm_sidebar_v1` | ✓ → `slm.theme`, `slm.sidebar` | no | also read in the `<head>` script of `index.html` |
| `elm_profiles_v1` | ✓ → `slm.profiles` | yes (`progress` part) | reference schema `version: 2` + v1→v2 seed-profile migration (`store.js:261`) |
| `elm_ui_v1` | ✓ → `slm.ui` | no | |
| `elm_celebrated_v1` … `elm_exams_v1` (12 `KEYS`) | ✓ all 12 | yes (`learning` part) | |
| `elm_c1_v1` | ✓ merged into `slm.exams` | **no** (shared by all profiles, survives reset) | dropped with C1 |
| `elm.<id>.fiszki` | ✓ → `slm.cards.<id>` | yes (`fiszki` part) | carries `settings.migratedJournal`, `journalCardsV2` flags |
| `elm.<id>.szlak` | ✓ → `slm.trail.<id>` | yes (`szlak` part) | |
| `elm_search_recent_v1` | ✓ → `slm.search-recent` | no | |
| `elm_content_v1`, `elm_content_corrupt_backup`, `elm_progress_v1` | ✓ dropped | content yes | |

The list matches spec 02 §5 exactly: no key is missing and no extra key exists. One structural difference: export, import, reset and delete are **not registry-driven** today. Each store has its own part:
- `data-menu.js:31–45` (envelope `version: 2`, parts `content`, `progress`, `learning`, `fiszki`, `szlak`);
- `profile-data.js`;
- `fiszki-store.js` `parseImport` (`:114`);
- `szlak-store.js`.

Stage 1A builds the single registry.

**Legacy migrations to remove in stage 1A** (D3):
- `store.migrate` (`:74`) and `normalizeContent` (content store);
- the "untouched empty skeleton → base list" replacement (`:175`);
- `migrateProfilesV1` (`:261`, seed profiles) and the `elm_progress_v1` import into "Mój profil" (`:289–300`), plus its banner (`app.js:68–69`);
- the journal → cards migration (`fiszki-logic.js:784` `migrateJournal`, `journalCardLegacy` `:650`, `JOURNAL_STEPS`, `clearMigrationFlags`, `app.js:475`);
- the `journalCardsV2` repair;
- the journal `review` field and `REVIEW_STEPS` (`learning.js:19`, used by `:64–80`);
- old export formats (`kind: "content"`, `kind: "progress"`, bare data, v1 without `learning`) in `data-menu.js:90–160`;
- the C1 deck one-time enable (`fiszki-store.js:20`).

## 4. Routes actually handled (vs spec 02 §6)

Router: `app.js:216–288` (`applyRoute`). It asks every module's `parseRoute` in a fixed order. Anything not matched goes to `niezbednik.parseRoute`, which accepts **any** `#/…` and shows "no file". The empty hash goes home. There is no generic "Page not found".

| Reference route | Module | New route (spec 02 §6) |
|---|---|---|
| `#/`, `""` | app | `#/` |
| `#/dzis` | today.js:37 | `#/today` |
| `#/szlak[/<stop id>]` | szlak.js:420 (the optional segment opens a stop sheet) | `#/trail` (**stop param not in spec**) |
| `#/a1` … `#/c2` | app.js:222 | same |
| `#/a1/<category>-<slug>` | niezbednik.js:49 | same, new slugs |
| `#/a1/sciaga` | niezbednik.js:56 | `#/a1/cheatsheet` |
| `#/a1/test` | exercise-engine.js:131 (final test) | `#/a1/test` |
| `#/test-poziomu` | level-test.js:51 | `#/placement` |
| `#/powtorki[/na-dzis]` | powtorki.js:38 | `#/review` |
| `#/powtorki/talie[/import \| /tematy[/a1\|a2\|b1] \| /talia/<id>[/nowa \| /karta/<id>]]` | fiszki.js:840–855 | `#/review/decks[/…]` |
| `#/powtorki/moje-bledy` | journal.js:30 | `#/review/mistakes` |
| `#/powtorki/moje-slowa` | fiszki.js:843 | `#/review/words` |
| `#/powtorki/sesja[?tylko=bledy\|slabe\|talie\|talia:<id>][&max=10]` | fiszki.js:842 | `#/review/session` (**query params not in spec**) |
| `#/cwiczenia[/mieszane]` | exercise-engine.js:135 | `#/practice` (**"mixes" tab not in spec**) |
| `#/cwiczenia/zestaw/<id>`, `/mix/<id>`, `/sesja`, `/slabe[/<topic>]` | exercise-engine.js:133–139 | `#/practice/set/<id>`, `/mix/<id>`, `/session`, `/weak[/<topic>]` |
| `#/laboratorium-czasow[/<id> \| /dobierz \| /porownaj/<a>/<b>]` | tense-lab.js:65 | `#/lab[/…]` |
| `#/pisanie[/wzorce/<exam>/<id> \| /zwroty[/<group>]]` | pisanie.js:87 | `#/writing`, `/models/<exam>/<id>`, `/phrases[/<group>]` |
| `#/statystyki`, `#/notatki` | stats-page.js:33, notes.js:145 | `#/stats`, `#/notes` |
| `#/<exam route>[/cwiczenia[/<id>] \| /trening-pisanie[/<task>] \| /trening-mowienie \| /<page>]` | exam-core.js:53 (route from the registry) | `#/exams/<id>[/…]` |
| `#/certyfikat-c1[/…]` | c1-core.js:106 | dropped |
| `#/fiszki…`, `#/bledy[/powtorki]` | reviews.js:203 redirects | dropped (no legacy redirects) |

## 5. On-demand modules

There are two loaders in `ui.js`:
- `loadScript(src)` (`:308`, cached promise);
- `loadModule(file)` (`:321`), which adds `?v=` taken from the `js/ui.js` tag.

Not every lazy load uses `loadModule`. Several build their own `?v=` through `ELM.exercises.asset()` (`exercise-engine.js`), or load with no version at all. Spec 02 §4 wants one `LM.VERSION`.

| Loaded on demand | Who loads it | Trigger |
|---|---|---|
| `js/recorder.js`, `js/speaking-trainer.js` | exam-core.js:500, c1-speaking.js:80 | speaking trainer |
| `js/pisanie-wzorzec.js`, `js/pisanie-zwroty.js` | pisanie.js:187, writing-trainer.js:309 | model text, phrase bank / panel |
| `niezbednik/test-poziomu-dane.js` | level-test.js:348 | placement test |
| `niezbednik/testy-poziomow/<lvl>.js` | level-final.js:103 | `#/a1/test` |
| `szlak/quizy-<lvl>.js` | szlak.js:131 | trail quiz |
| `cwiczenia/cwiczenia-indeks.js`, `cwiczenia/tematy/<id>.js` | exercise-engine.js:74, :91 | practice, topic "Check yourself", level list labels |
| `dane/fiszki/talie/<id>.js` | fiszki.js:62 | opening a deck / session |
| `dane/lab-dane.js` | tense-lab.js:57 | lab |
| `dane/pisanie/zwroty-dane.js` | pisanie-zwroty.js:44 | phrase bank |
| `dane/szukaj-indeks.js` | search.js:73 | first search |
| `niezbednik/<exam>-dane.js` | exam-core.js:46 | entering an exam |
| exercise sets of the mistake task | mistake-task.js:87 | review session item |
| `assets/vendor/gsap.min.js` + plugins | ui.js:332–334 | Today, results, celebrations, lab timeline |

Loaded at start (`index.html`):
- `niezbednik/niezbednik-dane.js` (all pages, about 1 MB in the reference);
- `niezbednik/certyfikat-c1-dane.js`;
- `dane/egzaminy-rejestr.js`;
- `szlak/szlak-dane.js`;
- `dane/fiszki/fiszki-indeks.js`.

## 6. Unit tests in `tools/testy.js` (193, grouped)

`testy.js` loads modules with `require` and, in many groups, **the real English content** (`cwiczenia/tematy/*.json`, `niezbednik/index.json`, `niezbednik/testy-poziomow/*.json`, `niezbednik/*/cwiczenia`, `docs/rozbudowa-v6/przyklady/…`). On the snapshot copy it therefore stops at line 299 with `ENOENT cwiczenia/tematy`. That is expected, because no content was copied.

Legend for "Port": **survives** = pure logic kept, test moves as is (strings may change); **rework** = logic kept, fixture or language assertions must be replaced (Spanish fixtures, syllabus, `tools/fixtures/…`); **drops** = tests dropped code.

| Group (reference heading) | Tests | Module | Port |
|---|---|---|---|
| Daty | 5 | learning | survives |
| Harmonogram powtórek | 7 | learning `REVIEW_STEPS` | **drops** (legacy, D3) |
| Seria nauki | 8 | learning | survives |
| Test poziomu | 11 | learning (placement) | survives; rework 1–2 for syllabus skills (E10) |
| Silnik zadań | 22 | exercise-logic | 14 survive; **rework** 6 that read English content or test contractions (`normalize` skróty, `normalizeSentence`, `translate` I'd, `transformacje` C1 Part 4 on real items, evaluate on every `cwiczenia/tematy` item, new types on the v6 pilot file) → Spanish fixtures + `match` tests (spec 05 §6) |
| Testy końcowe poziomów | 16 | final-logic, profile-data | 6 pure survive; 3 on real pools → rework with fixture pool; 7 storage tests → rework for `slm.finals` + registry |
| Dziennik podejść i statystyki | 9 | learning-stats | survives (1 dedup test touches the legacy `review` stage → rework) |
| Wyszukiwarka | 5 | search-logic | survives; rework "polskie znaki" → Spanish fold cases |
| Egzaminy: strefy licznika | 2 | exam-logic (matura zones) | rework with fixture exam config |
| Fiszki: harmonogram (vectors) | 11 | fiszki-harmonogram | survives (fixture moves to `tools/fixtures/`) |
| Fiszki: ocena, cloze, kolejka, TSV/CSV, stan | 14 | fiszki-logic | survives; `checkAnswer` tests → rework onto `match`; "polskie znaki" in CSV → Spanish |
| Talia Certyfikat C1: jednorazowe włączenie | 1 | fiszki-store | **drops** |
| Szlak: logika | 9 | szlak-logic | survives; data shape changes (E9) → rework fixtures |
| Szlak: magazyn, eksport, import, reset | 4 | szlak-store | rework (key `slm.trail.<id>`, registry) |
| Ulubione zwroty `elm_phrases_v1` | 2 | profile-data | rework (key) |
| Trener mówienia: `seen` | 1 | profile-data | rework (key) |
| Egzaminy z tagów karty | 1 | fiszki-logic `examsOf` | rework (codes from registry) |
| Moje słowa | 14 | fiszki-logic, exam-logic | 7 survive; `isPolish` → drops / replaced by `isTarget`; `splitSentences` abbreviations → rework Spanish; 4 exam-logic tests (`examBoxAnchor` on 3 English pages, `myExams` with `elm_c1_v1`, `formatDatePl`, `navSplit`) → rework or drop |
| Powtórki v8: migracja Dziennika | 9 | fiszki-logic `migrateJournal` | **drops** 8 (legacy); 1 ("nowy wpis: karta od razu") survives |
| Powtórki v8: kolejka | 13 | reviews | survives (`redirectFor` test → drops) |
| Dziś v8: przebyta mapa | 4 | learning, reviews | survives (E1: available levels only → extend) |
| Treści v8: sąsiedzi tematu | 1 | learning | survives (reads `niezbednik/index.json` → syllabus) |
| Treści v8: etykieta zestawu | 1 | exercise-logic | survives |
| Treści v8: odsłuch klawiszem S | 2 | exercise-logic `speechText` | survives, English sentences → Spanish |
| Kontrola v8: przeplatanie kolejki | 3 | reviews | survives |
| Rozkład poprawnych liter | 1 | tools/rozklad-regula.js | rework (runs over real C1 data) |
| Karty „Moje błędy”: pełny kontekst | 11 | fiszki-logic, mistake-task | 8 survive; 3 that rebuild legacy cards (`journalCardsV2`, migration) → drop |
| Fiszki: harmonogram i zapis (fix) | 6 | fiszki-harmonogram, store | survives |

Rough total: about 105 survive as they are, about 65 need reworked fixtures or language assertions, and about 23 are dropped (legacy migrations, C1, redirects). These numbers are estimates per group, and stage 1A reports the exact list.

## 7. Baseline in `reference/` (11 Nov 2026 code, run on 22 Nov 2026, Node 26.8.1, Python 3.14.7, Windows 11)

| Command | Result |
|---|---|
| `node tools/testy.js` | **193 ok, 0 errors** |
| `waliduj-cwiczenia` | OK: 11 sets, 439 items, 15 tenses, 7 tree nodes, 3 mixes, 5 exams, 6 final tests (180 items) |
| `waliduj-fiszki` | OK: 17 decks, 640 cards, 7 scheduler scenarios; 2 warnings |
| `waliduj-c1-uoe` | OK: 39 sets, 5 known notes |
| `waliduj-szlak` | OK: 6 levels, 118 lesson stops, 142 nodes, 42 quizzes |
| `waliduj-zycie` | OK: 110 pages, 15 warnings |
| `waliduj-wzorce` | OK: 28 texts |
| `waliduj-zwroty` | OK: 14 groups, 179 phrases |
| `waliduj-mowienie` | OK |
| `waliduj-v6` (incl. `validate_v6.py`) | 0 errors, 2 warnings |
| `node tools/kontrast.js` | **1,906 pairs, 0 failing** (all theme scopes) |
| `node tools/e2e-start.js` | skipped (no `playwright-core`) |
| `python3 docs/plan/scripts/validate_plan.py docs/plan` (this repo) | 130 topics, 0 errors, 0 warnings |

On the **snapshot in this repo** (no content), two commands crash:
- `node tools/testy.js` stops with ENOENT `cwiczenia/tematy`;
- `node tools/kontrast.js` stops with ENOENT `dane/egzaminy-manifest.json`, because it reads exam colours from the registry.

Stage 1A has to make both run without the old content.

## 8. Notes on the port, by area

- **C1 is load-bearing.** `c1-core.js` and `c1-exercises.js` provide shared code that non-C1 files use:
  - `ELM.c1.plural`, used by 8 files;
  - `ELM.c1.timer`, used by `writing-trainer.js`;
  - `ELM.c1.examBoxFor`, `insertAfterIntro` and `insertExamBoxes`, used by `niezbednik.js` and `exam-core.js`;
  - `ELM.c1.render` and `renderNav`, used by `render.js` and `exam-ui.js`;
  - `ELM.c1.store`, used by `exam-ui.js`;
  - `ELM.c1Exercises.renderWith`, used by `exam-core.js` (the UoE cloze view for exam sets);
  - `ELM.c1Exercises.single`, used by `mistake-task.js`.

  These parts must be extracted before the C1 files are deleted (stage 1B, E8).
- **Content store.** `state.content` is used in 12 files (23× in `app.js`).
- **Build.** There are 9 build scripts and 9 validator scripts. Four of the validators shell out to Python (`scripts/*.py` were not copied). `npm run build` also runs `zbuduj-zasoby` (needs `node_modules`). The new `build.js` should not need npm packages for data. The asset copy stays a separate `npm run assets`.

## 9. Where the plan and the code disagree

1. **Speech copies.** Spec 03 §3.2 counts four. There are five: `reviews.js` also depends on `noEnglishVoice`. On top of that there are 53 hard-coded `lang: "en"` attributes that spec 03 does not mention.
2. **`plural`.** Spec 03 §3.9 treats it as one helper in `exercise-logic.js`. There are 6 implementations and 9 delegating stubs, 8 of them through `ELM.c1.plural`.
3. **C1 drop (spec 03 §1, last row).** The spec says "their task types … already exist as generic item types". That holds for item types. However, `exam-core.js` renders exam sets with `ELM.c1Exercises.renderWith`, and several files use C1 helpers (§8). Dropping C1 needs an extraction step that the spec does not list.
4. **Files missing from spec 03.**
   - `tools/zbuduj-zasoby.js` (asset copier): proposed `tools/build-assets.js`, run by `npm run assets`.
   - `tools/rozklad-regula.js` (generic A–D spread rule): proposed `tools/build/answer-spread.js`, used by the validator.
   - `tools/rozklad-odpowiedzi.js` (one-off data fixer): drop.
   - `tools/waliduj-zycie.js`: drop (D13).
   - `assets/warstwice.svg`: keep, rename.
5. **`kontrast.js` reads `dane/egzaminy-manifest.json`.** Spec 03 calls the contrast step "token pairs updated", but the tool fails without the registry. It needs the new registry path, and it should accept an empty registry.
6. **Unknown routes.** Spec 02 §6 wants "Page not found". The code sends every unmatched `#/…` to the topic-page handler (`niezbednik.parseRoute` matches anything), which shows "missing file". Stage 1B must change the router order.
7. **Routes the spec does not list.** These exist in the code:
   - the trail stop sheet `#/szlak/<stop id>`;
   - review session filters `?tylko=…&max=10`;
   - the practice "mixes" tab `#/cwiczenia/mieszane`;
   - deck sub-routes `import`, `tematy/<level>`, `talia/<id>/nowa | karta/<id>`.

   I propose English equivalents:
   - `#/trail/<stop>`;
   - `#/review/session?only=mistakes|weak|decks|deck:<id>&max=10`;
   - `#/practice/mixes`;
   - `#/review/decks/import`, `/themes/<level>`, `/deck/<id>/new | card/<id>`.
8. **Spanish punctuation.** Spec 05 puts `¿ ¡` handling in `normalizeSentence`. The current `splitSentences` (sentence extraction for My words) also fails on `¿` and `¡`, which spec 05 §6 does not mention. A unit test for it should be added.
9. **Exam themes in CSS.** Spec 03 §2 mentions removing `html[data-section="certyfikat"]`. There are **five** per-exam theme scopes: certyfikat, E8, MP, MR and B2, about 41 rule blocks in total. All of them go, and the exam accent comes from the registry.
10. **`loadModule` version.** Spec 02 §4 wants `LM.VERSION`. The code reads `?v=` from the `ui.js` `<script>` tag, and a few loaders (`exercise-engine.js` `asset()`, and those calling `loadScript` directly) use their own path.
11. **Export envelope.** Spec 02 §5 wants `data: { … }` driven by one registry. Today the parts are `content`, `progress`, `learning`, `fiszki` and `szlak`, each with its own parser (§3). This is no contradiction, just the size of the step 1A job.
12. **Test count after the port.** Spec 03 §2 says "all tests for kept logic must pass after rename". In practice about a third of the kept-logic tests read English content files, so they cannot pass after 1A without new fixtures. Proposal:
    - in 1A, move them onto small fixtures under `tools/fixtures/` (copied English data samples, used for testing only, never shipped);
    - in stage 3, replace them with Spanish fixtures.
