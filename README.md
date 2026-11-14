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

The existing root `.env` supplies the sole `DATABASE_URL` used for this setup.
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
file and create missing parent directories. Execute schema SQL before seed SQL
if applying the files manually. The seed SQL preserves the existing repeat-safe
upserts and refuses IDs owned by non-seed questions. Generated default exports
are ignored by Git.

## Checks

```sh
npm run lint
npm test
npm run test:db          # read-only checks against the database in .env
npm run test:integration # with the development server running
npm run build
```

The 56 unit tests use Node's built-in test runner and need no additional
test dependency. Test hooks require Node 22.15 or newer. Fredoka and Plus Jakarta Sans use `next/font/google`, which
requires Google Fonts to be reachable during a clean build.

## Code and behavior

- [Architecture, rules, verification, and limitations](docs/game-interface.md)
- [Question service, API, streaming, and verification](docs/question-service.md)
- [Design tokens and shared styles](docs/design-system.md)
- Rules and reducer: `src/features/game/game-rules.mjs`
- React state adapter: `src/features/game/useGame.js`
- Game UI: `src/components/Game` and its sibling components
- Runtime questions: PostgreSQL `public.questions`
- Seed dataset: `db/seed/questions.json` (the original dataset, moved without duplication)
- Schema and workflow: `db/schema.sql`, `db/schema.mjs`, `db/seed.mjs`, `db/reset.mjs`
- Server-side question retrieval: `src/server/questions.mjs`

The async home page calls the question service directly and passes the bank into
the interactive game. Development retrieval waits 1,000 ms so the automatic
`loading.js` skeleton is visible on a fresh navigation. Production streams live
database questions without an artificial wait. `GET /api/questions` uses the same
service and omits answers and answer context. The game page still sends answers
to its client reducer; see the question-service document for this limitation and
the complete server verification path.

An optional destructive reset is deliberately separate:

```sh
NODE_ENV=development npm run db:reset -- --confirm-reset
```

It drops and recreates only `public.questions`, then reseeds it in a transaction.
It refuses production, unspecified environments, or missing confirmation. Run it
only when the configured database is expendable development data. It was not run
against the database during implementation.

Player sessions, synchronization, scoring, and timed round progression are
not implemented. The UI makes no claims about players or network connections.
