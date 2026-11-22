# Spec 08 — Spanish: language decisions

## 1. Variety (decision D5)

- **Standard international Spanish.** Sentences that sound normal in Madrid, Mexico City and Bogotá.
- Address: `tú` by default in examples; `usted` in service and formal situations; both shown on function pages.
- `vosotros`: in every conjugation table, labelled "(Spain)". Tasks that ask for "you (plural)" either say "(Spain)" / "(Latin America)" or accept both `vosotros` and `ustedes` forms.
- Past tenses: teach *pretérito perfecto* vs *indefinido* with the Spain usage as the reference and a `## Good to know` note that much of Latin America prefers the *indefinido* with *hoy / esta mañana*. Tasks avoid items whose answer flips between regions, or accept both.
- Vocabulary: prefer words understood everywhere; where there is no neutral word, give Spain first and the main Latin American variant after a slash in tables (*el ordenador / la computadora*) and accept both.
- Leísmo: use `lo` for masculine direct objects in models; accept `le` for a male person where the RAE accepts it.
- Spelling: current RAE norms (*solo*, *este* without accents; *guion*).
- Speech: `es-ES` first; setting "Voice: Spain / Latin America".

## 2. Terminology (EN term first, native term in italics on first use)

present · preterite (*pretérito indefinido*) · imperfect (*pretérito imperfecto*) · present perfect (*pretérito perfecto*) · pluperfect (*pluscuamperfecto*) · future · conditional · present / imperfect / perfect / pluperfect subjunctive · imperative · gerund (*gerundio*) · participle · reflexive verb · direct / indirect object pronoun · stem-changing verb.

## 3. What learners get wrong (source for mistakes sections and distractors)

Most of these come from thinking in English, the language of explanation. The first user is a Polish speaker who reads English, so errors typical for Slavic learners are included too (missing articles, one verb for ser / estar).

Missing articles (*Me gusta café*, *Tengo coche nuevo y coche es rojo*) · 
*Soy 20 años* / *estoy 20 años* (→ tengo) · ser vs estar (*soy cansado*, *está médico*, *es en Madrid*) · *me gusto el café*, *yo gusto* · adjective agreement and position (*la casa blanco*, *un rojo coche*) · missing personal `a` (*veo María*) · overused subject pronouns · *un otro*, *es bien* · gerund as a noun (*fumando es malo*) · por vs para · *preguntar una pregunta*, *pedir por*, *buscar para*, *esperar para* · false friends (*embarazada, actualmente, realizar, asistir, éxito, sensible, librería, carpeta*) · *tener un buen tiempo* · *estoy caliente* (→ tengo calor) · preterite vs imperfect · avoiding the subjunctive (*quiero que vienes*) · *más bueno / más mejor* · days and months with capitals, missing `¿ ¡`, missing accents on question words · *en el lunes* (→ el lunes) · *es la una* / *son las dos* · double negatives avoided (*no veo algo*) · *saber / conocer*, *pedir / preguntar*, *llevar / traer*, *ir / venir*.

## 4. Tense & Mood Lab (spec 06, E7)

Grid: columns Past · Present · Future; rows Indicative · Subjunctive · Imperative and conditional.

Cards (16): presente · pretérito perfecto · pretérito indefinido · pretérito imperfecto · pluscuamperfecto · futuro simple · futuro perfecto · condicional · condicional perfecto · presente de subjuntivo · perfecto de subjuntivo · imperfecto de subjuntivo · pluscuamperfecto de subjuntivo · imperativo · *ir a* + infinitive · *estar* + gerundio.

Contrast cards: ser vs estar · por vs para · saber vs conocer · indefinido vs imperfecto · perfecto vs indefinido (with the regional note) · indicative vs subjunctive after *que*.

Trees: "Pick the past tense" · "Indicative or subjunctive?" · "ser or estar?".

Lab cards are written in the level-extras stage of the level where the form first appears (A1: presente, ir a; A2: indefinido, imperfecto, perfecto, estar + gerundio, futuro, imperativo; B1: subjunctive present, pluscuamperfecto, condicional; B2: the rest).

## 5. Decks

One deck per vocabulary topic (ids `vocab-<level>-<slug>`), plus form decks:

| Deck | Level | Cards | Content |
|---|---|---|---|
| `verbs-core-100` | A1–A2 | 100 | the 100 most useful verbs, typed EN → infinitive + cloze in the present |
| `verbs-stem-changing` | A1–A2 | 30 | e→ie, o→ue, e→i in sentences |
| `verbs-preterite-irregular` | A2 | 40 | cloze with irregular preterites |
| `verbs-like-gustar` | A2–B1 | 24 | gustar, encantar, doler, molestar, quedar, faltar, parecer |
| `ser-estar` | A1–B1 | 40 | cloze: choose and conjugate |
| `por-para` | A2–B1 | 30 | cloze |
| `subjunctive-triggers` | B1–B2 | 40 | cloze after triggers |
| `connectors` | B1–C1 | 30 | cloze |
| `verbs-with-prepositions` | B1–C1 | 30 | cloze (*pensar en, soñar con, depender de*) |
| `false-friends` | B1–B2 | 30 | typed |
| `idioms` | B2–C1 | 30 | cloze |

## 6. Notes for the proofreader subagent

Check: written accents (question words, *tú / tu*, *él / el*, *sí / si*, *más / mas*, *aún / aun*, verb forms *hablo / habló*), opening `¿` `¡`, agreement in gender and number, `a` personal, preposition choice, clitic order and placement, natural word order, register consistency inside one dialogue, no regionalisms without a label, lower-case days, months, languages and nationalities, number formats, no anglicised syntax.
