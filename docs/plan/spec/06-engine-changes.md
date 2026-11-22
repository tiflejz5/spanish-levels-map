# Spec 06 — Engine changes (E1–E12)

Everything not listed here behaves as in the original.

## E1. Level status: "available" or "soon"

`content/levels.json`. **soon:** the sidebar shows the level with a "soon" text label; the level page lists the planned topics from the syllabus (titles and examples, no links, no checkboxes) under "B1 is on its way. The topics below are what it will cover."; no final-test or cheat-sheet cards; the trail draws the land dimmed with "Coming soon"; search does not index it; progress on Today counts available levels only. The placement test may still return a "soon" level and then says so. The validator requires an **available** level to be complete: every topic has a page and a quiz; summary, cheat sheet and final test exist.

## E2. Checklist = topics

`LM.SYLLABUS` (from `content/syllabus.json`) is the only list of levels, units, categories and topics. `progress[<topic id>] = true`. The level page groups topics by category (order of first appearance); the trail uses unit order.

## E3. Special-character bar

Under every input that expects Spanish text (short-answer, gap-fill, transformation, translate, dictation, paradigm, typed and cloze flashcards, writing trainer, answer fields of "Add mistake"): buttons from `LM.APP.chars` (á é í ó ú ü ñ ¿ ¡). Inserts at the cursor of the last focused input, keeps focus, supports undo (`insertText`, fallback `setRangeText`). 44 px targets on touch; `aria-label` "Insert á". Shift or long press gives the capital. Desktop: `Alt` + base letter cycles the marked forms. One implementation (`js/charbar.js`), attached by `data-charbar`.

## E4. Accent-aware checking

Spec 05 §2: hints `accents` / `ending` / `typo`; preference "Accept answers without accents — you still see the correct spelling"; stats show lenient answers as a separate small number.

## E5. Listening everywhere

`LM.speech` (spec 05 §4). Listen buttons on every row of an examples table and on every blockquote in topic pages; `S` reads the focused example; optional auto-play of the Spanish side of a flashcard (default off). Setting "Voice: Spain / Latin America".
## E6. Item type `paradigm` ("Fill the table")

```json
{
  "id": "…-07", "type": "paradigm", "prompt": "Present tense", "lemma": "…", "gloss": "…",
  "cells": [ { "label": "…", "accepted": ["…"] }, { "label": "…", "accepted": ["…"], "given": true } ],
  "explanation": "…"
}
```

3–8 cells; a `given` cell is shown filled in (0 points); 1 point per answered cell; `correct` = all cells right. Checked per cell with `match`. View: label + input grid (one column under 480 px), character bar, Tab moves down, Enter checks; wrong cells show the right form. Labels are persons (*yo, tú, él / ella / usted, nosotros, vosotros, ellos / ustedes*). Listed everywhere item types are listed (hub filters, generator, stats, mistake log, validators, shortcuts). At most two per placement or final test. Working samples: `docs/plan/examples/exercises/`.

## E7. Tense & Mood Lab

Route `#/lab`, data in `content/lab/`. Built from the original Tense Lab:

- `cards.json`: the map grid is defined by data: `axes: { columns: [past, present, future], rows: [indicative, subjunctive, imperative and conditional] }`; each card has `column`, `row`, `name` (native), `nameEn`, `level`, `summary`, `formation` (free list of `{ label, text }` instead of the fixed affirmative / negative / question), `uses`, `signals`, `scenes` (timeline drawing, same element kinds as the original), `traps`, `contrasts`, `topicIds`, `setTags`. Sample: `docs/plan/examples/lab/cards.sample.json`.
- `contrasts.json`: stand-alone contrast cards that are not tenses (ser vs estar, por vs para, saber vs conocer): two columns of rules with examples and a mini quiz (4 standard multiple-choice items).
- `trees.json`: any number of decision trees (original "Dobierz czas" format: nodes, options, result).
- Shared parts kept: card page with listen buttons, compare view, search entries, notes button. Content plan: spec 08 §4.

## E8. Exams module: generic only

`exam-core`, `exam-ui`, `exam-logic`, trainers; routes under `#/exams/<id>`. Until stage E the registry is empty and the sidebar group "Exams" is hidden. A fixture exam in `tools/fixtures/exam-demo/` keeps the code under test.

## E9. Trail generated from the syllabus

The build creates the trail: level → `land`, `finalTest`, `units`; unit → one **lesson stop per topic** (`id` = topic id, `page`, `quiz` = topic id when the quiz file exists) and one **checkpoint** at the end (`<unit id>-checkpoint`, `from` = the unit's stops, `size` = min(8, 2 × topics)). Passing rules as in the original: quiz ≥ 3 of 4, or "I know this", or best set ≥ 80% (when no quiz), or Skip; a quiz never ticks "I know this" by itself. Optional `content/trail-overrides.json` may rename stops or change checkpoint size.

## E10. Tests use syllabus categories

Placement: skills `grammar`, `vocabulary`, `reading` (`verbs` count as grammar). Final tests: proportional draw over the syllabus categories.

## E11. Validators (`tools/validate-*.js`)

All rules of `docs/plan/scripts/validate_plan.py`, plus:

1. Accepted sentence starts with a subject pronoun and the variant without it is missing → warning.
2. Answer contains an *-o / -a* adjective after *estoy / soy / estás / eres* and the prompt has no gender note → warning. Task about "you (plural)" without a region note accepts only one of *vosotros* / *ustedes* forms → warning.
3. Characters outside the Spanish alphabet + ASCII in target-language fields → error (catches wrong-language letters and broken encoding).4. Multiple choice: exactly one correct option, no duplicates after normalisation, `explanation` required, `optionNotes` length = options length.

## E12. Report a mistake + footer

Every topic page, quiz result, set result and flashcard back has a quiet "Report a mistake" link built from `LM.APP.reportUrl` + a prefilled title (`<topic id>: `), with `LM.APP.reportMail` as a `mailto:` alternative when set. Home footer: version, "No accounts. Your progress stays in this browser.", link to the source repository.
