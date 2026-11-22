# Spec 04 — UI language: English

## 1. Mechanism

The original UI is Polish, with about 1,500 string literals. In this app every user-visible string is **English, written directly in the code** (labels, buttons, `aria-label`, `title`, toasts, dialogs, empty states, document titles, export texts, print headers). There is no translation layer: one app, one UI language.

Helpers in `js/utils.js`:

```js
LM.plural(n, "day", "days")          // "1 day", "3 days"
LM.fmt.date("2026-11-12")            // "Nov 12, 2026"  (Intl.DateTimeFormat("en-US"))
LM.fmt.dayMonth(...), LM.fmt.weekday(...), LM.fmt.number(...), LM.fmt.percent(...)
```

- Do not build sentences from fragments; write whole sentences with template literals.
- Texts that mention the language or the app read them from `LM.APP` (`LM.APP.language`, `LM.APP.appTitle`), never hard-coded.
- Strings that come from data (page titles, set titles, category labels) are already English in `content/`.

## 2. English style

- **American English, plain and short.** Many learners read English as a second language: aim for B1-readable sentences, no idioms, no jokes that depend on culture.
- Second person, warm, factual: "Save it now. It comes back tomorrow as a review."
- Buttons: verb + object, sentence case: "Add mistake", "Start review (3)", "See result". Never "OK" alone, never "Click here".
- No pressure, no judging: mistakes are "things to review". The streak encourages ("Streak continues"), it never threatens.
- Empty states say what will appear here and offer one action.
- Errors say what to fix: "Type the correct answer.", "A name can have up to 30 characters."
- Test results always say "approximate" and that this is not an official test.
- Typography: curly quotes “…”, en dash – in ranges (A1–C2), ellipsis …, a space between number and unit ("3 days").
- Grammar terms: use the common English term and, on first use on a page, the native term in italics: "the preterite (*pretérito indefinido*)", "the genitive (*dopełniacz*)".

## 3. Glossary (Polish UI → English UI)

Use exactly these terms everywhere (UI, README, DESIGN.md, specs).

| Polish (reference) | English | Notes |
|---|---|---|
| Niezbędnik | Handbook | the collection of topic pages |
| podstrona, temat | topic page, topic | |
| Umiem | I know this | toggle and checklist; progress text: "12 of 26 known" |
| Poziomy · wszystkie kategorie | Levels · all categories | |
| kraina | land | Meadow, Forest, Hills, Lake, Mountains, Summit |
| Dziś | Today | |
| Kontynuuj | Continue | |
| Szlak | Trail | |
| przystanek | stop | "Stop 4 of 26" |
| powtórka (na Szlaku) | checkpoint | to avoid confusion with spaced-repetition reviews |
| Zaliczone / Pomiń | Done / Skip | |
| Idź dalej szlakiem | Continue the trail | |
| Sprawdź się | Check yourself | |
| Test poziomu | Placement test | |
| Test końcowy A1 | A1 final test | |
| Zaliczony · 12.11.2026 | Passed · Nov 12, 2026 | |
| Ściąga | Cheat sheet | |
| Podsumowanie poziomu | Level summary | |
| Fiszki i błędy | Review | sidebar item; page title "Flashcards and mistakes" |
| Na dziś / Talie / Moje błędy / Moje słowa | Due today / Decks / My mistakes / My words | |
| Dziennik błędów | Mistake log | |
| Dodaj błąd | Add mistake | |
| Znowu / Trudne / Dobrze / Łatwe | Again / Hard / Good / Easy | |
| Zawieś | Suspend | |
| Nowe / W nauce / Opanowane | New / Learning / Mastered | |
| Do Moich słów | Add to My words | |
| Utwórz fiszkę… | Make a flashcard… | |
| Ćwiczenia, Centrum ćwiczeń | Practice | |
| zestaw / zestaw mieszany (mix) | set / mixed set | |
| tryb Nauka / Egzamin | Learn mode / Exam mode | |
| Powtórz tylko błędne | Retry mistakes only | |
| Słabe punkty | Weak spots | |
| Sprawdź / Dalej / Pokaż odpowiedzi | Check / Next / Show answers | |
| Nie wiem | I don't know | |
| Laboratorium czasów | Tense & Mood Lab | |
| Dobierz czas | Pick the tense | |
| Porównaj | Compare | |
| Seria / Dni z rzędu / Najdłuższa seria | Streak / Days in a row / Longest streak | |
| Statystyki | Stats | |
| trafność | accuracy | |
| Moje notatki | My notes | |
| Pisanie | Writing | |
| Wzorcowe wypracowania z komentarzami | Model answers with comments | |
| Bank zwrotów | Phrase bank | |
| Ulubione | Favorites | |
| Trener pisania / mówienia | Writing trainer / Speaking trainer | |
| Egzaminator czyta | Examiner reads aloud | |
| Nagraj / Zatrzymaj | Record / Stop | |
| Samoocena | Self-assessment | |
| Moje egzaminy | My exams | |
| W trakcie pracy | Coming soon | exams and levels |
| Profil / Dodaj profil | Profile / Add profile | |
| Utwórz profil… | Create a profile… | guest-mode dialog |
| Ustawienia nauki | Learning settings | |
| Dane: Eksportuj / Importuj / Resetuj | Data: Export / Import / Reset | |
| Motyw: Automatycznie / Jasny / Ciemny | Theme: Auto / Light / Dark | |
| Przypnij panel | Pin sidebar | |
| Typowe błędy Polaków | Common mistakes | |
| Życie i egzamin | Real life vs exam | postponed (D13) |
| Na tej stronie | On this page | |
| Drukuj | Print | |
| Zgłoś błąd (new) | Report a mistake | E12 |

Exercise type names: `multiple-choice` Multiple choice · `reorder` Put in order · `find-error` Find the mistake · `short-answer` Short answer · `gap-fill` Fill the gaps · `match` Match pairs · `transformation` Rewrite the sentence · `translate` Translate · `dictation` Dictation · `paradigm` Fill the table.

## 4. How it is done

1. Order: shared pieces first (`utils`, `ui`, `dialogs`, `profiles`, `data-menu`, `sidebar`, `render`, `app`), then feature groups, one commit per group.
2. For each file: translate strings with the glossary, translate comments, rename Polish identifiers that are part of a public name (`LM.niezbednik` → `LM.handbook`).
3. Do not change behaviour in this stage. Polish three-form plurals become `LM.plural`. Polish typography becomes English typography.
4. After each group: `npm test`, open the affected views in both themes at 390 px and 1280 px, check for clipped or wrapped buttons.
5. `tools/check-lang.js` (`npm run check:lang`) fails when code (`js/`, `css/`, `index.html`, `tools/`) contains: Polish diacritics `ąćęłńóśźż` (any case), Polish quotes `„ ”`, a word from a stop list of frequent Polish UI words (Dodaj, Zapisz, Anuluj, Usuń, Dalej, Wróć, Wynik, Poziom, Zadanie, Pokaż, Ukryj, Umiem, Dziś, Szlak, Fiszki, Zestaw, Błąd, Powtórka, Egzamin), the locale codes `en-GB` / `en-US` in speech code, or Spanish letters and locale codes outside `js/lang.js` and `js/config.js`. Whitelist file for false positives.
6. Final pass: list all string literals shown to the user (a small script `tools/extract-strings.js` helps), read the list once for consistency with the glossary (one term per concept), fix.
