# Fixture exam `exam-demo`

A tiny exam in the format of `content/exams/` (spec 06 E8, spec 12). The real registry stays empty until stage E;
this fixture keeps the generic exam code under test:

- `node tools/tests.js` runs `tools/build/exams.js` `collect()` over this folder and checks the registry, pages,
  sets and trainer it produces, plus the exam logic that reads them.
- `npm run e2e` serves the app with this fixture instead of the empty registry and opens
  `#/exams/exam-demo`, its pages, its practice list, one set in the engine and the writing trainer.

It is test data only: never copy it into `content/`.
