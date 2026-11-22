# Spec 10 — Content production

Content is the biggest part of the project: 130 topics, each with a page, a quiz and usually a set, plus level extras. This spec makes it a repeatable pipeline.

## 1. Batches

- **One batch = one syllabus unit** (4–7 topics). One commit per batch on the stage branch.
- **One content stage = one level** (4–5 batches) and ends with a stop for the owner's "OK".
- **Calibration stop:** the *first* unit of every level stops for review before the other units are written. The owner's corrections become rules in `content/STYLE-NOTES.md`, which every later writer and reviewer brief includes.

## 2. What a batch contains

For each topic of the unit:

1. topic page (spec 07 §1),
2. trail quiz, 4 items (§4),
3. for `verbs`, `grammar`, `cases` topics: one exercise set of 10 items (§5), with at least one `paradigm` item when the topic has a paradigm; for `functions` and `vocabulary` topics a set is optional (recommended: 8 items, mostly `match`, `gap-fill`, `multiple-choice` with `kind: "function"`).

Per unit: one mixed set entry in `mixes.json` ("Unit review: <unit title>").

## 3. Level extras (stage X, after all units of the level)

Level summary · cheat sheet (check one page with `tools/cheatsheets-pdf.js`, A4 and Letter) · final test pool (30) · vocabulary decks for the level's vocabulary topics · form decks assigned to the level (spec 08 §5) · lab cards for forms first met at this level · home page table row · set the level to `"available"` in `content/levels.json`.
First X stage only: the **whole placement pool** (60 questions, all six levels) and the home page.
X stage of B1: phrase bank.

## 4. Pipeline for one batch

```
plan → write → validate → solve (subagent A) → proofread (subagent B) → fix → validate → build → look → commit
```

1. **Plan.** Read the unit in the syllabus, spec 08, `STYLE-NOTES.md`, and the pages of earlier units of the level (to know what the learner already has). For each topic write a 5-line outline (scope, what is *not* covered here because another topic covers it, the English contrast, 3 mistakes). Check overlaps between topics of the batch.
2. **Write** pages, then quizzes, then sets. Items are written *after* the page so they test what the page teaches.
3. **Validate** (`npm run validate`). Fix all errors and look at every warning.
4. **Subagent A — solver.** Gets only the items (quizzes and sets) **without** `correct`, `accepted`, `explanation`, `optionNotes` (strip them with `tools/strip-keys.js`). Brief in §5. Compare its answers with the key: every disagreement is either a flawed item (fix) or a solver slip (note why).
5. **Subagent B — native proofreader.** Gets pages, items with keys, and the proofreader notes of spec 08. Brief in §5. It does not rewrite; it returns a list of findings with severity.
6. **Fix** every "error" finding; fix or consciously reject every "suggestion" (say why in the batch report).
7. Validate again, build, open two pages and one quiz in the browser (light and dark, 390 px), run one set to the result screen.
8. **Commit** `content(<level>): unit <n> <title>` with a short batch report in the body: topics, counts, solver disagreements and what was done, proofreader findings fixed / rejected.

Two independent passes are mandatory. If subagent B reports more than 5 errors per 1,000 words in a batch, run a second proofreading pass after fixing.

## 5. Subagent briefs (use verbatim, fill the brackets)

**Solver (A)**

```
You are a strong [LANGUAGE] learner at level [LEVEL+1] taking a test. Below are [N] tasks from a course taught in English at level [LEVEL]. The answer key is hidden.
For every task: (1) give your answer; (2) for closed tasks say whether MORE THAN ONE option could be defended as correct, and which; (3) for typed tasks list EVERY answer a careful teacher would have to accept (word order variants, with and without subject pronoun, masculine and feminine speaker, tú/usted or ty/pan, regional variants); (4) flag tasks that are ambiguous, need outside knowledge, are above the level, or contain a language mistake in the prompt.
Return JSON: [{ "id", "answer", "alsoAcceptable": [], "problems": [] }]. Do not explain grammar unless it is a problem report.
```

**Native proofreader (B)**

```
You are an educated native speaker of [LANGUAGE] and an experienced teacher of [LANGUAGE] as a foreign language to English speakers. Review the material below (level [LEVEL]).
Check every [LANGUAGE] sentence, form, table cell, option and accepted answer for: correctness (spelling, diacritics, endings, agreement, government, aspect/tense/mood), naturalness (would a native say this?), level (structures and words above [LEVEL]), consistency with the rule the page states, and wrong or missing accepted answers. Check every English translation for accuracy. Check that each "Common mistakes" line is a real, typical learner error and that its correction is right.
Language checklist: [PASTE section "Notes for the proofreader subagent" from spec 08]
Style notes from the owner: [PASTE STYLE-NOTES.md]
Do NOT rewrite the material. Return a list of findings: { "file", "where" (quote), "severity": "error" | "suggestion", "problem", "fix" }. If you are not sure something is wrong, mark it "suggestion" and say what you would check. If everything in a file is fine, say so explicitly.
```

## 6. Human review

The owner is learning Spanish himself and cannot judge the Spanish. So: the two subagent passes are never skipped; anything the proofreader marks "not sure" is listed in the stage report with the sentence quoted; and before the app is shared with other people, a native speaker or teacher should spot-check at least five pages and two sets per level. Until then each level page shows a small note: "New content. Found a mistake? Tell us." (the report link, E12).

## 7. Definition of done for a level

`npm run validate` clean · every topic of the level: page + quiz (+ set where required) · extras from §3 · solver and proofreader reports attached to commits · cheat sheet fits one page · final test passable end to end · placement result screen links work · search finds the new pages · level set to `available` · README content counts updated.

## 8. Writing order inside a level and rough volumes

| Level | Topics | Words per page | Quiz items | Set items (about) |
|---|---|---|---|---|
| A1 | 26 | 300–700 | 104 | 150 |
| A2 | 26 | 300–700 | 104 | 160 |
| B1 | 25 | 450–850 | 100 | 160 |
| B2 | 23 | 450–850 | 92 | 150 |
| C1 | 18 | 500–1000 | 72 | 110 |
| C2 | 12 | 500–1000 | 48 | 60 |

Plan one Claude Code session per two units (pages are long; keep context for review). A level is therefore two or three sessions plus one for extras.
