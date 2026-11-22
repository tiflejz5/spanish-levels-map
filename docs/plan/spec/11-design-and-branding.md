# Spec 11 — Design and branding

`DESIGN.md` stays the design system (direction "travel map with editorial typography", tokens, components, motion, accessibility). Stage 7 translates it to English, removes sections for dropped features and adds this spec. The design-review history of the original is not carried over.## 1. Name and marks

App title **Spanish Levels Map** · sidebar tagline "Your map of Spanish, A1–C2" · `<title>` "Spanish Levels Map (A1–C2)" · export file `spanish-levels-map-YYYY-MM-DD.json`.

Logo: the existing map mark with the level gradient; wordmark in Fraunces: "Spanish" in the accent colour, "Levels Map" in ink. No flag.

## 2. Accent

One accent for links, primary buttons, focus ring and the wordmark. Paper, ink, level colours and lands stay as they are.

Start values: light `#b4481f (terracotta)`, dark `#f0a070`. Run `npm run contrast`: text on `--bg` and `--surface` 4.5:1, focus ring and borders 3:1, both themes. The accent must stay clearly different from the level colours next to it (B2 raspberry, C1 orange): check with the categorical palette validator and move the hue until it passes.

## 3. Lands

A1 Meadow · A2 Forest · B1 Hills · B2 Lake · C1 Mountains · C2 Summit. Same symbols and colours. Unit titles come from the syllabus.

## 4. Home page (`content/home.md`)

What this is (3 sentences) · how to start: "Take the placement test (6 minutes)" or "Start the trail at A1" · table "Levels at a glance" (level, land, goal, status) · how it works (trail, I know this, review) · privacy note · how to report mistakes.

## 5. Re-check

- Longest English labels in narrow places (sidebar rail, bottom sheets, chips); the callout title "Common mistakes" wraps cleanly.
- Fonts: Inter and Fraunces subsets include á é í ó ú ü ñ ¿ ¡ (latin + latin-ext).
- Print: topic pages and cheat sheets on A4 and US Letter (`@page { size: auto; margin: 12mm }`).
- Dates in US format, numbers with a decimal point.
