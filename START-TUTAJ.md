# Spanish Levels Map – zacznij tutaj

Paczka dla Claude Code (Opus 5.5) do zbudowania **osobnej aplikacji** do nauki hiszpańskiego, z objaśnieniami po angielsku, w tym samym zamyśle co Twoja `english-levels-map`. Osobne repozytorium, osobny adres, osobne dane.

**Dla kogo:** dla Ciebie. Uczysz się hiszpańskiego po angielsku, więc ćwiczysz dwa języki naraz. Dlatego w aplikacji nie ma ani słowa po polsku, objaśnienia są pisane naturalnym, jasnym angielskim, a zadania tłumaczeniowe idą z angielskiego na hiszpański.

## Co jest w paczce

| Plik | Po co |
|---|---|
| `START-TUTAJ.md` | ten plik |
| `CLAUDE.md` | stałe zasady projektu; Claude Code czyta go sam w każdej sesji |
| `docs/plan/00-READ-ME.md` | zasady i tabela etapów |
| `docs/plan/PROMPTS.md` | **prompty do wklejania**, etap po etapie (opisy po polsku) |
| `docs/plan/spec/` | specyfikacje: decyzje, architektura, mapa portu plik po pliku, język interfejsu, warstwa językowa, zmiany w silniku, model treści, decyzje językowe, przenośność silnika, produkcja treści, marka, egzaminy, QA |
| `docs/plan/syllabus.json` | pełny sylabus A1–C2: 130 tematów w poziomach i jednostkach (z niego powstaje też Szlak) |
| `docs/plan/examples/` | wzorce jakości: strona tematu, quiz, zestaw zadań, fiszki, karta laboratorium, pytania testu poziomu |
| `docs/plan/scripts/validate_plan.py` | walidator sylabusa i treści |

## Najważniejsze decyzje

Pełna lista: `docs/plan/spec/01-product-and-decisions.md`.

1. **Port Twojego kodu, nie pisanie od zera.** Opus kopiuje pliki oryginału i je dostosowuje; testy logiki muszą dalej przechodzić.
2. **Interfejs po angielsku**, wpisany wprost w kod (bez warstwy tłumaczeń).
3. **Własne klucze localStorage z prefiksem `slm.`** Na GitHub Pages wszystkie Twoje aplikacje mają ten sam adres bazowy, więc bez tego nadpisywałyby sobie dane.
4. **Akcenty się liczą**, ale odpowiedź różniąca się tylko akcentem dostaje osobną podpowiedź, a pod każdym polem jest pasek znaków (á é í ó ú ü ñ ¿ ¡).
5. **Nowy typ zadania „Fill the table”** do odmiany czasowników.
6. **Tense & Mood Lab** zamiast Laboratorium czasów: siatka czas × tryb, karty kontrastów (ser / estar, por / para), drzewka decyzji.
7. **Hiszpański międzynarodowy:** vosotros pokazane i oznaczone „Spain”, formy ustedes zawsze akceptowane, warianty słownictwa akceptowane; głos do wyboru Spain / Latin America.
8. **Egzaminy (DELE) na końcu i najpierw badanie oficjalnych źródeł**, bo format zmieniał się w latach 2025–2026.
9. **Poziomy bez treści widać jako „coming soon”**, więc uczysz się A1, gdy tylko jest gotowe, a kolejne poziomy dochodzą.

## Jak zacząć

1. Załóż na GitHubie puste repozytorium `spanish-levels-map`.
2. Sklonuj je i rozpakuj do niego tę paczkę (`CLAUDE.md` i folder `docs/` w głównym katalogu).
3. Commit „Plan: specs, syllabus, examples, prompts” i push.
4. Otwórz Claude Code w tym folderze, model Opus 5.5.
5. Wklej **PROMPT 0** z `docs/plan/PROMPTS.md`.

Dalej zawsze tak samo: prompt → Opus pracuje i się zatrzymuje → oglądasz → **PROMPT OK** albo **PROMPT POPRAWKI**.

## Skala

| Faza | Prompty | Sesje (orientacyjnie) |
|---|---|---|
| Silnik | 0, 1A, 1B, 2, 3, 4, 5, 6, 7 | 9 |
| A1 | C (2–3 razy), X | 3–4 |
| Publikacja | L | 1 |
| Każdy kolejny poziom | C + X | 3–4 |
| Egzamin | E1, E2 | 2 |

Do działającej aplikacji z całym A1: około 13–14 sesji.

## Na co uważać

- **Poprawność hiszpańskiego to główne ryzyko, a Ty jej nie ocenisz, bo dopiero się uczysz.** Plan ma dwa niezależne przeglądy każdej partii (subagent rozwiązujący zadania bez klucza i subagent „native speaker”), walidatory i listę zdań, których Opus nie jest pewien. Nie mogę zagwarantować, że treści będą bezbłędne. Zanim pokażesz aplikację innym, daj kilka stron z każdego poziomu do sprawdzenia komuś, kto zna hiszpański; do tego czasu plan blokuje indeksowanie przez wyszukiwarki.
- **Kalibracja po pierwszej jednostce każdego poziomu:** oceń jako uczeń, czy wyjaśnienia są jasne i czy angielski jest na dobrym dla Ciebie poziomie. Uwagi obowiązują potem we wszystkich treściach.
- **Nie zmieniaj identyfikatorów w sylabusie** po starcie treści (są kluczami postępu). Tytuły możesz zmieniać.

## Co możesz zmienić przed PROMPT 0

| Temat | Co przyjąłem | Gdzie |
|---|---|---|
| Nazwa | Spanish Levels Map, repo `spanish-levels-map` | spec 02, 11 |
| Angielski interfejsu | amerykański | spec 04 |
| Kolor akcentu | #b4481f (terracotta) | spec 11 |
| Zakres sylabusa | 130 tematów | `docs/plan/syllabus.json` (potem uruchom walidator) |
| Licencja | do Twojej decyzji przy publikacji | spec 13 |

## Sprawdzenie paczki

```
python3 docs/plan/scripts/validate_plan.py docs/plan
```

Powinno wypisać `130 topics` i `0 error(s), 0 warning(s)`.
