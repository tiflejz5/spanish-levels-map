# Spanish Levels Map — project memory for Claude Code

A static web app for learning **Spanish** (A1–C2), explained in **English**. Standalone project in its own repository.

The app is a port of `english-levels-map` (reference clone in `reference/english-levels-map/`, read-only, git-ignored). First user: the owner, a Polish speaker who learns Spanish through English to practise both.
The plan lives in `docs/plan/`. **Read `docs/plan/00-READ-ME.md` before any work.** Specs win over habits from the reference repo.

## Hard rules (every session)

1. **Work in stages.** One stage = one branch `stage/<nn>-<name>` from `main`, one commit per step. At the end of a stage: build, validate, tests, screenshots, short summary, then **stop and wait for the owner's "OK"**. Merge and push only after "OK".
2. **Architecture is fixed:** plain `<script src>` files, one global `window.LM`, no ES modules, no `fetch()`, no framework, no CDN, no build step needed to *run* the app (works from `file://` and GitHub Pages). JSON / Markdown sources in `content/` → generated `.js` files in `data/`, big ones loaded on demand.
3. **Never use `innerHTML` with data.** DOM is built with `LM.utils.el`. User text goes in through `textContent` / `value`.
4. **The UI is English.** No Polish text in `js/`, `css/`, `index.html` or `tools/` (`npm run check:lang` must pass). Comments and identifiers are English.
5. **Spanish-specific code lives only in `js/lang.js` and `js/config.js`** (and in data). Every other file must read language facts from `LM.lang` / `LM.APP`.
6. **Storage:** every localStorage key starts with `slm.`. Every access in `try/catch`. Every per-profile key is covered by export, import, reset and profile deletion. Never use `elm_*` keys or the prefix of the sibling apps: on GitHub Pages all the owner's apps share one origin.
7. **Design:** follow `DESIGN.md` — tokens only, light and dark themes, WCAG AA (`npm run contrast`), targets ≥ 44 px, `prefers-reduced-motion`, colour never the only carrier of meaning, no horizontal scroll from 320 px.
8. **Content is original.** Never copy from textbooks, exam papers or other sites. Exam-style tasks are written from scratch.
9. **Content quality gate:** no content commit without (a) validators green, (b) a solver subagent that answers every item without the key, (c) a native-proofreader subagent. See spec 10.
10. **Do not edit generated files** (`data/**`). Edit sources and run `npm run build`.
11. If a spec is wrong, unclear or contradicts the code: stop, say so, propose a fix. Do not silently improvise.

## Commands

```
npm run build        # validate + generate data/*.js + search index; --bump raises the version stamp (?v=) in index.html
npm run validate     # all validators
npm test             # unit tests for pure logic (no DOM)
npm run check:lang   # fails if code contains Polish text or language facts outside js/lang.js and js/config.js
npm run contrast     # WCAG contrast for all token pairs, both themes
npm run e2e          # browser smoke tests (skips when Playwright is missing)
```

## Where things are

```
index.html   app shell              css/, js/, assets/   code
js/config.js LM.APP (names, storage prefix, speech, characters)      js/lang.js   LM.lang (Spanish rules)
content/     SOURCES: syllabus.json, levels.json, home.md, pages/, summaries/, cheatsheets/, quizzes/, exercises/, tests/, decks/, lab/, writing/, exams/
data/        GENERATED .js (committed)
tools/       build, validators, tests, contrast
docs/plan/   specs, syllabus, examples, prompts
reference/   read-only clone, not committed
```
