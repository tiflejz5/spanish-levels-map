# Spec 07 — Content model

Formats are the reference formats with English keys kept as they were (they already are English) and English explanations. This spec fixes: file locations, which fields are in which language, page templates, and quality rules. Working samples of everything are in `docs/plan/examples/`.

**Language of fields.** *Target* = Spanish. *EN* = English.

**Paths.** All sources live under `content/`; paths below are relative to it. Samples: `docs/plan/examples/` (same layout).

## 1. Topic page — `pages/<level>/<category>-<slug>.md`

```
---
id: a1-verbs-gustar            # = syllabus id
level: A1
category: verbs
title: gustar and similar verbs   # EN (may contain target words)
summary: One sentence, EN, shown in lists and search (max 140 characters).
---
```

Front matter values are plain text after the **first** colon (no quotes; a title may contain further colons).

Body: `#` title, a 2–4 sentence introduction (what it is, when you need it, and **how it differs from English**), then the sections for the category. Headings are fixed text because callouts and validators key on them.

| Category | Required sections, in order | Optional |
|---|---|---|
| verbs, grammar, cases | `## How it works` · `## When to use it` · `## Examples` · `## Common mistakes` · `## Practice` · `## Answers` | `## Good to know`, `## Real life vs exam` (stage E) |
| functions | `## Key phrases` · `## Dialogue` · `## Common mistakes` · `## Practice` · `## Answers` | `## Culture note`, `## Good to know` |
| vocabulary | `## Words` · `## Word partners` · `## Common mistakes` · `## Practice` · `## Answers` | `## Good to know` |

Rules:

- **Length** (body words): A1–A2 300–700 · B1–B2 450–850 · C1–C2 500–1000.
- `## How it works`: the form. Tables for paradigms (all persons / all relevant cases). Mark irregular bits in bold.
- `## When to use it`: numbered uses, each with one example and its translation.
- `## Examples`: one table, header `| Spanish | English |`, 6–8 rows, natural sentences people really say, vocabulary at or below the page level, varied subjects and names.
- `## Key phrases`: tables `| Spanish | English |` grouped by sub-function (asking, answering, reacting), 12–20 phrases, formal / informal marked.
- `## Dialogue`: 6–10 lines as a blockquote, speaker names in bold, English gloss in parentheses at the end of each line.
- `## Words`: thematic tables `| Spanish | English |`, 30–50 items per page. Nouns always with article (*el coche*).
- `## Word partners`: 8–12 collocations in short sentences.
- `## Common mistakes`: 3–5 lines `- ✗ *wrong* → ✓ *right* — why (one clause, EN)`. Real, typical learner errors (see spec 08 §3), not invented ones.
- `## Practice`: 6–8 numbered items, at least two kinds (fill in, choose, translate from English, correct the mistake). `## Answers`: numbered, hidden behind "Show answers" by the engine.
- `## Good to know`: exceptions, regional notes, register notes.
- Italics only for target-language text (spec 05 §5). Translations in parentheses or in the English column. A literal gloss only when it teaches something: *Me gusta el café* ("coffee pleases me").
- Links to other topics: `[[topic-id]]`.
- No exam claims, no statistics without a source, no "as a native speaker I…".

## 2. Level summary — `summaries/<level>.md`

Front matter `id: <level>-summary`, `level`, `title`, `next`. Sections (bold lead-ins as in the reference): **What you can do at this level** · **Key ideas** (5 bullets) · **The most common trap** · **How long it takes** (guided hours, stated as a typical range) · **What next**.

## 3. Cheat sheet — `cheatsheets/<level>.md`

One printed page (A4 **and** US Letter). Front matter `id: cheatsheet-<level>`, `level`, `title`, `summary`. Fixed headings: `## Forms` (table, max 8 rows) · `## Grammar` (4–8 bullets) · `## Phrases` (10–16 pairs) · `## Signal words` (table, max 10 rows) · `## Watch out` (5 lines ✗ → ✓). Content only from that level's topic pages. If it does not fit one page, cut text; never go below 9.5 pt.

## 4. Trail quiz — `quizzes/<level>/<topic id>.json`

```json
{ "version": 1, "id": "<topic id>", "topic": "<topic id>", "level": "A1", "title": "Stop: gustar", "passScore": 3, "items": [ 4 items ] }
```

Four multiple-choice items (one may be `gap-fill` with a single gap). They test the core of the page, not its footnotes. `prompt` target or EN instruction + target sentence; `options` target; `explanation` EN (1–2 sentences); `optionNotes` EN, one per wrong option, saying which mistake it is.

## 5. Exercise set — `exercises/<set id>.json`, map in `exercises/topics.json`

Set: `{ version, id: "<topic id>-1", topic, level, title, intro, passage, items }`. Field names of every item type are exactly those of the reference engine (`reference/…/docs/rozbudowa-v2/spec/01-typy-zadan.md`, `docs/rozbudowa-v6/spec/12-nowe-typy-zadan.md`); the table below only says which language each field is in. 10 items, at least four different types, ids `<set id>-NN`, `tags` per item (lower-case kebab, used by weak-spot drill and the lab).

| Type | Target-language fields | EN fields |
|---|---|---|
| `multiple-choice` (`kind`: `form`, `function`, `meaning`) | `prompt` sentence, `options` | instruction part of `prompt`, `explanation`, `optionNotes` |
| `reorder` | `answers` (every natural order; the first one supplies the word tiles) | `context` (the sentence in English, shown as the task), `explanation` |
| `find-error` | `tokens`, `fixes` (+ `errorRange`: first and last index of the wrong tokens) | `explanation` |
| `short-answer` | accepted answers (field names as in the reference engine) | `prompt` (may quote target text), `explanation` |
| `gap-fill` | `text`, `gaps[].accepted`; `gaps[].hint` (lemma in brackets, target) | `context`, `explanation` |
| `match` | pairs: target ↔ EN (`translation`), target ↔ target (`halves`, `response`), target ↔ EN definition (`definition`) | `prompt` |
| `transformation` | `source`, `keyword`, `before`, `after`, `answers` | `explanation` |
| `translate` | `accepted` (first = model answer) | `source` (EN sentence), `hint` |
| `dictation` | `text`, `accepted` | — |
| `paradigm` | `lemma`, `cells[].label`, `cells[].accepted` | `prompt`, `gloss`, `explanation` |

Rules: exactly one correct answer for closed items (the solver subagent checks this); `accepted` complete (spec 05 §3); distractors are typical learner mistakes; every item has an `explanation` that names the rule in one or two sentences; no item depends on outside knowledge; `translate` sources are short (≤ 9 words at A1–A2, ≤ 14 later).

Mixed sets: `exercises/mixes.json` as in the reference (`id`, `title`, `description`, `level`, `count`, `mode`, `topics`). One mix per unit ("Unit review: …") plus thematic mixes.

## 6. Tests — `tests/placement.json`, `tests/final-<level>.json`

Placement: 10 questions per level, 60 total: 5 grammar (verbs, cases and grammar count here), 3 vocabulary, 2 reading (with `passage`: A1–B1 30–80 words, B2–C2 60–130). Fields as in the reference (`id`, `level`, `skill`, `type: "multiple-choice"`, `question`, `options` (4), `correct`, `explanation`, `topicId`, `passage`). Questions and options in the target language; from B1 up, instructions too.

Final test: standard set with `kind: "level-test"`, `draw: 20`, `passPercent: 80`, `defaultMode: "exam"`, **30 items**, each with `topic` from that level; covers ≥ 70% of the level's topics and all categories; at least half multiple-choice; no `dictation`; at most two `paradigm`.

## 7. Decks — `decks/index.json`, `decks/<deck id>.json`

Card types as in the reference:

- `typed`: `front` (EN prompt, with a disambiguating hint in brackets when needed: "to know (a fact)"), `accepted` (target), `back` (target, with article / gender / aspect partner), optional `note` (EN), `example` (target sentence), `exampleEn`.
- `cloze`: `text` (target sentence with one `{{answer|alternative}}` gap), `hint` (EN meaning of the gap), optional `en` (translation of the whole sentence, shown on the back), `note`.
- Every card: `id` `<deck id>-NNN`, `level`, `tags`.

Deck kinds: one deck per vocabulary topic (30–40 cards, about 60% typed, 40% cloze); form decks defined in spec 08 (irregular verbs, case endings, aspect pairs…); all built-in decks are off by default except the first A1 deck.

## 8. Lab, writing, exams

Lab data: the lab spec and spec 08. Phrase bank `writing/phrases.json`: reference format (`groups` → `phrases` with `id`, target text in field `text`, `en`, `level`, `register`, `example`, `note`, `genres`); written in stage X of B1. Writing tasks, model answers, speaking cards and exams: stage E (spec 12).

## 9. Quality rules for all content

1. **Correct and natural.** Standard language of educated native speakers. No calques from English. Spanish typography («…» or “…”, ¿…?, ¡…!).
2. **Level discipline.** A page at level X uses structures from X and below (the syllabus order inside the level matters: a unit-2 page may not rely on unit-4 grammar). Higher-level words only when they are the topic.
3. **Contrast with English** in every introduction where it helps (English is the language of explanation). The mistakes section lists typical learner errors.
4. **People and places:** varied names from the language's world (Spain and Latin America), mixed genders, ordinary modern life. No stereotypes, no politics, no brand names.
5. **Explanations short.** One idea per sentence. Tables beat paragraphs.
6. **Original.** Written from scratch. Never copied or closely paraphrased from textbooks, exam papers or websites.
7. **Consistent terminology** (glossary in spec 08).
