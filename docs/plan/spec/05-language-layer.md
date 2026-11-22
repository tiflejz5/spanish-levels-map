# Spec 05 — Language layer (`LM.lang`) and speech (`LM.speech`)

Everything the code needs to know about Spanish is in `js/lang.js` (rules) and `js/config.js` (values). The other files contain generic algorithms. `lang.js` has unit tests in `tools/tests.js`.

## 1. Interface

```js
LM.lang = {
  stripMarks(str),        // á→a é→e í→i ó→o ú→u ü→u ñ→n (same length as input)
  fold(str),              // for SEARCH: lower-case + stripMarks + unify quotes; same length as input
  wordPattern,            // RegExp source for one Spanish word (letters with diacritics, inner hyphen or apostrophe)

  normalizeAnswer(str),   // short answers / gaps: trim, collapse spaces, lower-case, unify ’ → ', drop a final full stop. KEEPS diacritics.
  normalizeSentence(str), // normalizeAnswer + remove punctuation including ¿ ¡ « »; keeps diacritics
  variants(str),          // equivalent spellings → array including the input (here: [str]; English expanded contractions here)
  countWords(str),

  isTarget(text),         // fallback when there is no lang attribute: diacritics, or at least two function words and not mostly English
  abbreviations,          // never end a sentence: ["Sr.", "Sra.", "Dr.", "Dra.", "Ud.", "Uds.", "p. ej.", "etc."]
  functionWords           // el la los las de que y en un una por con no para se
};
```

## 2. Checking an answer (`LM.exLogic.match`, generic)

```
match(answer, accepted[], { sentence: bool }) → { ok, near, closest }
```

1. Normalize both sides, expand `variants`. Equal → `{ ok: true }`.
2. Else compare with `stripMarks` on both sides. Equal → `near: "accents"`.
3. Else, single-word answers: same first 60% of letters (at least 3), only the ending differs → `near: "ending"`.
4. Else, edit distance ≤ 1 (words of 5+ letters) or ≤ 2 (9+ letters) → `near: "typo"`.
5. Else `near: null`; for sentences run the existing word-by-word diff (missing / extra / replaced) against the closest accepted variant.

| `near` | Message |
|---|---|
| `accents` | "Almost. Check the accents: **{closest}**" |
| `ending` | "Right word, wrong ending: **{closest}**" |
| `typo` | "Looks like a typo: **{closest}**" |

**Scoring:** `near` never makes an answer correct, with one exception: preference `lenientAccents: true` turns `near: "accents"` into correct **with the reminder still shown** (the attempt is logged with `lenient: true`). Default off. Flashcards (`typed`, `cloze`) use the same `match`. Capital letters are ignored.

## 3. What code does NOT do (content rules instead)

Morphology is never generated. Complete `accepted` lists solve these cases, and validators warn (E11):

- **Dropped subject pronouns.** If an accepted sentence starts with *yo, tú, él, ella, usted, nosotros/-as, vosotros/-as, ellos/-as, ustedes*, the variant without it is accepted too (unless ambiguous or the prompt says "use the pronoun").
- **Gender of the speaker.** *cansado / cansada*: the prompt fixes it ("(a woman speaking)") or both are accepted.
- **tú / usted, vosotros / ustedes.** The prompt fixes it ("(to a friend)", "(formal)", "(Spain, plural)") or all are accepted.
- **Word order.** `translate` and `reorder` list every natural order.
- **Regional vocabulary.** All standard variants accepted.

## 4. Speech: `js/speech.js` → `LM.speech`

One module replaces the four separate voice implementations of the original (`exercise-engine`, `shortcuts`, `speaking-trainer`, `tense-lab`).

```js
LM.speech.available()                    // a Spanish voice exists
LM.speech.speak(text, { rate, onend })   // a second call while speaking stops
LM.speech.speakScript(lines, opts)       // dialogue "A: … / B: …" with two voices when available
LM.speech.stop()
LM.speech.voices()                       // matching voices, best first
```

- Voice choice: prefix match on `voice.lang` against `LM.APP.speech.voices`, filtered by the preference `voiceVariant` (Spain / Latin America); prefer local voices; `getVoices()` is empty until `voiceschanged`.
- Rate default 0.9; dictation keeps its slow replay (0.7).
- No voice: transcript instead of listening, "read" marker, dictation skipped, listen buttons hidden. Keep and test these paths.
- Only Spanish text is sent to speech (gaps read as a short pause), never English instructions.

## 5. Target-language markup in content

`markdown.js` turns three conventions into `lang="es"`:

1. `*italic*` = Spanish. **Italics are reserved for this.** English emphasis uses `**bold**`.
2. A table column whose header is `Spanish` → all its cells.
3. A blockquote `>` = Spanish dialogue or text (an English gloss in parentheses at the end of a line is rendered outside the `lang` span).

Effects: correct screen-reader pronunciation; "Add to My words" appears only inside `[lang]`; listen buttons (E5); underlining of My words skips English. In exercises and decks the fields are typed by format (spec 07).

## 6. Tests required

`stripMarks` / `fold` keep length · `normalizeSentence` strips the language's punctuation · `match`: exact, accents-only, ending-only, typo, lenient mode · word diff on a 6-word sentence · sentence extraction with abbreviations · `isTarget` on 10 Spanish and 10 English sentences · cloze building around words with diacritics and hyphens · `countWords`.
