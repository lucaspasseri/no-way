# No Way — Party Trivia

A number-guessing game built with Next.js App Router, React, JavaScript,
and CSS Modules. Browse the question bank, lock a question, submit increasing
guesses, and challenge the latest guess to check whether it is too high.

## Development

```sh
npm install
npm run db:schema
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). The question card contains
Lock/Unlock, Next Question, and Random Question. Enter a new guess below it or
use Doubt Guess directly below the latest guess. Open Settings in the header
to switch themes or reset guesses immediately. Numerical answers stay hidden
during play. A challenge ends the round and reveals the answer, comparison,
and available reference information on a dedicated Result screen. Choose
Play another round to advance to the next question, then lock it to begin.

The root `.env` supplies `DATABASE_URL`. Use a fresh development database for the new schema; existing databases require the separate deployment procedure in [Question repository](docs/question-service.md#separate-production-deployment-decision).
For a fresh checkout, copy `.env.example` to `.env` and replace its placeholder
with your PostgreSQL URL. Keep credentials out of version control. Schema and
seed commands can be rerun without deleting data or creating duplicate questions.
Nothing initializes or seeds the database during app startup.

To generate standalone SQL files without connecting to PostgreSQL:

```sh
npm run db:export:schema # writes db/exports/schema.sql
npm run db:export:seed   # writes db/exports/seed.sql
```

Pass an optional output path, for example
`npm run db:export:seed -- /tmp/questions-seed.sql`. Exports overwrite the chosen
file and create missing parent directories. The schema export includes
`DROP TABLE IF EXISTS public.questions` before recreating the canonical structure,
wrapped in a transaction. Executing it deletes existing question data; exporting
the file does not connect to the database. Execute schema SQL before seed SQL
if applying the files manually. The seed SQL preserves the existing repeat-safe
upserts and refuses IDs owned by non-seed questions. Generated default exports
are ignored by Git.

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
[`inclusionai/ling-3.2-flash:free`](https://openrouter.ai/inclusionai/ling-3.2-flash:free).
Free providers have availability and rate limits. Browse current slugs at
[OpenRouter Models](https://openrouter.ai/models). To choose a model and prompt:

```sh
npm run openrouter:test -- inclusionai/ling-3.2-flash:free "Say hello in one sentence."
```

You can also set `OPENROUTER_MODEL` in `.env`; an explicit CLI model takes
precedence. Node loads `.env` if present, and existing shell environment variables
take precedence. The command runs only in Node, sends no game or database data,
and exposes no public web endpoint. It uses a 30-second request timeout, a
128-token output limit, and no automatic retries. Missing keys, authentication,
credits, permissions, unavailable models, rate limits, timeouts, and empty or
incomplete replies produce an actionable message and a nonzero exit code. Raw
SDK errors and authorization headers are never logged. Unit tests mock the SDK
or intercept its HTTP transport and do not make billable requests. Implementation follows the
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

## AI candidates and human review

Only approved questions are playable. New AI candidates start pending, and review
runs through an operator CLI protected by shell/database access:

```sh
npm run questions -- generate --count 3
npm run questions -- list
npm run questions -- list --status approved
npm run questions -- approve 11 --reviewer 'editor' --verified-answer 6 \
  --source 'https://authoritative.example/reference' \
  --notes 'Independently checked the definition and calculated the numerical answer.' \
  --independently-verified
npm run questions -- reject 12 --reviewer 'editor' \
  --notes 'The candidate has ambiguous wording and cannot be verified precisely.'
```

Use actual pending IDs and independently researched evidence. Generation uses the
existing OpenRouter key/model and requires strict structured-output support;
`--model provider/model-slug` overrides the configured model. It runs only on
explicit command, never while seeding, starting the app, or playing. Structural,
content, and duplicate screening precede storage; human verification is required
for approval. AI-suggested URLs and model agreement are not verification.
See [Question repository](docs/question-service.md) for schema fields, supported
classifications, safeguards, review limitations, and production deployment.

## Code and behavior

- [Architecture, rules, verification, and limitations](docs/game-interface.md)
- [Question service, API, streaming, and verification](docs/question-service.md)
- [Design tokens and shared styles](docs/design-system.md)
- Rules and reducer: `src/features/game/game-rules.mjs`
- React state adapter: `src/features/game/useGame.js`
- Game UI: `src/components/Game` and its sibling components
- Runtime questions: PostgreSQL `public.questions`
- Seed dataset: `db/seed/questions.json` (five curated questions with stable IDs)
- Schema and workflow: `db/schema.sql`, `db/schema.mjs`, `db/seed.mjs`, `db/reset.mjs`
- Server-side question retrieval: `src/server/questions.mjs`

The async home page calls the question service directly and passes the bank into
the interactive game. Development retrieval waits 1,000 ms so the automatic
`loading.js` skeleton is visible on a fresh navigation. Production streams live
database questions without an artificial wait. `GET /api/questions` uses the same
service and returns public fields. Both the page and API omit answers, explanations,
and source links. `POST /api/challenge` checks an approved question on the server
and reveals the answer and checked reference only on a successful challenge.

An optional destructive reset is deliberately separate:

```sh
NODE_ENV=development npm run db:reset -- --confirm-reset
```

It drops and recreates only `public.questions`, then reseeds it in a transaction.
It requires development/test mode, confirmation, a loopback host, and a reserved
`no_way_dev` or `no_way_test` database name. It verifies the connected database and
server address before any destructive SQL. Hosted/unknown targets are refused.

Player sessions, synchronization, scoring, and timed round progression are
not implemented. The UI makes no claims about players or network connections.
