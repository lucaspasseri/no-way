# Development and operations

A number-guessing game built with Next.js App Router, React, JavaScript,
and CSS Modules. Browse the question bank, lock a question, submit increasing
guesses, and challenge the latest guess to check whether it is too high.

Run the commands below from the repository root.

## Development

```sh
npm install
cp .env.example .env
# Configure a local DATABASE_URL before applying the schema.
npm run db:schema
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). The question card contains
Lock/Unlock, Next Question, and Random Question. Enter a new guess below it or
use Doubt Guess directly below the latest guess. Open Settings in the header
to switch themes or reset guesses immediately. Numerical answers stay hidden
during play. A successful challenge ends the round and reveals the answer, comparison,
and available reference information on a dedicated Result screen. Choose
Play another round to advance to the next question, then lock it to begin.

The root `.env` supplies `DATABASE_URL`. Copy `.env.example` to `.env` and set a
local development URL. Fresh databases use `db:schema` and `db:seed`; existing
production databases require the separate reviewed [lifecycle schema upgrade](../db/upgrade-question-lifecycle.sql)
and [manual compatibility steps](question-service.md#existing-production-schema-manual-compatibility-steps).
Nothing initializes or seeds the database during application startup.

The manifest now contains **200 curated questions**, with curated IDs **1–200**.
Questions move through `generated → validated → curated`; regular gameplay uses
only curated questions. The Question Lab separately enables experimental packs.
Automated validation does not establish factual accuracy. Database
primary keys are independent from curated IDs and are preserved across imports.
See the [dataset audit](question-curation-report.md) and
[workflow documentation](question-service.md) for source reviews and commands.

Generate production data SQL offline, then review it before manually executing it:

```sh
npm run --silent questions:export-sql > curated-questions.sql
npm run --silent questions:export-sql -- --status curated > curated-questions.sql
npm run --silent questions:export-sql -- --status validated > validated-questions.sql
npm run --silent questions:export-sql -- --status generated > generated-questions.sql
npm run --silent questions:export-sql -- --status all > all-questions.sql
npm run questions:dataset -- check
```

`--silent` suppresses npm's banner so redirected output is valid SQL. The exporter
needs no database connection or credentials and never executes statements. Imports
are transactional and repeatable; unsafe content/status/identity conflicts raise
errors. Existing legacy approved seed rows need the explicitly reviewed
`--promote-validated` option after the separate schema upgrade. See the compatibility
steps before selecting it.

`npm run db:export:seed` also writes curated SQL to `db/exports/seed.sql`.
`npm run db:export:schema` remains a destructive fresh-database export; **do not
use it to upgrade production**. Its generated SQL drops the questions table.

## AI Question Lab (experimental)

Open **Settings → AI Question Lab** to generate a private 10-, 15-, or 20-question
pack using existing categories, your own topic, and standard or custom knowledge
levels. Packs use the existing gameplay and keep numerical answers hidden until
a successful challenge. They remain **generated, unverified, and for casual
play**; no AI generation automatically validates or curates a question.

Install the additive pack table in an existing database with `npm run db:lab`.
Fresh `db:schema` installations already include it. The existing server-only
OpenRouter credentials/model are reused. See [architecture, limits, recovery,
and tests](question-lab.md) for details.

AI Lab recovery uses one bounded retry/fallback budget and shared PostgreSQL
cooldowns. Existing installations need `npm run db:recovery` before deployment.
See [recovery policy, defaults, operator history, and simulations](ai-lab-recovery.md).

## Checks

```sh
npm run lint
npm test
npm run test:db:local    # isolated temporary PostgreSQL cluster; requires local binaries
npm run test:db          # optional read-only checks against the database in .env
npm run test:integration # with the development server running
npm run build
```

The offline unit tests use Node's built-in test runner and need no additional
test dependency. Test hooks require Node 22.15 or newer. Fredoka and Plus Jakarta Sans use `next/font/google`, which
requires Google Fonts to be reachable during a clean build.

## OpenRouter test request

Create an API key at [OpenRouter Keys](https://openrouter.ai/keys) and add
`OPENROUTER_API_KEY=your-key` to the ignored root `.env`, or configure the variable
in your server environment. Never prefix the key with `NEXT_PUBLIC_` or commit it.
The example environment file contains no actual key.

```sh
npm run openrouter:test
```

This makes one text request through the official `@openrouter/sdk` and prints the
model and reply. The default prompt asks for `OK`; the default model slug is
[`particle-ai/particle-1:free`](https://openrouter.ai/particle-ai/particle-1:free).
Free providers have availability and rate limits. Browse current slugs at
[OpenRouter Models](https://openrouter.ai/models). To choose a model and prompt:

```sh
npm run openrouter:test -- particle-ai/particle-1:free "Say hello in one sentence."
```

`OPENROUTER_MODEL` selects the primary model. The app sends an ordered fallback
list through OpenRouter's native `models` routing, starting with Particle-1,
then `nvidia/nemotron-3.5-super-vl:free`. Both defaults are free models supporting
the structured-output request and disabled reasoning.

Set `OPENROUTER_FALLBACK_MODELS` to a comma-separated list of at most two backups
to replace the default backup. An empty value disables fallbacks. Duplicate IDs are
removed while preserving order. Explicit CLI model arguments (including
`questions --model`) pin that request to the specified model for diagnostics.
Paid model IDs in an operator-configured list can incur charges; default lists
contain only free models.

Fallback is handled inside one OpenRouter request, sharing the original timeout
and output budget. The SDK does not make extra client-side retry requests.
Gateway errors can trigger failover; a local deadline aborting the entire request
or an invalid question batch returned with success does not start another model
request. Use valid catalog IDs: nonexistent IDs and incompatible request settings
can be rejected before fallback routing starts. The response's actual model is kept in question provenance. See
[OpenRouter model fallback behavior](https://openrouter.ai/docs/guides/routing/model-fallbacks).

Node loads `.env` if present, and existing shell environment variables
take precedence. The command runs only in Node, sends no game or database data,
and exposes no public web endpoint. It uses a 30-second request timeout, a
128-token output limit, and no automatic retries. Missing keys, authentication,
credits, permissions, unavailable models, rate limits, timeouts, and empty or
incomplete replies produce an actionable message and a nonzero exit code. Raw
SDK errors and authorization headers are never logged. Unit tests mock the SDK
or intercept its HTTP transport and do not make billable requests. Implementation follows the
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

## Candidate validation and factual review

Use the existing database operator CLI to generate or import candidates, validate
then curate them with actual independent evidence:

```sh
npm run questions -- generate --count 3
npm run questions -- import --file candidates.json
npm run questions -- list --status generated
npm run questions -- validate 123
npm run questions -- curate 123 --reviewer 'editor' --verified-answer 6 \
  --source 'https://your-checked-reference.example/polygons' \
  --notes 'Replace with actual factual, wording, difficulty and duplicate review notes.' \
  --independently-verified
npm run questions -- demote 123 --status generated \
  --notes 'The source changed; a new factual review is required before gameplay.'
```

IDs and evidence above are illustrative. Operator commands use database IDs.
For a database-free manifest workflow, use `questions:dataset` with `import`,
`validate`, `curate`, `demote`, `list` and `check`; see the
[exact commands and candidate format](question-service.md#offline-manifest-workflow).
Generation uses the configured OpenRouter key/model only on explicit invocation.
No AI request runs during seeding, application startup, exports or regular gameplay.
The Question Lab generates only after an explicit player request.

## Code and behavior

- [Architecture, rules, verification, and limitations](game-interface.md)
- [Question service, API, streaming, and verification](question-service.md)
- [Design tokens and shared styles](design-system.md)
- Rules and reducer: `src/features/game/game-rules.mjs`
- React state adapter: `src/features/game/useGame.js`
- Game UI: `src/components/Game` and its sibling components
- Runtime questions: PostgreSQL `public.questions`
- Seed dataset: `db/seed/questions.json` (200 curated questions; stable dataset IDs, curated IDs 1–200)
- Schema and workflow: `db/schema.sql`, `db/schema.mjs`, `db/seed.mjs`, `db/reset.mjs`
- Server-side question retrieval: `src/server/questions.mjs`

The async home page calls the question service directly and passes one public question into
the interactive game. Development retrieval waits 1,000 ms so the automatic
`loading.js` skeleton is visible on a fresh navigation. Production streams live
database questions without an artificial wait. `GET /api/questions` uses the same
service and returns public fields. Both the page and API omit answers, explanations,
and source links. `POST /api/challenge` checks a curated question on the server
and reveals the answer and checked reference only on a successful challenge.

An optional destructive reset is deliberately separate:

```sh
NODE_ENV=development npm run db:reset -- --confirm-reset
```

It drops and recreates only `public.questions`, then reseeds it in a transaction.
It requires development/test mode, confirmation, a loopback host, and a reserved
`no_way_dev` or `no_way_test` database name. It verifies the connected database and
server address before any destructive SQL. Hosted/unknown targets are refused.

Online multiplayer, player identities, scoring, and timed round progression are
not implemented. Classic and AI pack state is retained in memory during navigation;
this is a shared-screen game rather than a synchronized multiplayer service.
