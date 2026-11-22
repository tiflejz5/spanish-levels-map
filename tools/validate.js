/*
 * validate.js — `npm run validate`: every validator, without writing anything.
 *
 *   1. tools/validate-*.js listed in VALIDATORS (content rules, ported from the reference waliduj-*.js)
 *   2. the structural checks of tools/build.js (syllabus, pages ↔ syllabus, quizzes, decks, placement, sets) in --check mode
 *
 * Validators of the reference that are not here yet, and why, are listed in SKIPPED and printed at the end.
 */
"use strict";

const path = require("path");
const cp = require("child_process");

const VALIDATORS = ["validate-exercises.js"];

const SKIPPED = [
  "rules of docs/plan/scripts/validate_plan.py and spec 06 E11 (pages, quizzes, placement pool, decks, target-language checks): stage 4",
  "deck rules (reference waliduj-fiszki.js: English theme and exam decks of spec v6 15): replaced by the spec 07 §7 rules in stage 4",
  "phrase bank (reference waliduj-zwroty.js): no content/writing/phrases.json yet (stage X of B1)",
  "speaking trainers and model essays (waliduj-mowienie.js, waliduj-wzorce.js): exams, stage E",
  "trail (waliduj-szlak.js): replaced; the trail is generated from the syllabus by tools/build/trail.js (E9), which checks content/trail-overrides.json",
  "\"real life and exam\" sections (waliduj-zycie.js) and C1 Use of English (waliduj-c1-uoe.js): dropped (D12, D13)"
];

module.exports = { VALIDATORS: VALIDATORS, SKIPPED: SKIPPED };

if (require.main === module) {
  let failed = 0;
  VALIDATORS.forEach(function (v) {
    console.log("== " + v);
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, v)], { stdio: "inherit" });
    if (r.status !== 0) failed++;
  });
  console.log("== build checks");
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, "build.js"), "--check"], { stdio: "inherit" });
  if (r.status !== 0) failed++;
  console.log("\nNot run yet:\n" + SKIPPED.map(function (s) { return "  - " + s; }).join("\n"));
  if (failed) { console.error("\nValidation failed (" + failed + ")"); process.exit(1); }
  console.log("\nValidation: OK");
}
