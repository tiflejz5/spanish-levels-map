# Spec 13 — QA and launch

## 1. QA matrix

| Area | Check |
|---|---|
| Run modes | `file://` (double-click `index.html`), local http server, GitHub Pages path `/spanish-levels-map/` |
| Browsers | Chrome, Firefox, Safari (macOS and iOS), Chrome on Android, Edge |
| Widths | 320, 360, 390, 768, 1024, 1280 px; no horizontal scroll; sidebar rail / drawer |
| Themes | light, dark, auto; accent; contrast script green |
| Input | keyboard only, touch, character bar, `Alt` + letter |
| Speech | with a Spanish voice; without one; voice variant switch |
| Accessibility | `lang` attributes on Spanish text; names match visible text; focus visible; targets ≥ 44 px; `prefers-reduced-motion`; heading order |
| Storage | new profile; guest mode; export → reset → import round trip; a file from another app refused; data of the owner's other apps on the same origin (`elm_*`) untouched and ignored; storage blocked (private mode) shows the warning and works until the tab closes |
| Flows | first run → placement → trail → stop → quiz → checkpoint; level page → topic → set → mistakes logged → review session; final test pass and fail; My words from a selection; notes; search; print topic and cheat sheet |
| Levels "soon" | E1 behaviour in sidebar, level page, trail, Today, search, placement result |
| Performance | first view under 1 s on a warm cache; lab under 500 ms; no data file over 400 kB loaded at start |
| Regression | `npm test`, `npm run validate`, `npm run check:lang`, `npm run e2e` |

## 2. Stage summaries

Every stage ends with: what changed, numbers (tests, files), the screenshots listed in the prompt, known gaps, questions for the owner. Then stop.

## 3. Launch checklist (stage L)

1. A1 complete (spec 10 §7); other levels "soon".
2. Placement pool complete (60 questions).
3. Home page and README in English.
4. `LICENSE`: the owner decides (suggestion: MIT for code, CC BY-NC-SA 4.0 for content). Third-party notices: Fraunces, Inter (OFL), Lucide (ISC), GSAP (standard license).
5. Meta: title, description, Open Graph image, `theme-color`, favicons, `404.html`. `robots.txt`: **disallow indexing** until a native speaker has spot-checked the published levels (D14); switch to allow when the owner says so.6. GitHub Pages from `main` root; open the URL with a hard reload; confirm that `?v=` changed.
7. Privacy sentence on the home page ("No accounts, no tracking; progress is stored only in this browser").
8. Report link works without a GitHub account (`reportMail` set).
9. Scripted content check: every quiz and set answered from its key scores 100%.
10. Tag `v0.1.0`.

## 4. After launch

Each confirmed content error becomes (a) a fix, (b) if it is a pattern, a new line in the proofreader notes (spec 08) or a new validator rule.
