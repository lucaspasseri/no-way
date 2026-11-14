# PostgreSQL questions and development workflow

The application uses the single PostgreSQL database configured in the existing
root `.env`. There is no separate test database, migration system, ORM, or backend
server. Next.js remains the backend, with `pg` as the only new direct dependency.
The existing JavaScript/JSDoc conventions, UI, reducer, and gameplay rules remain.

## Files and responsibilities

```text
.env.example                         placeholder DATABASE_URL; .env stays ignored
db/
  schema.sql                         current desired table definition
  schema.mjs                         additive schema initialization
  seed.mjs                           transactional, repeatable seed and verification
  reset.mjs                          explicitly guarded destructive entry point
  export-schema.mjs                  offline export to db/exports/schema.sql
  export-seed.mjs                    offline export to db/exports/seed.sql
  seed-statements.mjs                upsert/sequence SQL shared by seeding and export
  pool.mjs                           Node-only shared connection pool
  seed/questions.json                original dataset, moved unchanged
  operations.test.mjs                 schema, seed, rollback, and reset tests
  pool.test.mjs                       configuration and HMR pool reuse tests
  database.integration.mjs            explicit read-only checks of the .env database
src/
  server/questions.mjs                server-only getQuestions() using PostgreSQL
  server/questions.test.mjs           asynchronous database contract and failure tests
  features/game/validate-questions.mjs shared seed/retrieval contract validation
  app/page.js                        async Server Component; calls service directly
  app/api/questions/route.js          public GET response with answers omitted
  app/api/questions/route.test.mjs    API contract and sanitized failure tests
  app/loading.js                     existing automatic Suspense skeleton
  app/error.js                       existing generic error and server retry
tests/
  streaming.test.mjs                  real HTTP streaming and public API tests
  game.browser.mjs                   reusable Playwright gameplay verification
  register.mjs                       Node-only server-only marker shim for tests
```

The old `src/data/questions.json` path was removed by moving the file to
`db/seed/questions.json`; its contents were not duplicated or discarded. Runtime
modules no longer import JSON. The existing question service was updated in
place, and its JSON-mutating tests were replaced with database-boundary tests.
No functional game components or unrelated files were removed. README, package
scripts/lockfile, `.gitignore`, and the game architecture document were updated.

## Schema

[schema.sql](../db/schema.sql) is the authoritative, complete SQL definition.
It creates one table, `public.questions`:

| Column | Type and purpose |
| --- | --- |
| `id` | Positive integer identity primary key; explicit legacy IDs are preserved |
| `question` | Required, nonblank question text |
| `answer` | Required finite `numeric`; preserves decimal precision in storage |
| `category` | Optional text |
| `source_label` | Optional text, maps to the existing `src-label` field |
| `source_url` | Optional text, maps to `src` |
| `answer_context` | Optional text, maps to `explanation` |
| `origin` | Required text: `manual`, `seed`, or `ai`; defaults to `manual` |
| `status` | Required text: `draft`, `verified`, or `rejected`; defaults to `draft` |
| `created_at` | Required `timestamptz`, defaults to current transaction time |
| `updated_at` | Required `timestamptz`, defaults to current transaction time |

CHECK constraints reject invalid origins/statuses, nonpositive IDs, blank question
text, and nonfinite answers. New manual or future AI records require explicit
verification before entering gameplay. No unused difficulty column, generation
implementation, extra tables, triggers, or migration history were introduced.
Writers must set `updated_at` when changing rows; the seed does so only when data
actually changes. The identity sequence is advanced after seeding to avoid future
generated IDs colliding with preserved seed IDs.

## Configuration and connections

Keep the existing `.env` and its `DATABASE_URL`. For a new checkout only, copy
`.env.example` to `.env` and replace its placeholder with the database URL. The
CLI commands use Node's built-in `--env-file=.env`; Next.js loads the server
environment normally. Do not export a different `DATABASE_URL` in your shell:
environment variables take precedence over env-file values. Restart the app
after changing database settings. Never use a `NEXT_PUBLIC_` credential variable.

Use the provider-supplied URL when deploying to hosted PostgreSQL such as Neon,
including its TLS options and a pooled endpoint where appropriate. The pool
passes these options through without disabling certificate verification. See
[node-postgres TLS configuration](https://node-postgres.com/features/ssl).
Only the database from the current `.env` was accessed during implementation.

`db/pool.mjs` lazily creates a pool with at most five connections per Node process,
a five-second connection timeout, ten-second statement timeout, and ten-second
idle timeout. Development stores the pool on `globalThis` to survive HMR;
production reuses the module instance. Multiple deployment processes each have
their own limit, so size the total against the provider's connection budget.
See [node-postgres pooling](https://node-postgres.com/features/pooling).
CLI scripts release clients and close the pool. The application reuses it.

All imports of the pool are confined to Node scripts and the server-only question
service. The service's `server-only` marker rejects accidental client imports.
Credentials are never returned by the API. Failure logs report codes, not URLs,
connection strings, passwords, or database exception text.

## Initialization and seeding

```sh
npm run db:schema
npm run db:seed
```

`db:schema` executes `CREATE TABLE IF NOT EXISTS`. It can be repeated and never
drops, truncates, or replaces existing data. It deliberately does not reconcile
an incompatible existing table definition. Edit `schema.sql` to represent the
desired structure; breaking development changes require a deliberate reset.
Initialization and seeding never run during application startup or build.

`db:seed` validates the single seed JSON file, starts a transaction, and takes a
short table lock that permits reads while serializing writers. It preserves IDs,
all optional metadata, and numerical values. It inserts missing seed records as
verified, updates changed content only for seed-owned IDs, and reports inserted,
updated, and unchanged counts. Unchanged rows retain their timestamps. Existing
moderation status is preserved; reseeding does not silently reverify rejected or
draft records. Non-seed ID collisions fail without overwriting those records.
Rows outside the seed IDs are never removed. Upserts use PostgreSQL
[ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html).

Before committing, the seed reads the stored records back and verifies text,
numerical answers, IDs, and metadata. An error rolls back table changes. Error
codes distinguish missing/invalid configuration, invalid questions, seed ID
conflicts, and verification failures; PostgreSQL errors retain their error code.
Like normal PostgreSQL sequences, identity sequence positions are not guaranteed
to roll back; gaps in generated IDs are harmless and must not imply missing rows.

The configured database was initially empty. The first seed inserted 13 records.
After running schema initialization again, a second seed reported:

```text
{ inserted: 0, updated: 0, unchanged: 13 }
```

To write SQL files instead of executing database operations, run
`npm run db:export:schema` and `npm run db:export:seed`. Their default outputs are
`db/exports/schema.sql` and `db/exports/seed.sql`, which are ignored by Git.
Each command accepts an optional output filename after `--`, creates its parent
directories, and overwrites that output file. Neither loads `.env` nor opens a
database connection. The schema export copies the authoritative `schema.sql`;
the seed export validates the JSON, escapes PostgreSQL string literals, and uses
the same upsert and sequence statements as the executable seed. Its transaction
also refuses non-seed ID collisions. Apply schema SQL before seed SQL when using
these files manually. The offline export does not perform the live seed script's
read-back verification or print inserted/updated counts.

## Optional destructive reset

Only for expendable development data:

```sh
NODE_ENV=development npm run db:reset -- --confirm-reset
```

Reset refuses to connect unless both the exact development environment and the
explicit confirmation flag are present. The destructive function checks again.
It drops only `public.questions` without `CASCADE`, recreates the table from
`schema.sql`, and seeds it in one transaction. Dependencies that prevent the drop
cause failure rather than destruction of unrelated structures. It does not drop
the database, its public schema, or any other tables. Keep a backup if needed.
`NODE_ENV=production`, an unspecified environment, or missing confirmation refuses
the operation. Environment flags cannot identify whether a URL actually holds
valuable production data; never label such a connection as development to bypass
the guard. No reset was executed against the configured database during this task.

## Runtime data flow, loading, and errors

```text
PostgreSQL public.questions (status = verified, ORDER BY id)
  -> getQuestions()
       -> page.js -> existing Game Client Component and reducer
       -> GET /api/questions -> public fields only
```

`getQuestions()` keeps the existing async `Promise<Question[]>` interface and
uses a parameterized query. Numeric answers are returned as strings, matching the
original bank and the existing string-or-number answer type. SQL null metadata
becomes absent optional properties. Shared validation reuses `getQuestionAnswer`
and checks identifiers, duplicate IDs, and metadata types. Stable ordering
preserves next-question wraparound and random selection. Empty/invalid verified
datasets throw to the existing route error boundary; there is no JSON fallback.

The page calls the service directly, with no internal API fetch. The `Game`
Client Component still owns all interactive state. The existing `loading.js`
automatically supplies the segment's Suspense fallback; no extra boundary is
introduced. Development still calls `connection()` to wait for real navigation
and `getQuestions()` waits 1,000 ms before its query. Production schedules no
artificial timer. With Cache Components enabled, the real uncached query streams
behind a prerendered shell; `/api/questions` runs at request time. Database edits
are read on fresh requests without requiring a build. An already-open game keeps
its initial bank, and client router/history reuse can display cached route data.

The API keeps `{ questions, error }`: success returns `200` with public questions
and `error: null`; failure returns `500`, `questions: null`, and a generic message.
Both use `Cache-Control: no-store`. It never returns database exception details.
The page still shows the generic `error.js` message and its installed Next.js
`retry()` action, which refetches the segment. An unavailable database cannot
silently degrade to stale JSON.

## Answer exposure and server verification follow-up

The public API now omits `answer` and `explanation` via an explicit field allowlist.
The game page still serializes answers to its Client Component. This is necessary
for the existing reducer's challenge availability, synchronous challenge
resolution, next-round validation, and result snapshots. A server-only database
connection does not make those intentionally passed values secret. Public source
links can also disclose answers. This remains a local game, not cheat-resistant
multiplayer.

A complete follow-up must send public-only data to `Game`, move challenge
resolution to a server action/POST endpoint that looks up the verified question
ID, and preserve the strict `guess > answer` rule (equality favors the guess).
Return no answer on failure and return the result snapshot only on success.
The reducer/hook then need pending and failure states, controls for duplicate
requests, stale-response checks against the question and latest guess, and new
tests for reset/unlock/navigation races and next-round availability. Competitive
play additionally requires authoritative server round/session state. Adding only
an endpoint while retaining local resolution would give inconsistent protection,
so that broader gameplay refactor is intentionally identified rather than partly
implemented here. No AI generation or persistence of player sessions was added.

## Verification

```sh
npm test
npm run lint
npm run test:db
npm run test:integration # with npm run dev running
npm run build
```

Results: 56 unit tests passed; the two explicit read-only database tests passed;
development HTTP checks observed the fallback before the game and verified the
public API. The production build passed and reports `/` as partially prerendered
with streamed content and `/api/questions` as dynamic. With that build running
on port 3001, both production HTTP checks also passed:

```sh
TEST_BASE_URL=http://127.0.0.1:3001 TEST_MODE=production npm run test:integration
```

Both `NODE_ENV=production npm run db:reset -- --confirm-reset` and development
reset without confirmation exited with refusal before opening a connection.
The successful reset path, seed failures/rollback, and ID conflicts are tested
with fake clients, so automated tests never destructively modify the sole database.
`npm run test:db` is read-only; unit tests mock the database boundary. The HTTP
integration checks expect the seeded dataset, so intentional content edits may
require adjusting expectations. No separate database was created.

The focused JSDoc/TypeScript check passed:

```sh
node node_modules/typescript/bin/tsc --allowJs --checkJs --noEmit --skipLibCheck --target es2022 --module nodenext src/features/game/game-rules.mjs src/features/game/validate-questions.mjs src/lib/delay.mjs
```

There is still no project-wide TypeScript configuration, Node type package, or
`pg` type package; no type dependencies were added solely to change that scope.
The normal build also completed its existing TypeScript stage.

Session Playwright tooling ran `tests/game.browser.mjs` against development and
production. Both passed question selection, locking, guess validation/history,
reset, failed/successful challenges, results, next rounds, settings, themes, no
client API fetch for initial data, and public API answer omission. The development
fallback was visible for about 1.4 seconds in the recorded run; assertions use
ordered states rather than fragile timing thresholds. No browser dependency was
added. The existing loading/error components and styles did not need changes.
