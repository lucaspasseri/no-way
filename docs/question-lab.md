# AI Question Lab

Open **Settings → AI Question Lab**, choose 10, 15, or 20 questions, and select up
to three categories from the live curated bank, a custom topic, or Surprise Me.
Difficulty uses the existing easy/medium/hard values; Mixed is a generation
preference. Audience levels and custom challenge descriptions guide generation
without creating taxonomy records. The page and generation animation use the
existing fonts, theme tokens, and buttons, with reduced-motion support.

## Install and configuration

The existing `DATABASE_URL`, `OPENROUTER_API_KEY`, and optional `OPENROUTER_MODEL`
are reused. No new provider or dependency is required. The configured model must
support [structured output through the Responses API](https://openrouter.ai/docs/guides/features/structured-outputs). Free model/provider capacity
can vary; unsupported or unavailable upstreams produce a recoverable failure.

The default model order is Particle-1 → NVIDIA Nemotron 3.5 Super VL,
both using their `:free` endpoints. `OPENROUTER_MODEL` changes the primary;
`OPENROUTER_FALLBACK_MODELS` replaces the default backup with up to two ordered
backups. Set it empty to disable backups. Lists are validated, deduplicated, and
limited to three total models. Explicit operator `--model` overrides remain pinned to that one model.
All configured endpoints must support the same schema and `reasoning.effort=none`.

OpenRouter's native `models` list performs the failover within one SDK call.
All models share the original 20-second lab deadline; switching models does not
extend it. The gateway can fall back on rate limits, unavailable endpoints, and
other routing errors. A client-side timeout or successful response containing
invalid questions does not trigger a new client request. Nonexistent catalog IDs
and incompatible request settings can be rejected before routing begins. The existing bounded lab
attempt budget remains responsible for subsequent requests. Question provenance
records the model actually returned by OpenRouter. Defaults stay free; adding paid
IDs explicitly in server configuration can incur their published charges.

Live verification confirmed NVIDIA can return two structurally accepted questions
and that the gateway selects it when a provider filter excludes the primary's
endpoint. These checks establish routing and schema compatibility, not factual
verification of generated answers.

For an existing compatible database, install only the additive temporary-pack
table and its indexes:

```sh
npm run db:lab
```

This runs `db/lab-schema.sql`; it does not alter, import, approve, or delete any
canonical questions. Fresh `db:schema` and schema exports also include this table.
Production operators can review and run that SQL directly. Application startup
does not perform schema writes. Missing schema/configuration returns a safe 503.

## Server flow

`POST /api/question-lab` accepts a bounded, strict JSON action:

1. `create`: validate configuration and live categories, admit a private pack.
2. `advance`: generate up to two candidates, screen each, save accepted items.
3. Repeat `advance` while generating; finish when full or the retry budget expires.
4. `finish`: keep an available partial pack without further provider calls.
5. `challenge` / `report`: use owner-scoped pack questions during gameplay.

`GET /api/question-lab?id=…` retrieves an answer-free projection for resuming.
UUID creation IDs and expected attempt numbers make repeated submissions
idempotent. A PostgreSQL row lock rejects concurrent steps for the same pack;
transaction-scoped advisory locks allow at most two provider calls globally.
There are no background jobs: leaving the page lets its current batch finish,
while subsequent batches wait for an explicit resume. The browser remembers only
the pack ID in session storage. Refresh/revisit retrieves the committed pack.

Generation has a 20-second provider timeout, no SDK retries, and a 1,200-token
output limit for a two-question lab call (1,000 for a final single question). The
lab prompt and explanations stay concise. The route declares a 30-second deployment duration;
deployment must support that limit. Ten/fifteen/twenty-question packs have a
maximum of seven/ten/twelve provider attempts, including manual retries after errors.
Timeouts, rate limits, authentication failures, and malformed responses retain safe
error codes and specific recovery messages. The deadline covers reading the body,
including failures after an initial HTTP 200 response. Exhausted packs do not claim
that retry attempts remain. Provider failure pauses generation so the player can retry, retain accepted
questions, or change the configuration. Fewer valid provider candidates can be
retained. No placeholders or fallback curated questions fill a pack.

Admission is serialized in the database: three new packs per browser identity per
hour and twelve globally per hour. Clearing cookies can bypass the personal
limit; the global cap still bounds spending across instances. These are hard
request limits, not a currency budget: set an OpenRouter key spending limit for a
monetary ceiling. Cancelled, failed, and partial packs count toward admission.

Pack ownership uses a random 256-bit HttpOnly, SameSite=Strict cookie (Secure in
production); only its SHA-256 hash is stored. Pack UUIDs alone grant no access.
Mutation requests enforce origin/host checks and JSON input limits. Topics and
custom challenges have 2–160-character limits, text/content screening, and are
explicitly treated as untrusted subject/audience data in the provider prompt.
No arbitrary provider/model or token budget can be supplied by the browser.

## Screening and factual accuracy

The shared `candidateSchema`, structured-output integration, and
`validateCandidate` check text/number bounds, units, question scope, dates, and
near-duplicates. Lab screening also checks selected categories/difficulty,
obvious numeric-answer giveaways, unsuitable wording, and unstable/ambiguous
superlatives or estimates. Duplicates are compared against the canonical bank,
unexpired packs, and the current batch. These comparisons run locally; the provider
receives only the current pack's previously generated question texts, never the
canonical bank or other users' packs. Cross-pack concurrent generation is
best-effort: independently running packs can accept the same novel question.

These checks are **not factual verification**. Answers, explanations, model,
generation time, suggested source URL, and reference date stay in the private pack
JSON. Questions remain `origin=ai`, `status=generated`,
`verification=unverified`; there is no validated/curated promotion. Suggested
sources are not fetched or claimed to be verified. A report stores a bounded flag
with the temporary pack; it is not an operator review or a permanent moderation
queue. Input/output screening is deliberately conservative and cannot detect all
inappropriate, irrelevant, answer-giving, or inaccurate model content.

Every public preview/step/page projection uses the existing `publicQuestion`
allowlist. Answers, explanations, suggested links, and model metadata are absent.
Only a successful server-side challenge reveals answer/evidence for that question;
failed/equal challenges reveal no answer. Result wording says “Generated answer,”
and AI-suggested links are marked unchecked. Experimental play creates no ranking
or permanent game record (neither exists in the current game).

## Persistence and gameplay

`question_lab_packs` stores configuration and private questions as JSONB for 24
hours, independent of the canonical question lifecycle. Custom topics and levels
are pack metadata. No canonical category/difficulty changes are made. Expired
packs are inaccessible immediately and physically removed on the next admitted
creation; abandoned installations can periodically delete expired rows directly.

`/question-lab/play/[id]` passes public pack questions into the existing `Game`
component. `useGame` and the reducer still own locking, increasing guesses, doubt
requests, challenge outcomes, and round results. Pack selection consumes unseen
questions, stops at the pack boundary, and never queries the curated selector.
The challenge service calls the same `resolveChallenge` function as curated play.

The root `GameSessions` context keeps a separate in-memory state for regular play
and each pack across App Router navigation. Visiting the lab and starting another
pack preserves the regular question, guesses, lock, and result. Full reloads reset
game rounds, consistent with the existing game; the server-side pack itself is
still recoverable. Storage-disabled browsers can generate/play in the current
tab but lose automatic pack discovery after leaving. Private packs expire during
play too; players can return to the lab or their regular game if a challenge fails
after expiry.

## Verification

```sh
npm test
npm run lint
npm run build
npm run test:lab:local
npm run test:db:local
```

The PostgreSQL tests require local PostgreSQL binaries (`pg_config`, or `PG_BIN`).
They create and destroy isolated temporary clusters without reading `.env`.
Unit tests mock AI responses; the HTTP tests exercise real SDK serialization,
parsing, sanitization, and request timeout/abort behavior.

For browser tests, start:

```sh
node --import ./tests/register.mjs tests/lab-preview.mjs
```

This copies source to a temporary directory, seeds an isolated database, and starts
a local Next server on port 3107 (`LAB_PREVIEW_PORT` overrides it). Its explicit
test preload intercepts only OpenRouter HTTP requests and supplies deterministic
fixtures. It never calls a paid provider or changes production source behavior.
Pass a Playwright `Page` to the default export of
`tests/question-lab.browser.mjs`; it covers generation, sealed previews, finite
gameplay, reporting, saved-round return, partial packs, upstream failure, mobile
widths, dark mode, and reduced motion. Its named `verifyInterruptedPack` export
also checks leaving during a request, the saved batch, and keeping a partial pack
without additional generation. Existing browser helpers cover curated
gameplay and selection. SIGINT/SIGTERM tear down the preview app and database.

Logical next improvements are independent factual review, stronger content
moderation if the lab is opened widely, and authenticated per-account budgets.
Public sharing, rankings, and automatic curation remain outside this experiment.

## Diagnosing provider timeouts

The previous free Ling default has been observed to return HTTP 200 headers
quickly but leave the JSON body unfinished until the local deadline. A synthetic
two-question diagnostic also exceeded 45 seconds, while a shorter one-question
structured request succeeded. A valid key and advertised structured-output support
therefore do not guarantee that a batch completes at the endpoint's current speed.
Increasing the deadline alone is not a reliable fix. No model is silently replaced
and no paid fallback is enabled; the game host can select a responsive compatible
model using the existing `OPENROUTER_MODEL` setting.

The default is now `particle-ai/particle-1:free`. Its free endpoint supports the
current structured-output request and completed a live ten-question Pokémon pack
in about 17 seconds across seven bounded calls, replacing four screened-out
candidates. Each call finished within the lab's 20-second deadline. Model
availability and free-tier rate limits still apply.

`lastErrorCode=AI_TIMEOUT` distinguishes these failures from credential, credit,
rate-limit, and schema failures. Zero accepted and zero rejected means there were
no candidates to screen. The UI preserves the reason after revisiting a saved
pack, and a closed pack offers regeneration rather than claiming retries remain.
