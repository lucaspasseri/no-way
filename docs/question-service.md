# Question repository and review workflow

The canonical structure is `db/schema.sql`; the five curated questions live in
`db/seed/questions.json`. Schema and seed scripts reproduce a fresh database.
There are no migrations, migration history, startup writes, scheduled jobs, or
AI calls during gameplay. The existing `pg` pool, Node test runner, OpenRouter
SDK, and installed Zod 4 are reused. Zod is now a direct runtime dependency.

## Model

| Column | Meaning |
| --- | --- |
| `id` | Positive integer identity; seeds retain stable IDs 1, 2, 6, 7, 10 |
| `question`, `answer` | Player wording and a PostgreSQL numeric answer |
| `unit`, `category`, `difficulty` | Answer scale, supported category, easy/medium/hard |
| `origin` | `seed`, `ai`, or the existing `manual` origin for compatibility |
| `status` | `pending` (default), `approved`, or `rejected` |
| `answer_context` | Explanation, definition, conversion, and rounding |
| `source_label`, `source_url` | Reference label and suggested reference; AI suggestions are unverified |
| `reference_date` | Optional date for the fact, distinct from generation/review timestamps |
| `generated_at`, `generation_model` | Server-recorded generation timestamp and returned model |
| `verified_at` | Successful factual verification timestamp; absent otherwise |
| `reviewed_at`, `reviewed_by`, `review_notes` | Human decision timestamp, operator identifier, and evidence/reasoning |
| `verification_source_url` | Reference actually checked by the human reviewer |
| `created_at`, `updated_at` | Record lifecycle timestamps |

The answer must be nonnegative, finite, and at most JavaScript's maximum safe
integer, consistent with the game's increasing nonnegative guesses. Fractions
remain supported; normal JavaScript floating-point limitations still apply.
Text lengths, category/difficulty values, HTTP(S) URLs, statuses, and metadata
requirements have database constraints. AI records require generation metadata,
units, category, and an explanation. Approval requires verification and review
metadata for every origin. An index on `(status, id)` supports gameplay and
review queries; a unique normalized-text index prevents exact duplicates even
when operators write concurrently. Similarity screening is additionally applied
by the operator repository.

Supported categories: `science`, `geography`, `history`, `culture`, `sports`,
`mathematics`, and `technology`.

## Fresh development database

Use a dedicated fresh PostgreSQL database. Copy `.env.example` to `.env` for a
new checkout and set `DATABASE_URL`; do not replace an existing environment file.
Next.js loads the server environment; CLI commands load `.env` using Node's
built-in env-file support. Existing shell variables take precedence. Never use
`NEXT_PUBLIC_` for credentials. Hosted TLS options are passed through by the
existing pool without disabling certificate verification.

```sh
# Example: create a fresh local database using your own PostgreSQL role.
createdb no_way_dev
# Set DATABASE_URL=postgresql://your-role@127.0.0.1:5432/no_way_dev in .env.
npm run db:schema
npm run db:seed
npm run questions -- list --status approved
npm run dev
```

Initialization creates the desired table and indexes if absent. It never alters
an existing table to match the new structure. The previous schema is detected
and rejected with a compatibility error; choose a fresh database or use the
separately reviewed production procedure below.

Seeding inserts curated questions as `origin=seed`, `status=approved` with fixed
verification metadata. The initial five questions reuse existing IDs and facts;
wording specifies units, definitions, and rounding. References were checked
against [NASA/JPL's au definition](https://cneos.jpl.nasa.gov/glossary/au.html)
and NASA's [Moon](https://science.nasa.gov/moon/facts/),
[Mars](https://science.nasa.gov/mars/facts/),
[Jupiter](https://science.nasa.gov/jupiter/jupiter-facts/), and
[Neptune](https://science.nasa.gov/neptune/neptune-facts/) facts.

The seed transaction locks writers briefly, refuses non-seed ID collisions,
parameterizes values, verifies the stored content, and preserves the identity
high-water mark. Repeat seeding reports inserted/updated/unchanged counts;
unchanged rows retain timestamps. It preserves existing moderation decisions
and rows outside the current seed IDs, including older seed records. When approved
seed content changes, it refreshes the curated evidence snapshot. Reducing
the fresh bank does not delete records in an existing database. No AI key or
provider access is needed for schema creation, seeding, retrieval, or review.

Offline exports use the same source files and upsert statements:

```sh
npm run db:export:schema # db/exports/schema.sql
npm run db:export:seed   # db/exports/seed.sql
npm run db:export:seed -- /tmp/questions-seed.sql
```

Exports overwrite their chosen file and create parent directories; no database
connection is opened. The schema export wraps `DROP TABLE IF EXISTS public.questions`
and the canonical schema in a transaction. Executing it replaces the table and
deletes existing question data. It does not use `CASCADE`, so unrelated dependencies
cause failure and rollback. This destructive behavior belongs only to the exported
SQL; `db:schema` remains non-destructive. Apply schema SQL before seed SQL. The SQL seed transaction
has the same ownership checks and idempotent upserts; only the live seed script
performs read-back verification and prints counts.

## Deliberate development/test reset

Reset is restricted to loopback connections (`127.0.0.1`, `localhost`, `::1`)
and reserved database names `no_way_dev` or `no_way_test`. It also requires an
explicit development/test environment and confirmation:

```sh
NODE_ENV=development npm run db:reset -- --confirm-reset
```

Before connecting, it refuses hosted/unknown targets, production/unspecified
mode, missing confirmation, and connection query parameters that could redirect
the target. Immediately before the destructive transaction it rechecks settings
and verifies `current_database()` and the actual loopback server address.
Only `public.questions` is dropped, without `CASCADE`; the canonical schema is
recreated, seeded, and verified in one transaction. Dependencies cause refusal.
Sequences can retain harmless gaps after rollback, as usual in PostgreSQL.

A local tunnel could still point a deliberately mislabeled database at valuable
data. Reserve these names for expendable local development/test databases.
Remote development databases must use a fresh database instead of this reset.
No reset or schema/data write was performed against the configured database
during this implementation. Integration resets use their own temporary cluster.

## Generate and inspect candidates

Configure the existing `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`.
The selected model/provider must support strict structured output; use `--model`
to override it. Unsupported providers fail clearly without falling back to
unstructured publication. This command deliberately makes one provider request:

```sh
npm run questions -- generate --count 3
npm run questions -- generate --count 1 --model provider/model-slug
npm run questions -- list
npm run questions -- list --status all
npm run questions -- list --status approved
```

Count is limited to 1–5. The shared OpenRouter helper uses a 30-second timeout,
no automatic retries, a 3,000-token output cap for generation (128 for the smoke
test), strict JSON Schema output, required provider parameter support, and
`store=false`. The generation prompt contains no database content, player data,
or credentials. See [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
and [Zod JSON Schema conversion](https://zod.dev/json-schema).

Generation, validation, persistence, and serving are separate responsibilities.
The provider request finishes before opening a database connection or locking
writers. Malformed JSON/counts fail the whole response. Each candidate then
undergoes strict structural validation: no coercion of strings to numbers,
unknown fields, unsupported classifications, invalid dates, excessive lengths,
credential-bearing URLs, or nonfinite/out-of-range answers.

Content screening rejects exact/near duplicates across all statuses, obvious
subjectivity, imprecise estimates without a rounding rule/reference, missing
units/scales, and recognized changing facts without an explicit reference date
in the question. Valid candidates are inserted in a transaction with server-owned
`origin=ai`, `status=pending`, generation time, and model. Duplicate and validation
failures are returned by index/code; valid siblings may still be stored, and the
CLI exits nonzero if any candidate failed. Database insertion errors roll back
the entire batch. Provider errors never affect existing questions.

`list` returns proposed answers, explanations, suggested sources, reference
and generation metadata, and review evidence. Output is intended for operators.
No candidate/review web endpoint or ordinary-player access exists. Shell access
and database credentials are the authorization boundary for this iteration.

## Independent factual review

Review each candidate's wording, scope, units, precision, date, and potential
semantic duplicates. Independently obtain an authoritative reference and
calculate/check the numerical answer. An AI-proposed URL may be fabricated or
irrelevant; open and assess the actual source yourself. Agreement between AI
models is not evidence. Automated screening never performs factual approval.
The workflow records a human attestation; it cannot prove that a person did the
research. The command deliberately does not fetch arbitrary suggested URLs.

```sh
npm run questions -- approve 11 \
  --reviewer 'editor-name' \
  --verified-answer 6 \
  --source 'https://authoritative.example/reference' \
  --notes 'Checked the source definition and independently calculated six sides.' \
  --independently-verified

npm run questions -- reject 12 \
  --reviewer 'editor-name' \
  --notes 'Rejected because the wording omits the applicable unit and scope.'

npm run questions -- list --status approved
```

Replace sample IDs, answer, and source with independently verified values.
Approval requires an explicit matching answer, HTTP(S) evidence URL, reviewer,
and at least 20 characters of notes, plus the independent-verification flag.
Structural/content/duplicate validation runs again under the writer lock.
Only `pending → approved` and `pending → rejected` are supported; terminal
decisions cannot be republished through this CLI. A mismatched factual answer
must be rejected, not forced through approval. Rejected text remains in duplicate
screening. Content corrections, retirement of approved questions, and reopening
decisions require a separately reviewed operator procedure for now.

## Serving and challenge resolution

`src/server/questions.mjs` keeps `getQuestions()` as an internal full-question
repository with origin available for debugging. It queries only `approved`
records in stable ID order, validates answers and IDs, and converts null metadata
to absent properties. Approved seeds and AI questions share one pool. No approved
AI questions is normal: seeds remain playable. No approved questions at all
produces the existing generic loading error/retry behavior and API 500 response.

The page and `GET /api/questions` share an explicit public-field allowlist:
`id`, `question`, `category`, `unit`, `difficulty`, `referenceDate`. The API keeps
`{ questions, error }` and `Cache-Control: no-store`. Answers, explanations,
source links, origin, review metadata, and generation data are not serialized
to ordinary gameplay. References can reveal answers, so they appear with results.
An approved AI result uses the human-checked verification URL.

`POST /api/challenge` accepts a question ID and finite nonnegative guess,
looks up that approved question again on the server, and applies the existing
strict `guess > answer` rule; equality favors the guess. A failed challenge
returns only `{ success: false }`. A successful challenge reveals the numerical
answer and explanation/reference snapshot. Pending/rejected/missing questions
cannot be challenged. Invalid bodies and database failures return generic errors.

The reducer and hook handle pending, retry, and stale responses. Reset, unlock,
question selection, and a newer guess invalidate an outstanding challenge;
responses are correlated to a unique request, question, and guess. Duplicate
clicks are suppressed. Failures preserve history and allow retry. Ordinary
question selection still uses the initial client bank; Next/Random avoid
immediately repeating the current question when alternatives exist, and rounds
retain the existing sequential wraparound. There is no session-wide used-ID
tracker or multiplayer authority. An already-open bank needs a refresh to see
new approvals; each challenge still rechecks approval in the database.

This is a local party game. Without server session/round state, someone can probe
the public challenge endpoint with fabricated guesses. This iteration removes
bulk answer exposure; competitive anti-cheat remains outside its scope.

## Tests

```sh
npm test                 # offline mocks; no database/server/provider required
npm run lint
npm run test:db:local    # own temporary cluster; requires PostgreSQL binaries
npm run test:db          # explicit read-only checks of DATABASE_URL from .env
npm run test:integration # HTTP checks; run against an initialized dev server
npm run build
```

`test:db:local` never loads `.env`. It starts an isolated temporary PostgreSQL
cluster on a free loopback port, creates `no_way_test`, exercises the real schema,
seed repeatability, constraints, real SDK serialization with mocked HTTP,
pending/approval/rejection, duplicate handling, rollback, approved-only API,
server challenges, provider failure isolation, empty pools, SQL export, and
reset, then stops/removes the cluster. It uses `pg_config --bindir`; set `PG_BIN`
to an installed PostgreSQL binary directory if needed. No production credentials
or API credits are used. The trust-authenticated cluster binds only loopback and
exists only during the test; run this suite as a non-root local user.

HTTP integration checks expect the canonical seed-only pool. Supply
`TEST_BASE_URL=http://127.0.0.1:PORT` to target a different local server.
`tests/game.browser.mjs` and `tests/challenge.browser.mjs` are reusable Playwright
helpers for gameplay and challenge retry/race checks using the existing session
browser tooling; no browser dependency is installed. Clean builds may need Google
Fonts access. In an environment that blocks Turbopack worker port bindings,
`npm run build -- --webpack` is a supported build alternative.

## Separate production deployment decision

The previously deployed structure has `draft`/`verified` statuses and lacks the
new metadata, constraints, and indexes. Merely running `db:schema` does not
upgrade it. Deploying the new application against that unchanged schema will
fail retrieval. Do not run initialization/seed/reset against production to try
to reconcile the difference.

Before deployment, back up and inventory existing rows/relationships and test a
restore. Prepare a separate database from the canonical schema and seed scripts.
Import existing data through an explicitly reviewed, one-time deployment
procedure: preserve stable IDs, map `draft→pending`, map `verified→approved`
only after supplying real review/evidence metadata, retain `rejected`, and
preserve the `manual` origin. Validate categories, nonnegative finite answers,
text/URL lengths, duplicate text, unit/precision definitions, and timestamps.
Unverified legacy content must remain pending. Reconcile old seed IDs outside
the fresh five deliberately; seeding does not delete them. Advance the identity
sequence beyond all imported IDs.

Validate the approved pool, review transitions, API, and gameplay against the
new database, arrange a controlled write freeze/cutover, then change the app's
`DATABASE_URL` and deploy the compatible application together. Keep the old
database and prior application available for rollback until validation is done.
An in-place ALTER/import plan, if preferred, requires the same separate review
and authorization; no such production procedure is executed or stored as a
migration system in this change.

## Implementation file map

| Change | Files |
| --- | --- |
| New candidate/review code | `db/generate-questions.mjs`, `db/question-validation.mjs`, `db/question-repository.mjs`, `db/reset-safety.mjs`, `scripts/questions.mjs`, `src/app/api/challenge/route.js` |
| Updated schema and seeds | `db/schema.sql`, `db/seed.mjs`, `db/seed-statements.mjs`, `db/seed/questions.json` |
| Updated serving/gameplay | `src/server/questions.mjs`, `src/app/page.js`, `src/app/api/questions/route.js`, `src/features/game/game-rules.mjs`, `src/features/game/validate-questions.mjs`, `src/features/game/useGame.js`, `src/components/Game/Game.jsx`, `src/components/GuessSection/GuessSection.jsx`, `scripts/openrouter.mjs` |
| New tests | `db/generate-questions.test.mjs`, `db/question-validation.test.mjs`, `db/question-repository.test.mjs`, `scripts/questions.test.mjs`, `src/app/api/challenge/route.test.mjs`, `src/features/game/challenge-request.test.mjs`, `tests/database.local.mjs`, `tests/challenge.browser.mjs` |
| Updated tests | `db/operations.test.mjs`, `db/database.integration.mjs`, `src/server/questions.test.mjs`, `src/app/api/questions/route.test.mjs`, `src/features/game/game-rules.test.mjs`, `tests/streaming.test.mjs` |
| Updated configuration/docs | `package.json`, `package-lock.json`, `.env.example`, `README.md`, `docs/game-interface.md`, `docs/question-service.md` |
