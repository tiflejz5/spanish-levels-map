# Spec 09 — Keeping the engine portable

The Polish app will be a **separate project in a separate repository**. To save work it will start from a copy of this app's code at the tag `engine-v1` (set at the end of stage 7). There is no shared code and no syncing afterwards. This spec only makes that one-time copy cheap.

## Rules for stages 1–7

1. Spanish facts live only in `js/lang.js`, `js/config.js` and `content/`. No Spanish word, letter, locale code or region name in any other file, CSS or test helper.
2. The lab view takes its grid, cards and trees from data; the timeline drawing is a separate function that another lab can call.
3. Tests of language-dependent logic keep their fixtures in one place (`tools/fixtures/lang/`), so another language can swap them.
4. UI texts that name the language use `LM.APP.language`.
5. `npm run check:lang` enforces rule 1.

## Tag

After the owner's "OK" on stage 7: `git tag engine-v1 && git push --tags`. Content stages come after the tag. Later engine fixes in this repo are not required to reach any other project.
