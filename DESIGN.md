# DESIGN.md — Spanish Levels Map

The single source of truth for how the interface looks and behaves. Every visual change updates this file in the same stage. Specs: `docs/plan/spec/11-design-and-branding.md` (brand), `04-ui-language.md` (texts), `06-engine-changes.md` (features).

The design system is inherited from `english-levels-map` and kept language-neutral: everything that is about Spanish lives in `js/lang.js`, `js/config.js` and `content/` (spec 09).

---

## 1. Direction: a travel map with editorial typography

- **Metaphor.** Learning is a journey across a map from A1 to C2. Levels are *lands* with their own colors, progress is a *trail*. The brand gradient runs through the land colors from A1 to C2.
- **Mood.** Calm, warm and grown-up, with a hint of adventure; neither childish nor corporate. Paper of an old atlas (cream, ink) by day, a map at night (deep navy) in the dark theme.
- **Typography.** Headings, level codes and big numbers in a display serif with character (Fraunces, variable optical size). Body text in a readable sans (Inter).
- **Color carries meaning.** A land color appears where the level matters: dot, bar, level card, the "I know this" stamp. The interface chrome (buttons, links, borders) is ink plus **one accent**, terracotta.
- **Gamification only at milestones.** Otherwise the app is quiet.
- **Avoid.** White cards with grey borders as the only means of expression, meaningless rainbows, heavy effects (WebGL, particles), smooth-scroll libraries, the "SaaS dashboard" template.

## 2. Tokens

All values are CSS custom properties at the top of `css/style.css`. The theme is `data-theme="light" | "dark"` on `<html>` (inline script in `<head>`, then `js/theme.js`; preference `slm.theme`: auto / light / dark). Outside the token blocks there are **no hard-coded colors**. Checks: `npm run contrast` and the audit in section 8.

### 2.1 Surfaces, text, lines

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#faf6ee` | `#0e1526` | page background |
| `--surface` | `#fffdf9` | `#151e33` | cards, fields, menus |
| `--surface-2` | `#f3ede0` | `#1c2742` | sidebar, soft fills |
| `--surface-3` | `#e9e1cf` | `#263352` | tracks, chips |
| `--surface-raised` | `#fffefb` | `#19233b` | raised card (hover) |
| `--ink` | `#1d2433` | `#eaf0fa` | main text |
| `--ink-muted` | `#545d6e` | `#a3aec2` | secondary text (≥ 4.5:1 also on `surface-2/3`) |
| `--ink-faint` | `#69707f` | `#8792a8` | placeholders |
| `--line` | `#e6dfcf` | `#27334f` | decorative lines |
| `--line-strong` | `#d4c9b2` | `#34426a` | stronger borders (secondary button) |
| `--line-control` | `#8c8471` | `#6d7a99` | borders of fields and controls (≥ 3:1) |

### 2.2 Accent and states

- **Accent** (spec 11 §2): one color for links, primary buttons, the focus ring and the wordmark.

  | Token | Light | Dark |
  |---|---|---|
  | `--accent` | `#7e3a0c` (terracotta) | `#f6ae84` |
  | `--accent-bg` (primary button) | `#7e3a0c` | `#f6ae84` |
  | `--accent-hover` | `#5e2b08` | `#fbd0b5` |
  | `--on-accent` (text on accent, success and danger fills) | `#fffdf9` | `#0e1526` |
  | `--accent-soft` | accent at 10% | accent at 14% |
  | `--focus-color` / `--focus-ring` | accent / 3 px at 40% | accent / 3 px at 55% |

  The spec's start values (`#b4481f` / `#f0a070`) sat too close to B2 raspberry and C1 orange (normal-vision ΔE 11.1 and 12.8, below the floor of 15). The hue stayed; the lightness moved until the categorical palette validator (skill `dataviz`, `--pairs all` with B2 and C1) passed: light `#7e3a0c` passes every check (CVD ΔE 11.5, normal-vision ΔE 15.6, contrast 7.8:1 on `--bg`); dark `#f6ae84` passes separation (CVD ΔE 15.5, normal ΔE 16.5) and contrast (9.8:1). The dark accent sits above the validator's lightness band for chart marks (L 0.78 > 0.67): a text color must be that light to reach 4.5:1 on navy, so the band does not apply to it.
- On a level page and its topic pages (`.view.lvl-XX`) `--accent`, `--accent-soft`, `--focus-color` and `--focus-ring` take the land color; the primary button keeps the terracotta fill.
- States `--success`, `--warning`, `--danger` (with `-soft`, `-border`, `-fill`, `-bg`) are **reserved**: never level colors, always with an icon or a word.
- `--info-bg` / `--info-border` (blue tint): info boxes and tips. Not an accent.

### 2.3 Lands (levels A1–C2)

Each level has four tokens per theme:

| Token | Use |
|---|---|
| `--lvl-xx` | main color (dot, bar, fill) |
| `--lvl-xx-soft` | background / bar track |
| `--lvl-xx-ink` | text on `-soft` (≥ 4.5:1, in practice > 8:1) |
| `--lvl-xx-glow` | glow (dark theme, highlights) |

| Level | Land | Hue | Light | Dark |
|---|---|---|---|---|
| A1 | Meadow | green | `#0e9a3f` | `#0e9a3f` |
| A2 | Forest | blue | `#0991ed` | `#1a97f4` |
| B1 | Hills | violet | `#6133a2` | `#7d52c3` |
| B2 | Lake | raspberry | `#b13065` | `#be3d70` |
| C1 | Mountains | orange | `#e06d00` | `#e06d00` |
| C2 | Summit | teal | `#06999a` | `#12a7a7` |

- `.lvl-A1` … `.lvl-C2` set the context variables `--lvl`, `--lvl-soft`, `--lvl-ink`, `--lvl-glow`; components use only those.
- **The palette is computed, not chosen by eye.** The categorical palette validator (skill `dataviz`) on `#fffdf9`/`#faf6ee` and `#151e33`/`#0e1526`: lightness in band, chroma ≥ 0.10, adjacent pairs under protanopia and deuteranopia ΔE ≥ 11.6 (target 8), normal vision ΔE ≥ 17.6 (floor 15), mark contrast ≥ 3:1.
- In the dark theme `-soft` is mixed with `--bg`, not with the card, so the B1 bar keeps ≥ 3:1 on its track.
- **A level is never shown by color alone**: the code (A1…C2) or the land name always goes with it.
- Changing a level color means running the validator and `npm run contrast` again.
- Land symbols: `assets/lands.js` (`LM.ui.LANDS`), same symbols and colors as the original.

### 2.4 Brand gradient

`--brand-gradient`: linear through `--lvl-a1` → `--lvl-c2`. Used **sparingly**: the logo mark (as an SVG gradient of the same tokens), the progress ring of the whole map, a single milestone accent. Never as a text color or a section background.

### 2.5 Typography

| Token | Value |
|---|---|
| `--font-display` | `"Fraunces Variable"`, fallback Iowan / Palatino / Georgia |
| `--font` | `"Inter Variable"`, fallback system fonts |
| `--font-mono` | system monospace |

- **Fluid scale (`clamp`):** `--fs-xs` 12 px, `--fs-sm` 14, `--fs-md` 16, `--fs-lg` 18; `--fs-xl` 20–24 (section), `--fs-2xl` 26–36 (page title), `--fs-3xl` 36–56, `--fs-4xl` 44–72 (level code, score).
- Big headings: `--tracking-display` (−0.02 em), `--lh-tight`. Upper-case labels: `--tracking-caps` (0.08 em).
- Reading width: `--measure` 70ch. Numbers in stats and counters: `tabular-nums` (`.num`).
- Fraunces weight 560–650 in headings, `font-optical-sizing: auto`.
- **Files:** self-hosted in `assets/fonts/`, subsets `latin` and `latin-ext`, `font-display: swap`. The `latin` subsets already contain á é í ó ú ü ñ ¿ ¡ (spec 11 §5). Preload (http(s) only): Inter latin and latin-ext, Fraunces latin.

### 2.6 Spacing, radii, shadows

- Spacing: `--space-1` … `--space-8` (4, 8, 12, 16, 24, 32, 48, 64 px).
- Radii: `--radius-xs` 6, `--radius-sm` 10, `--radius` 14, `--radius-lg` 20, `--radius-xl` 28, `--radius-pill`.
- Widths: `--w-text` 720 px (reading column, left-aligned), `--w-wide` 1000 px (container of every view). The left edge of the h1 is the same on every screen.
- Buttons: `.btn` has `--radius-sm`; the pill is only for chips, filters and switches. Levels: `.btn-primary` (one per view), `.btn-secondary` (outline), `.btn-link`. Breadcrumbs and back links are `.crumb`.
- Layered shadows `--shadow-sm`, `--shadow`, `--shadow-hover`, `--shadow-lg`: warm and very soft in light, deep with a subtle edge in dark.

### 2.7 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120 ms | hover, color |
| `--dur-base` | 200 ms | appear, menus |
| `--dur-slow` | 320 ms | progress bars and rings |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | default |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | "snaps" (the I know this stamp) |

### 2.8 Other tokens

- `--selection`, `--scrollbar`, `--scrollbar-hover`.
- `--topo-color`, `--topo-opacity`, `--topo-mask`: the contour pattern (only on the trail).
- `--topbar-h`: height of the top bar (sticky elements sit under it).
- `--cat-*`: mistake-log category bars (≥ 3:1 to the card).
- `--tense-past`, `--tense-present`, `--tense-future`: the Lab's column tones (section 3.17).
- `--exam-accent`, `--exam-accent-2`: set per exam from the registry (section 3.10).

## 3. Components

| Component | Class / function | Rules |
|---|---|---|
| Card | `.card` (+ `.is-interactive`) | `--surface` on `--bg`, border `--line`, `--shadow-sm`. In a level context the border mixes in the land color. Clickable cards lift (`translateY(-2px)` + `--shadow-hover`) without moving the layout. |
| Button | `.btn-primary`, `.btn-secondary`, `.btn-link`, `.btn-danger`, `.btn-danger-solid`, `.btn-small` | Primary: terracotta fill, `--on-accent` text. Secondary: `--surface` with `--line-strong`. Link: accent text, underline on hover / focus. Press: `scale(.98)`. ≥ 44 px on touch. |
| I know this | `.known-check` (+ `.known-check-lg`) | A round stamp in the land color when ticked; the "bounce" (scale 1.25 → 1, rotate −10° → −6°, 220 ms) only when the user ticks it. Outside a level: success colors. |
| Chip | `.chip` (+ `.is-level`, `.is-soon`, `.is-available`) | Small pill `--surface-3` / `--ink-muted`; in a level context `--lvl-soft` / `--lvl-ink`; "soon" in `--warning-soft` / `--warning`. |
| Tooltip | `[data-tooltip]` | Pure CSS on hover **and** focus-visible. The text is also in `aria-label` (the tooltip is visual only). |
| Progress bar | `.progress` > `.progress-fill` | `transform: scaleX` (`--dur-slow`), color `--lvl` or `--brand-gradient` (`.is-brand`), track `--lvl-soft`. |
| Progress ring | `LM.ui.progressRing(percent, opts)` | SVG arc via `stroke-dashoffset`, level color or brand gradient, number in the middle, `role="progressbar"`. |
| Icon | `LM.icon(name)`, `<span data-icon="name">` | Lucide, 1.75 px stroke, `currentColor`, `aria-hidden` by default, built with `createElementNS` (no innerHTML). Only the icons listed in `tools/build-assets.js` exist. |
| Logo | `LM.logo()`, `[data-logo]`, `assets/favicon.svg`, `assets/favicon-180.png` | The map mark: a circle and the north of the needle in the level gradient (`--lvl-a1` … `--lvl-c2`, per-instance SVG gradient), a dotted trail and the south needle in ink. **Wordmark** in Fraunces: the language name (`LM.APP.language`, "Spanish") in `--accent`, the rest ("Levels Map") in `--ink`. No flag. The favicon is the mark on an ink tile; its PNG is rendered from the SVG. |
| Focus | `:focus-visible` | 2 px outline in `--focus-color`, 2 px offset, on every background. |
| Breadcrumbs | `LM.ui.breadcrumbs([...])` | `<nav aria-label="Breadcrumbs"><ol>`, last item `aria-current="page"`, "›" from CSS. Under 640 px only "‹ parent". Targets ≥ 44 px. |
| Empty state | `LM.ui.emptyState({ art, title, text, action })` | Small illustration in tokens, one sentence, one action. |
| Toast | `LM.ui.toast` | Dark card `--inverse-bg` at the bottom, `role="status"`, 5 s, paused on hover and focus, action button underlined. |
| Switch | `role="switch"` | Track 40 × 24 px, on in `--success-fill`. |

### 3.1 Sidebar

Files: `index.html` (markup), `js/sidebar.js` (behavior), `js/render.js` (tools and levels); "SIDEBAR" section of `css/style.css`.

- **Order:** logo, expand button, tagline ("Your map of Spanish, A1–C2" from `LM.APP.tagline`), tools — Trail, Today, Review (one badge = `LM.reviewQueue.count()`), Practice, Tense & Mood Lab, Writing — then the six levels, then "My exams" (hidden while the exam registry is empty), the pin.
- **Level items:** a 36 px circle with the land symbol and a progress ring in the land color; expanded: "A1 · Meadow" and "N / M known" with a bar. A "soon" level shows the text label "soon" under its name (never color alone). Passed final test: `--lvl-soft` fill and the ✓ stamp (`LM.ui.stamp`). Current land: 2 px ring in the land color and "Current land" in `aria-label`.
- **States:**

  | State | When | Look |
  |---|---|---|
  | Rail | default from 768 px | `--rail-w` 72 px: the mark, expand button, tool icons, six level circles, pin. |
  | Expanded | hover (fine pointer), keyboard focus, the expand button | `--panel-w` 288 px, `position: fixed` **over** the content with `--shadow-lg`; the content does not move. |
  | Pinned | the pin | full panel, no shadow; the content moves (`html[data-sidebar="pinned"] .main { margin-left: --panel-w }`). |
  | Drawer | under 768 px | "Menu" button in the top bar; the panel slides over a dimmed backdrop; tap outside closes. |
- **Behavior:** hover opens after 120 ms and closes 250 ms after leaving; keyboard focus expands and losing it collapses (unless pinned); Esc collapses. Pin: `aria-pressed`, labels "Pin sidebar" / "Unpin sidebar". The pinned state is `slm.sidebar` = `{ version: 1, pinned }` (device-wide, read by the `<head>` script, not in the backup).
- **Accessibility:** labels in the rail are hidden by `opacity` (they stay in the DOM); level items have a full `aria-label` ("Level A1, Meadow: 9 of 26 known (35%)") and the ring is decoration; the active item has `aria-current="page"`; every target ≥ 44 px.
- **Motion:** width in `--dur-base`, labels fade in after 60 ms; rings and bars update in place (`LM.ui.setRing`); instant with reduced motion.

### 3.2 Today (`#/today`, `js/today.js`)

- **Order** (`.today-stack`, `--w-wide`): the map card, the "Flashcards and mistakes" card, a row with Streak | my nearest exam (mini cover) or, without exams, Shortcuts (placement test, stats). One column under 800 px.
- **Map card:** date and "land **A1 · Meadow**" (`--lvl-ink`) above the greeting h1; at the right "Map travelled" with a percentage (Fraunces) and a bar of six segments, one per land, filled proportionally, `role="img"` with a text summary. The percentage is `LM.learn.mapProgress` over **available** levels only (E1). Below, the topographic trail (`LM.today.compactTrail`): each land a `--lvl-x-soft` blob with `--lvl-x` contours, stations with the land symbol, "A1 · Meadow" and a percentage; travelled part solid, the rest dotted; vertical under 480 px; a "soon" land is dimmed with "soon". Footer: "Next stop in Meadow: …" and "Continue on the trail ›".
- **Review card** (`LM.review.todayCard`): the count, three rows (flashcards, mistakes, weak spots; each row marker has its own shape, not only color), "Review now", links Decks · My mistakes · + Add mistake. At zero: one line "Done for today. Next: tomorrow (6)."
- **Streak:** "Streak · 6 days", seven dots for the last days (18 px, today ringed, text for screen readers).
- **Motion:** cards enter with GSAP (`LM.motion`), skipped with reduced motion.

### 3.3 Celebrations (`js/celebrate.js`)

- Milestones: first "I know this", 10 / 25 / 50 / 100 ticks; a level at 25 / 50 / 75 / 100 %; streak 3 / 7 / 14 / 30 days; first review session; placement test done; final test passed.
- Shown once per profile (`slm.celebrated`, in the backup). A profile with existing progress gets its reached milestones recorded silently at start.
- Form: a toast card at the bottom with the land circle and its ring animated from the previous step to the new one (CSS ≤ 600 ms), the stamp for a passed final test; title in Fraunces and one sentence; 2.8 s, paused on hover, Esc closes; `role="status"`; at most two at once. No confetti. Reduced motion: the final state at once.

### 3.4 Level pages and "soon" states (spec 06 E1)

- **Header:** "A1 · Meadow" (land name from `LM.ui.LANDS`), the big level code (`--fs-4xl`, `--lvl-ink`), the goal, the ring of the whole level; background `linear-gradient(--lvl-soft → --surface)`.
- **Topics** are grouped by syllabus category (order of first appearance). A row (`.ess-item`): "I know this" 44 px at the left, the title, the set label ("set 8/10", a land-colored dot at ≥ 80 %) and a chevron. A topic of an available level without a page shows "being written".
- **Level "soon"** (`content/levels.json`):
  - sidebar: "soon" label under the name;
  - level page: "B1 is on its way. The topics below are what it will cover." and the planned topics from the syllabus — titles and examples, no links, no checkboxes; no final-test or cheat-sheet cards;
  - trail: the land dimmed with a "Coming soon" chip (`.chip.is-soon`);
  - home: the "Status" column of "Levels at a glance" follows `levels.json` (`available` / `coming soon` chips), whatever the Markdown says;
  - Today: progress counts available levels only;
  - search: does not index it; placement: may return it and says where the trail really starts.
- **Home** (`content/home.md`): rows of "Levels at a glance" link to the level, with a land-colored bar and hover; the compact trail sits above the table. Footer `.home-foot`: privacy sentence, "Version N · Source code", the report link.

### 3.5 Placement test and final tests

- One question per screen, progress dots with ✓ / ✗ (not color only); after an answer the letter becomes ✓ / ✗ with "Correct" / "Your answer".
- Result: the big level code (`clamp` up to 6.5 rem, land color) with a GSAP "pop" (none with reduced motion), always "approximate" and "not an official test".
- Final test (`#/<level>/test`): start card with the question count, pass mark and minutes from the pool; Exam mode; result with the stamp.

### 3.6 Topic pages and callouts

- Paragraphs and lists at most `--measure`; H1–H3 in Fraunces (`--fs-2xl` / `--fs-xl` / `--fs-lg`); list markers in the level color; `--lh-body`.
- **Callouts** (`js/callouts.js`) are found by the **heading text** (`## H2` or a bold subhead); the `.md` files stay plain. Rules in `CALLOUT_RULES`, first match wins:

  | Heading starts with | Class | Icon | Look |
  |---|---|---|---|
  | `LM.APP.mistakesHeading` ("Common mistakes"), "The most common trap", "Watch out" | `callout-trap` | `triangle-alert` | amber `--warning-soft`, list markers in `--warning` |
  | "Real life vs exam" | `callout-real-exam` | `arrow-left-right` | `--info-bg`, 4 px accent bar; under 640 px each row becomes a card |
  | "Key ideas", "What you can do at this level" | `callout-key` | `sparkles` | `--lvl-soft` |
  | "What next" | `callout-next` | `map-pin` | dashed border, links as pill buttons |
  | "Examples", "Key phrases", "Word partners" | `callout-examples` | `list-checks` | level bar at the left, target-language text in `--lvl-ink` |

  New callout: add a rule to `CALLOUT_RULES`, CSS `.callout-<name>` with tokens only, the icon to `tools/build-assets.js` (`npm run assets`), new color pairs to `tools/contrast.js`.
- **Tables:** `.md-table` with `--radius`, zebra rows, header `--surface-2`; they scroll inside their frame with edge shadows (`.has-left` / `.has-right`); a scrolling table is a named region with `tabindex="0"`.
- **`[[id]]` links:** `.wiki-chip`, a pill in the target page's level color with `notebook-text` and the level code.
- **Navigation:** breadcrumbs ("Level A1 › Verbs › gustar…"), "‹ Previous" / "Next topic ›" at the end (`[` and `]`), a table of contents for pages with ≥ 4 `##` sections (sticky at the right from 1200 px with scrollspy, else "On this page" `<details>`; hidden in print). Under 760 px the page head with "I know this" is sticky.
- **Practice section** at the end (`LM.exercises.topicSection`): set cards and, when the topic has one, a link to its Lab entry ("See it on the timeline: …" or "Contrast card in the Lab: …").

### 3.7 Exercises (`js/exercise-engine.js`)

- **Item card** (`.ex-card`): progress dots above, the type in upper case, the prompt in Fraunces.
- **Multiple choice:** native radios in `role="radiogroup"`, the whole 48 px label is the target; number 1–4 in a circle; chosen `--accent-soft`; right ✓ "Correct", wrong ✗ "Your answer". A `___` gap is a line, filled green or red with strike-through after checking (always with an icon).
- **Put in order:** tiles are 44 px buttons (tap to place), the answer line a dashed frame; after a mistake the first tile that differs has ✗ on `--danger-soft`. Opening ¿ ¡ and the end mark are never tiles: they frame the answer line (`.ex-line-frame`, `aria-hidden`; the hidden prompt says "It is a question."). The first tile keeps its capital only when it is a name.
- **Find the mistake:** words are `aria-pressed` buttons, the chosen one underlined in `--accent`; after checking the wrong part has `--warning-soft`, a wrongly chosen part a red line.
- **Fill the table** (`paradigm`, `.ex-para`): lemma in bold with `lang` and the English gloss, a two-column grid (label | field) with `display: contents` rows so Tab goes down; one column under 480 px; given cells read-only with a dashed border and "example", outside the tab order; per-cell ✓ / ✗ and the right form next to a wrong one; near-miss hints per cell.
- **Feedback** in `role="status"`: verdict, model answer, explanation, "Watch out" box in amber; card snap (`ex-pop`) or a short shake (`ex-shake`), CSS only, off with reduced motion.
- **Phone:** "Check / Next" sticky at the bottom of the card (`--sticky-bg`).
- **Result:** points ("12/14 points") in Fraunces `--fs-4xl`, a comment by percentage, "To fix" list; in a mixed session accuracy per topic. A session started with its own back link (a Lab contrast quiz) shows that link among the actions.
- **Set cards** (`.ex-set-card`): level bar on top, best and last score, "Start". Same look in "Check yourself", Practice and the Lab.
- **Shortcuts** (`js/shortcuts.js`): 1–4 / A–D choose, Enter checks, **S** reads the sentence (`LM.speech`), **?** opens the shortcut panel. Not in text fields (except Enter).

### 3.8 Stats (`#/stats`)

- Charts follow the `dataviz` skill, no library: number tiles, horizontal accuracy bars (track `--lvl-soft`, fill `--lvl`, 4 px round end), trend columns (≤ 24 px, rounded top), an activity map (12 × 7 cells of 16 px).
- Color is an addition: topic bars carry the level code; values and labels in text colors. Under 5 answers: "not enough data" instead of a percentage; a column with < 5 answers is lighter; `n=` under each column.
- Trend columns are focusable with `aria-label` and a table in `<details>`; the activity map is `role="img"` with a text summary. No rankings.

### 3.9 Search and notes

- **Search** (`/`): a card at the top center (`min(720px, 100vw − 32px)`), full width on a phone, slides in 180 ms (none with reduced motion). Results grouped (Pages, Exams, Practice, Tense & Mood Lab, My notes, My mistake log); the active option has `--accent-soft` and an accent bar; matches highlighted with `<mark>` built by splitting text (no HTML). Folding with `LM.lang.fold`, highlighting keeps the accented original.
- **Notes:** the "Notes" button in a page head (a dot when a note exists); panel at the right (400 px) or a bottom drawer (up to 70 % height) on a phone; status and counter (from 80 % of the limit, `--danger` at the limit). Keys: topic id, `lab:<id>`, `set:<id>`, `<exam>:<page>`.

### 3.10 Exams (generic module, spec 06 E8)

- Routes `#/exams/<id>[/…]` from the registry (`data/exams-registry.js`). Until stage E the registry is empty and the sidebar group is hidden; the fixture `tools/fixtures/exam-demo/` keeps the code under test.
- Each exam sets `html[data-section="<id>"]` and `--exam-accent` / `--exam-accent-2` from the registry (no per-exam token blocks). Sidebar chip: the code on the exam color with a bottom bar in the second color; "soon" exams in `--surface-3` with "soon".
- Covers (`LM.examCover`): full, compact and mini (`tools/contrast.js` checks the registry colors). Date card (`LM.examDate.card`): big day count or a state, date field, US date format.
- Engine: reading text sticky next to the items on wide screens, folded block on narrow ones; listening panel with "Play" and "Plays: n/2".
- Writing and speaking trainers: big timer (Fraunces), word counter with zones that always pair color with text; while a visible timer runs `html.focus-mode` dims the rest to 30 % (back to 100 % on hover / focus).

### 3.11 Writing (`#/writing`)

- Models with margin comments (`.wz-*`): anchors with a 16 % tint of the comment type and an underline (type also by icon and label); from 1024 px comments sit in the right margin joined by a thin SVG line, narrower they fold under the paragraph; type filters with `aria-pressed`. Print: comments as footnotes.
- Phrase bank (`.zw-*`): group list sticky at the left from 900 px or a chip bar; favorites star with text and `aria-pressed`; the phrase panel in the writing trainer at the side from 900 px, a bottom sheet on a phone.

### 3.12 Flashcards and mistakes (`#/review`)

- Header `pageHead` ("Learn", "Review", chip "N due"), tabs `role="tablist"` (`.pw-tabs`; arrows, Home, End): Today, Decks, My mistakes, My words. The tab is in the address.
- **Today card** (`LM.review.card`): the count (Fraunces), "due · about N min", three rows (deck cards, mistakes, weak spots; markers square / circle / diamond), "Review now", "Short session (10)" from 11 items.
- **Session** `#/review/session`: one progress bar; items in their own views — flashcard (grades 1–4), mistake (card of the "My mistakes" deck), task (engine view via `startSingle`; right = Good, wrong = Again). Filters `?only=mistakes|weak|decks|deck:<id>`, `&max=10`. Summary: count, % Good or Easy, time, due tomorrow, hardest items; ≥ 5 items count as a study day.
- **Flashcard back:** listen button at the top right (hidden without a voice), "Report a mistake" at the bottom of built-in cards.
- **My mistakes:** state label from the card ("Due today", "Learning", "Review in N days", "Mastered" at ≥ 21 days, "Suspended"); category bar `--cat-*` with the category name in a chip; listen button next to the right answer; the context line by line with `lang` on target lines.
- **Decks by level** (`#/review/decks/topics/<level>`): level chips only for levels with built-in decks; vocabulary topics on a level page link there ("Flashcard decks: …", `layers` icon).
- **Selection menu** (`.fc-sel-menu`): a floating bar for selected text in `[data-fc-selectable]` areas ("Add to My words"), `position: fixed`, buttons ≥ 44 px, Esc closes.

### 3.13 Language layer (spec 05, 06 E3–E5)

- **Target-language markup** (`js/markdown.js`): `*italics*`, every cell of a table column headed with `LM.APP.language`, and quotes get `lang` = `LM.APP.targetLang`; a final English `(gloss)` is a separate `.md-gloss` span in `--ink-muted`, outside the `lang` span. English emphasis is `**bold**` only.
- **Listen buttons** (`.listen-btn`, `LM.markdown.listenButton`, `LM.speech`): 44 × 44 px round link button with `volume-2`, `aria-label` "Listen: …", tooltip "Listen". Where: one per row of an examples table (right of the target cell, which reserves 52 px), one per quote, Lab uses and examples (`.lab-say`), flashcard backs, the mistake log. `html[data-voice="none"]` hides every listen button. **S** reads the example whose button has the focus. Voice: `LM.APP.speech` voices, the variant from the settings ("Spain" / "Latin America").
- **Special-character bar** (`.charbar`, `js/charbar.js`, E3): keys from `LM.APP.chars` (á é í ó ú ü ñ ¿ ¡) under every input that expects target-language text (`data-charbar`). Keys 36 px (44 px with `pointer: coarse`), `--radius-xs`, `--line-control` border, `--surface` fill, `--focus-ring`. Mouse-down keeps the focus in the field; Shift or a 500 ms press gives the capital; **Alt + letter** cycles the marked forms (listed in the `?` panel). `aria-label` "Insert á". No motion with reduced motion.
- **Near-miss hints** (`.ex-near`, `.fc-result.is-near`): `--warning` text with `triangle-alert`: "Almost. Check the accents: **está**", "Right word, wrong ending: …", "Looks like a typo: …" (the answer in bold with `lang`). Lenient mode: verdict "Right!", the reminder stays with "(counted as right: you accept answers without accents)".
- **Learning settings** (profile menu): switches "Accept answers without accents" and "Auto-play the Spanish side of a flashcard"; a "Voice" radio group (`.menu-radio`, the chosen option has a filled dot); without a target voice a note replaces the group. Stats show lenient answers as a small separate number.

### 3.14 Trail (`#/trail`, `js/trail.js`)

- The topographic map of the six lands with one stop per topic and a checkpoint per unit (spec 06 E9). A "soon" land is dimmed with "Coming soon".
- **Stop sheet** (bottom sheet on a phone, dialog on desktop): the topic, "Read", "Check yourself (4 questions)", "Done" / "Skip"; the result of a quiz suggests "I know this" but never ticks it. Passing rules: quiz ≥ 3 of 4, "I know this", best set ≥ 80 % (when there is no quiz), or Skip.
- **Report a mistake** (`.report-link`, `LM.ui.reportLink`, E12): a quiet line in `--fs-sm`, `--ink-muted`, underlined link with the `flag` icon, 44 px high, accent on hover / focus. Last on a topic page, under quiz, checkpoint and set results, at the bottom of built-in flashcard backs. Opens the issue form with "<topic id>: " filled in; "by e-mail" when `LM.APP.reportMail` is set. Hidden in print.

### 3.15 Tense & Mood Lab (`#/lab`, spec 06 E7)

Nothing about the grid is fixed in code: `content/lab/` → `LM.LAB = { axes, cards, contrasts, trees }` (loaded on demand), pure logic in `js/lab-logic.js`, the timeline in `js/timeline.js` (`LM.timeline.draw / block`, reusable by another lab).

- **Tabs:** Map · Card · Contrasts · Decide · Compare (links with `aria-current`, each its own address; the bar scrolls inside itself on a phone, the page never does).
- **Column tones:** `.lab-tone-1/2/3` set `--tense` from `--tense-past / -present / -future` by **column position** (`LM.labLogic.toneOf`), ≥ 3:1 to card and page. The tone is only on the column line, the timeline and the side borders; tiles and cards keep the **level** color and code.

  | Token | Light | Dark |
  |---|---|---|
  | `--tense-past` | `#5b4bc4` | `#b3a8ff` |
  | `--tense-present` | `#2c55c4` | `#8db0ff` |
  | `--tense-future` | `#0e7682` | `#5fd3dc` |
- **Map** (`.lab-grid`): a real table — column headers from `axes.columns` (3 px toned underline), row headers from `axes.rows`, each cell a list of tiles (several cards per cell; an empty cell is a dashed "No card yet"). Under 760 px one block per row: the row label as a heading, then each cell with its column label (`data-label`, `::before`). Below: contrast cards and decision trees as tile grids.
- **Card:** head (level chip, "column · row", notes `lab:<id>`, the name with `lang`, the English name, summary), timeline with scene chips, **Form** as free rows (`formation: [{ label, text }]`), **Uses** cards (label, target line with a listen button, English), signal chips, Common mistakes, "Compare with…" (no Compare button when the other card is not in the Lab yet), related contrast cards, Practice.
- **Timeline** (SVG, `-1 … 0 … 1`): dashed "now" line; points, 12 px ranges with round caps, "since long ago" gradient (`open-left`), arrow into the future (`open-right`), repeats, the "result" diamond, a vertical reference marker; labels above the axis in rows without overlap (`LM.timeline.layoutLabels`); compact version (440 units) on a phone and in Compare so labels stay ≥ 12 px; GSAP DrawSVG on entry (final state at once with reduced motion); `role="img"` with the scene description, and the same description as text under the axis.
- **Contrast card** (`#/lab/contrast/<id>`, `.lab-sides`): two columns (one under 860 px) with a 4 px toned top border; rules with an optional label, text and examples (target + listen + English); optional tip on `--info-bg` with the `info` icon; Common mistakes; "Check yourself": the 4-item mini quiz runs in the exercise engine (Learn mode, back link to the card; wrong answers go to the mistake log).
- **Decide** (`#/lab/pick[/<tree id>]`): any number of trees; one opens directly, several show a list. Question, 56 px answers, the path above, focus moves to the new question. A result: "Use **<answer>**" (`lang`, on `--accent-soft`), why, the example in a quote box with a listen button, then the linked cards.
- **Compare:** selects list every card ("name (English name, level)"); compact timelines; Differences table with `data-label` cells and listen buttons.
- **Loading:** three skeleton bars until `data/lab.js` arrives; the data is prefetched on idle and on hovering a Lab link. The map renders about 50 ms after navigation (e2e checks < 500 ms).

## 4. Motion

- **Simple things in CSS** (hover, focus, appear, color): animate `opacity` and `transform`. Exception: a short color transition when the theme changes (`html.theme-anim`).
- **Times:** `--dur-fast` micro-interactions, `--dur-base` entries and menus, `--dur-slow` bars and rings; nothing longer than 400 ms except celebrations.
- **GSAP** (`assets/vendor/gsap.min.js` + DrawSVG and MotionPath, copied by `npm run assets`) loads **on demand** through `LM.motion.run(plugins, setup)`: it injects `<script>` (works from `file://`), runs `setup(gsap, reduce)` inside `gsap.matchMedia()` and reverts at the next animation and on every route change. Without GSAP or with reduced motion the final state shows at once. Used on Today, the placement result, celebrations and the Lab timeline.
- **No smooth scrolling** libraries, no WebGL or particle backgrounds.
- **`prefers-reduced-motion: reduce`:** a global rule shortens every animation and transition to 0.01 ms.

## 5. Accessibility

- **WCAG AA contrast:** text ≥ 4.5:1; components, field borders, bars and marks ≥ 3:1, both themes. `npm run contrast`: 312 checks (light, dark, registry exam colors). Level palette: the CVD validator (2.3); accent: 2.2.
- **Focus** visible everywhere: 2 px outline in the accent.
- **Targets** ≥ 44 × 44 px with `pointer: coarse`, in menus, switches and icon buttons.
- **Color is never the only signal:** levels have codes, states an icon or a word, results ✓ / ✗ plus text, "soon" is a word.
- **Language:** `<html lang="en">`; every target-language text has `lang` = `LM.APP.targetLang` (pages, items, options, answers, flashcards, the mistake log, the Lab).
- **Accessible name = visible text** (WCAG 2.5.3); extra context in `.visually-hidden`.
- **Links in text** are underlined, not only colored.
- **Keyboard:** everything works with the keyboard; menus and dialogs have Esc, arrows and focus return. Headings in order (one h1 per view).

## 6. Microcopy (spec 04)

- **American English, plain and short**, B1-readable: no idioms, no culture-bound jokes. Second person, warm and matter-of-fact: "Save it now – it comes back tomorrow as a review."
- **Buttons:** verb + object ("Add mistake", "Start review (3)", "See the result"); never "OK" or "Click here".
- **No pressure:** mistakes are "mistakes to review", not failures; the streak encourages and never threatens.
- **Empty states** say what will be here and offer one action. **Errors** say what to fix ("Type the correct answer.").
- **Typography:** curly quotes “…”, en dash – in ranges (A1–C2) and as a sentence dash with spaces, ellipsis …, a space between number and unit ("3 days"); dates in US format (`LM.fmt`), decimal point.
- Texts that name the language use `LM.APP.language`; the Lab title is `LM.APP.lab.title`.

## 7. Libraries and assets

| Library | Version | License | How it reaches the page |
|---|---|---|---|
| `@fontsource-variable/fraunces` | 5.3 | SIL OFL 1.1 | `npm run assets` → `assets/fonts/fraunces-latin*.woff2` (wght + opsz) |
| `@fontsource-variable/inter` | 5.3 | SIL OFL 1.1 | `npm run assets` → `assets/fonts/inter-latin*.woff2` (wght) |
| `lucide-static` | 1.59 | ISC | `npm run assets` → `assets/icons.js` (only the icons in use) |
| `gsap` | 3.15 | GreenSock standard license (free incl. plugins) | `npm run assets` → `assets/vendor/*.min.js` (on demand) |

- Assets are copied into the repository so the page runs without a build step, from `file://` and GitHub Pages. No CDN, no Google Fonts.

## 8. Quality checks (every stage)

1. `npm run build` (validates first), `npm run validate`, `npm test`, `npm run check:lang`, `npm run contrast` (0 failing pairs), `npm run e2e`.
2. **Hard-coded values:** outside the token blocks `css/style.css` has no color literals, font sizes or radii in px, and no times outside tokens (exception: 0.01 ms in the reduced-motion rule). Documented exceptions: `meta theme-color` in `<head>` and `THEME_COLOR` in `js/theme.js` (they run before the CSS), the stand-alone `assets/favicon.svg`.
3. **Dead CSS:** every class in `css/` is used by `js/`, `index.html` or a dynamic prefix (stage 7 removed 87 selectors of dropped views).
4. Screenshots: light and dark at 390 and 1280 px (plus 320 / 768 where layout changes); no horizontal scroll from 320 px.
5. Print: topic pages and cheat sheets on A4 and US Letter (`@page { size: auto; margin: 12mm }`, `css/print.css`).

## 9. Changelog

- **Stage 7 (brand, docs, QA).** Terracotta accent and two-tone wordmark, mark in the level gradient, favicon refresh; home page; this file and `README.md` in English; dead-code sweep; portability audit (spec 09).
- **Stage 6 (Tense & Mood Lab).** Data-driven grid, free formation rows, reusable timeline, contrast cards with a mini quiz, decision trees, search entries (3.15).
- **Stage 5 (learning loop).** Report links and the home footer (E12), listen buttons and `lang` on flashcards, the mistake log and the placement test, decks by level, texts from the content.
- **Stage 4 (exercises).** The `paradigm` type, every item type checked with Spanish data, placement and final tests on syllabus categories, content validators, `tools/strip-keys.js`.
- **Stage 3 (language layer).** `LM.lang`, accent-aware checking with near-miss hints and lenient mode, `LM.speech` with voice variants, `lang` markup and listen buttons, the special-character bar, folding in search.
- **Stages 0–2.** Port of `english-levels-map` (design stages 1–4 and packs v2–v8 of the original: tokens, sidebar, Today, celebrations, level pages, callouts, exercises, stats, search, notes, exams, flashcards), syllabus-driven checklist and trail, English UI.
