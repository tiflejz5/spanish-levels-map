# Spanish Levels Map — plan, read this first

Goal: a standalone app that teaches **Spanish** A1–C2 with explanations in English, built on the idea and code of `english-levels-map` (Polish UI, teaches English).

Reference: `english-levels-map` at commit `275be9f` (11 Nov 2026): 676 files, about 1.4 MB of JS/CSS, 110 topic pages.

## Contents

```
00-READ-ME.md                  rules, stage table (this file)
PROMPTS.md                     prompts for Claude Code, stage by stage
spec/01-product-and-decisions.md   what we build, for whom, decisions already made
spec/02-architecture.md        repo layout, config, build, storage, routes
spec/03-port-map.md            file-by-file map: english-levels-map → this app
spec/04-ui-language.md         English UI: style, glossary Polish → English
spec/05-language-layer.md      LM.lang and LM.speech: answers, accents, speech, search, markup
spec/06-engine-changes.md      new and changed features (E1–E12)
spec/07-content-model.md       page templates, data formats, quality rules
spec/08-spanish.md              Spanish: teaching decisions, typical mistakes, lab content, decks, proofreader notes
spec/09-engine-portability.md  how to keep the engine reusable (the Polish app will be made from a copy)
spec/10-content-production.md  writing pipeline, batches, reviewers, definition of done
spec/11-design-and-branding.md name, accent, lands, home page
spec/12-exams.md               exams: research-first stage
spec/13-qa-and-launch.md       QA matrix, release checklist
syllabus.json                  FULL syllabus A1–C2: 130 topics in levels → units (source of truth for ids)
examples/                      gold-standard samples of every content type (they pass the validator)
scripts/validate_plan.py       reference validator (port the rules to tools/validate-*.js)
```

## Rules

The hard rules are in `/CLAUDE.md`. They apply to every stage. In addition:

- **Copy, then change.** Code is copied from the reference and adapted. Do not rewrite working logic from scratch; keep its tests and extend them.
- **Tests first for logic changes.**
- **Examples are the quality bar.** Files in `examples/` define format *and* quality and become the first real content.
- **Syllabus ids are frozen.** They become page ids, checklist ids, trail stop ids and storage keys. Titles may change; ids need the owner's OK.
- **Update docs in the same stage:** `README.md` and `DESIGN.md`.

## Stages

| # | Stage | Prompt | Spec |
|---|---|---|---|
| 0 | Bootstrap: reference clone, code snapshot, port inventory | 0 | 02, 03 |
| 1 | Skeleton: `LM` namespace, English file names, layout, build, storage; then checklist = topics, English routes, level status, trail from syllabus, legacy removal | 1A, 1B | 02, 03, 06 (E1, E2, E8, E9) |
| 2 | English UI | 2 | 04 |
| 3 | Language layer: answers and accents, character bar, speech, search, `lang` markup | 3 | 05, 06 (E3–E5) |
| 4 | Exercises: engine check, `paradigm` type, validators | 4 | 06 (E6, E10, E11), 07 |
| 5 | Learning loop: flashcards, reviews, My words, mistakes, tests, Today, Stats | 5 | 06 (E12), 13 |
| 6 | Tense & Mood Lab | 6 | 06 (E7), 08 |
| 7 | Branding, DESIGN.md and README in English, QA, tag `engine-v1` | 7 | 09, 11, 13 |
| C | **Content** (repeat per level, by units) | C | 07, 08, 10 |
| X | **Level extras** (repeat per level) | X | 07, 08, 10 |
| L | Publish | L | 13 |
| E | Exams (research → proposal → build) | E1, E2 | 12 |

Levels without content are shown as "coming soon" (E1), so the app is usable from the first finished level.

## Validation

```
python3 docs/plan/scripts/validate_plan.py docs/plan     # syllabus + examples: 0 errors
python3 docs/plan/scripts/validate_plan.py content       # later: the real content
```
