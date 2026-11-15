# Language and measurements

The app supports English and Brazilian Portuguese through a small shared React provider and paired JSON dictionaries. UI, content localization, and numerical transformation have separate modules; the existing server-owned answers and single game reducer remain in use.

## Preferences and active games

Game Settings, available in both Classic and the Lab, provides independent language and measurement controls. A one-year same-site cookie stores preferences. The server reads this cookie before rendering the document and initializes the client provider with exactly the same values. The root layout deliberately sets `instant = false` because the document language depends on the request; page loading boundaries still stream the existing skeleton. No local-storage hydration swap or refresh is needed to change language.

English initially uses original units; first-time Portuguese uses metric. An explicitly selected unit system stays selected across language changes and reloads. Language switches immediately update UI, Classic question text, categories, difficulty, and number formatting without changing guesses, question identity, ordering, timers, progression, or challenge state. Measurement changes apply to the next selected question, even if the current round has no guesses. Challenge requests carry the selected question's measurement configuration, rather than the current global setting.

Generated packs retain the language, measurements, text, and answers saved at creation. Both the Lab summary and gameplay banner explain this policy. Switching preferences changes shared UI; it never translates or regenerates an existing AI pack. Older packs without localization fields are treated as English/original units.

## Curated content

`db/seed/question-localizations.json` contains Portuguese questions and answer explanations for all 200 existing seed questions. It is a versioned, editable content sidecar deployed alongside the existing seed; it adds no questions and makes no database writes. Entries retain exact English reference text, source unit and canonical answer, a distinct `translationStatus`, and optional explicitly approved measurement metadata and localized metric prompts.

The server resolves an entry by exact English text and verifies both source unit and canonical answer. Database IDs and curated numbering can change independently of seed IDs. Unknown, edited, or mismatched content falls back to the English source, with a visible fallback label. Newly added production questions use that same fallback until a matching catalog entry is deployed. Translation completeness and stale-source checks run against the seed in automated tests.

`translationStatus: translated` records translation availability, not independent factual validation. It never promotes the source lifecycle or declares the translation factually verified. The original database row, source evidence, `generated`/`validated`/`curated` state, and canonical answer are unchanged. Portuguese wording should receive normal editorial review. Original English reference explanations are preserved alongside their Portuguese versions. Explanations are translated only when their source text still matches; changed or missing entries use a clearly labeled English fallback. Converted results explicitly identify source explanations that describe original units.

The catalog and resolver are server-only. Public questions contain only the current prompt, answer-free language alternatives for that same measurement representation, and display metadata. Canonical answers, measurement values, source explanations, and reference links are never added to selection payloads. Successful challenges reveal the same result evidence as before.

## Deterministic conversion and rounding

`src/lib/measurements/units.mjs` defines dimensions and base factors: lengths in meters, masses in grams, volumes in liters, and temperatures in Celsius. Supported IDs include `mi`, `ft`, `in`, `lb`, `oz_mass`, `gal_us`, `gal_imperial`, `fl_oz_us`, and `F`, plus `km`, `m`, `cm`, `mm`, `kg`, `g`, `L`, `mL`, and `C`. Fahrenheit uses the affine formula `(F - 32) × 5/9`. US and Imperial gallons are distinct, as are mass and fluid ounces. Unknown units and incompatible dimensions return no conversion.

`convert.mjs` separates raw conversion from playable derivation. Decimal rounding uses base-ten BigInt arithmetic and rounds halfway away from zero. Playable precision is explicit and limited to 0–6 decimals. The current five approved Classic conversions use whole meters or kilometers, with that rounding stated in both question texts. Display, equality checks, challenge results, and differences all use this single derived rounded answer. Canonical answers remain untouched.

Small pound quantities prefer grams over kilograms. A transformation that would turn a nonzero quantity into zero, exceed the game's safe answer range, or yield a negative answer is declined. Raw temperature conversion supports negative temperatures, but gameplay preserves the existing nonnegative-answer rule. Large values are checked after conversion. No unit inference runs on arbitrary legacy text.

The curated conversion allowlist currently covers three lake depths, the Grand Canyon length, and the highest North American summit elevation. Other seed questions already use metric units or represent counts, dates, durations, unit relationships, geometric exercises, and scaled quantities; their answers and embedded numbers are preserved. To add a conversion, explicitly supply the dimension, source/target unit IDs, precision, and both localized prompts, then extend tests. The conversion utility supports more units than the current curated bank needs.

## AI Question Lab

The server validates and persists `locale` and `unitSystem` in the existing pack configuration JSON. Every generation request receives that frozen configuration, together with the original custom topic and audience data. Native Portuguese question text and explanations are requested directly; English is not used as an intermediate translation. Metric requests ask for facts natively stated in metric units. Existing categories, free-text topics, surprise mode, difficulty, educational levels, and 10/15/20-question sizes remain available.

Structured output adds a declared locale and nullable answer measurement `{ value, unit, dimension }`. Screening retains the existing candidate and duplicate checks and additionally checks Portuguese counting/scoping terms, requested locale, incompatible metric units, ambiguous unit names/abbreviations, measurement dimension, and agreement between the measurement value and answer. Curated translations are included in local duplicate screening without sending the bank to the provider. Localized numeric answer leaks, including grouped decimal numbers, are rejected. Conversion exercises are rejected because independently verified source measurements are not available for them. No AI arithmetic is used to transform canonical game answers.

These checks detect structural defects; they cannot prove model facts or identify every possible semantic or language error. Packs remain explicitly unverified, private and temporary. Accepted questions survive provider failures and partial generation exactly as before. Neither translations nor generated packs enter the curated question table.

## Deployment and validation

No schema change, SQL migration, reset, new service, or translation API is required. Deploy the source and content catalog together using the normal build/start workflow. Existing question and temporary-pack tables remain compatible. Keep the existing database and AI-provider configuration; no new secrets are needed. Do not reset production data. Updating catalog entries requires a normal application deployment.

Automated verification includes dictionary parity, preference restoration, localized number entry, all supported conversion factors, precision boundaries, negative temperatures, tiny/large values, ambiguous units, all 200 curated translations, canonical identity and lifecycle preservation, English fallback, hidden-answer projections, transformed challenge equality, server config validation, localized AI prompt/schema, custom topics, partial generation, and mocked provider failures.

The browser flow in `tests/localization.browser.mjs` follows the repository's existing exported Playwright-Page convention and runs against a fresh `tests/lab-preview.mjs` instance with a temporary PostgreSQL database and mocked AI. It checks persistence and initial server HTML, language switching during play, Portuguese decimals, whole-meter challenges, Portuguese pack generation, frozen pack behavior after settings changes, and viewport overflow. Use a fresh preview for each complete generation run: repeated identical mock packs correctly trigger duplicate screening. Existing browser tests now use the text input role because locale-aware decimal entry uses a text field with decimal input mode.

No standalone type-check command exists in this JavaScript repository. `next build` performs the project's configured build checks.

## Verification results

- `npm test`: 142 passed, zero failures; provider calls mocked.
- `npm run lint`: passed.
- `npm run build`: passed, including Next's configured type/build checks.
- `npm run test:selection:local`: 6 passed against temporary PostgreSQL.
- `npm run test:lab:local`: 8 passed against temporary PostgreSQL.
- `npm run test:db:local`: 10 passed against temporary PostgreSQL.
- Development streaming integration: 2 passed; the production-only case was skipped in this development preview.
- Playwright checks: Portuguese preference defaults and persistence, initial server HTML, localized decimal entry, language switching with active guesses, whole-meter challenge equality, native Portuguese mock generation, frozen pack text/answers after preference changes, result explanations, and mobile overflow passed. Checks were exercised in stages against the isolated preview. The production build was verified separately.

## Files added or changed

- `db/generate-questions.mjs`
- `db/generate-questions.test.mjs`
- `db/question-validation.mjs`
- `db/seed/question-localizations.json`
- `docs/localization.md`
- `src/app/api/challenge/route.js`
- `src/app/api/question-lab/route.js`
- `src/app/api/questions/route.js`
- `src/app/error.js`
- `src/app/layout.js`
- `src/app/loading.js`
- `src/app/page.js`
- `src/app/question-lab/loading.js`
- `src/app/question-lab/play/[id]/page.js`
- `src/components/Game/Game.jsx`
- `src/components/GameResult/GameResult.jsx`
- `src/components/GameSettings/GameSettings.jsx`
- `src/components/GameSettings/GameSettings.module.css`
- `src/components/GuessInput/GuessInput.jsx`
- `src/components/GuessSection/GuessSection.jsx`
- `src/components/GuessesList/GuessesList.jsx`
- `src/components/LastGuessSection/LastGuessSection.jsx`
- `src/components/LayoutHeader/LayoutHeader.jsx`
- `src/components/QuestionCard/QuestionCard.jsx`
- `src/components/QuestionLab/ExperimentalPack.jsx`
- `src/components/QuestionLab/QuestionLab.jsx`
- `src/components/QuestionLab/UnavailablePack.jsx`
- `src/components/QuestionPreferences/QuestionPreferences.jsx`
- `src/components/TimerSection/TimerSection.jsx`
- `src/components/ToggleTheme/ToggleTheme.jsx`
- `src/features/game/question-selection.mjs`
- `src/features/game/useGame.js`
- `src/features/lab/config.mjs`
- `src/features/lab/localization.mjs`
- `src/features/lab/localization.test.mjs`
- `src/i18n/LocalizationProvider.jsx`
- `src/i18n/config.mjs`
- `src/i18n/en.json`
- `src/i18n/pt-BR.json`
- `src/i18n/request.mjs`
- `src/i18n/server.mjs`
- `src/i18n/translations.mjs`
- `src/lib/localization.test.mjs`
- `src/lib/measurements/convert.mjs`
- `src/lib/measurements/units.mjs`
- `src/server/lab-generation.mjs`
- `src/server/question-lab.mjs`
- `src/server/question-localization.mjs`
- `src/server/question-localization.test.mjs`
- `src/server/questions.mjs`
- `src/server/questions.test.mjs`
- `tests/challenge.browser.mjs`
- `tests/fixtures/lab-candidates-pt.mjs`
- `tests/game.browser.mjs`
- `tests/localization.browser.mjs`
- `tests/mock-ai-provider.mjs`
- `tests/question-lab.browser.mjs`
- `tests/question-preferences.browser.mjs`
