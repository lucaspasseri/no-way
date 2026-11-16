# Persistent OpenRouter request diagnostics

AI Lab generation now writes structured request traces to PostgreSQL. This is observability only: the generation prompt/algorithm, two-question batches, 7/10/12-attempt budgets, model fallback configuration, 20-second provider deadline, pack ownership, and question lifecycle remain unchanged. No external monitoring service or new dependency is introduced.

## Install and deploy

For local development with the existing `.env`:

```sh
npm run db:traces
```

For production, use the existing trusted application `DATABASE_URL` in your deployment environment:

```sh
node db/schema.mjs --traces-only
```

Run this additive, repeatable installation before deploying the tracing code. It creates only `public.openrouter_request_traces` and its indexes. It does not reset or seed questions, modify pack data, or alter question statuses. Full `db:schema` initialization and schema exports include the table for fresh installations. `db:lab` retains its existing pack-table-only behavior.

Use the trusted application database role to own the new table. It needs normal CREATE privileges for installation and access to its trace table afterward. The script revokes PUBLIC privileges and enables row-level security with no public policies. Ordinary database roles cannot inspect traces, even following an accidental SELECT grant. There is no browser diagnostics page or public trace API. The project has no administrator authentication system, so inspection follows the existing operator CLI convention: trusted shell access and database credentials are the authorization boundary.

If a separate migration role owns tables, have a DBA assign this table to the trusted application role, or configure narrowly scoped role grants and RLS policies for the application writer and administrator reader. Do not give player/anonymous database roles access. A table owner bypasses RLS by PostgreSQL design. Reader roles that are not owners need both SELECT and an explicit administrator-only SELECT policy; privileges alone are intentionally insufficient.

Missing schema, denied permissions, unavailable diagnostics connections, and diagnostics write failures produce only a safe warning with an internal trace ID. They never replace an otherwise successful generation result. Installation is therefore necessary to obtain persistent traces, but an installation problem does not disable existing gameplay or AI generation.

## View historical requests

Run these commands from the deployed application directory, or from a trusted local operator shell connected to the production database. The CLI loads `.env` when present; otherwise it uses the existing environment. It never needs an OpenRouter key just to inspect saved traces.

```sh
npm run openrouter:traces -- list
npm run openrouter:traces -- list --http-status 429
npm run openrouter:traces -- list --error rate_limit --since 2026-11-01
npm run openrouter:traces -- list --model nvidia/nemotron-3.5-super-vl:free
npm run openrouter:traces -- list --pack 3849ab53-0133-48ec-84eb-c0208ea2066a
npm run openrouter:traces -- list --group-by pack
npm run openrouter:traces -- show TRACE_UUID
```

Replace `TRACE_UUID` with an internal ID from `list`; JSON output makes IDs easy to copy. `show` prints the saved structured record with the sanitized response/error snapshot, original allowlisted headers, embedded rate-limit headers, normalized reset/retry times, and configured versus confirmed routing. Filters also include `--status`, `--until`, and `--limit 1..1000`. Date-only bounds mean UTC midnight; full ISO timestamps with offsets are supported. Model filters match the requested primary, any configured fallback, or the responding model. Inspection uses bound SQL parameters and read-only transactions.

Outcomes include `in_flight`, `http_received`, `response_parsed`, `accepted`, `empty_batch`, `partial_validation`, `validation_failed`, and `failed`. An `in_flight` or intermediate row may belong to a running request, a process that terminated, or an interrupted/failing checkpoint; it is not proof of a completed request. Actual HTTP status is separate from the application outcome. An HTTP 200 may contain an upstream error, malformed candidate JSON, or invalid questions.

## Trace lifecycle and correlation

1. The owner-scoped Lab service supplies the pack ID. Request context never comes from player-supplied tracing fields.
2. At the SDK's actual HTTP boundary, generate a UUID and initiate an `in_flight` insert before attempting transport. Capture the SDK-serialized model list in its actual order. No prompt is saved.
3. Capture HTTP status/text, request/response timestamps, header/body durations, allowlisted correlation/rate headers, and a sanitized response snapshot. Queue this checkpoint immediately and drain it before the application transforms the original failure into a public error.
4. Record SDK-response parsing and candidate-JSON parsing independently. Retain the raw response model/provider/IDs/usage/cost where available, even if parsing later fails.
5. After normal question screening, update the same row with received/accepted/rejected counts, grouped rejection codes, and the generation decision. Provider, transport, response-parsing, candidate-parsing, and question-validation failures remain distinct.

A successful HTTP request typically needs three checkpoints; failures can need four. Upserts and unchanged-state suppression keep a single row per outbound HTTP invocation. Only actual additional HTTP invocations get another trace ID. There is no retry loop added by tracing.

`attemptNumber` is the existing pack-wide advance counter. `batchNumber` identifies the logical two-question fill slot (`floor(acceptedBefore / 2) + 1`), so a failed attempt and its resumed request share that slot. `httpAttemptNumber` numbers actual transport invocations within one advance; it is normally 1 because SDK retries remain disabled. Native OpenRouter model fallbacks inside that request do not become fictitious outbound HTTP attempts. An interrupted/rolled-back pack transaction may reuse its advance counter on a later real request; distinct trace UUIDs still distinguish those requests.

Ordered checkpoints run alongside HTTP processing and are drained before the Lab returns. Slow or failed diagnostic writes do not consume the provider's HTTP deadline or reclassify its result. Traces use a separate two-connection pool with short connection/statement/query timeouts. This avoids deadlocking behind the pack transaction, and committed diagnostics survive its rollback. `application.generationDecision` records what generation decided; `packCommit: not_observed` explicitly avoids claiming that the surrounding transaction committed or that the browser received the result. The HTTP duration excludes diagnostic database writes; `lifecycleCompletedAt` marks the later parsing/validation checkpoint. Preflight errors that send no HTTP request create no request trace.

## Routing evidence and optional enrichment

The SDK sends `X-OpenRouter-Metadata: enabled` on traced Responses API requests. OpenRouter documents this opt-in and the `openrouter_metadata` response on both success and error. See [router metadata](https://openrouter.ai/docs/guides/routing/routers/router-metadata) and [Responses endpoint headers](https://openrouter.ai/docs/api/api-reference/responses/create-responses).

- `request.models`, `primaryModel`, and `fallbackModels` describe configuration actually sent, not attempted models.
- `routing.confirmedAttempts` contains only explicit, well-formed `openrouter_metadata.attempts` entries reported by OpenRouter.
- `routing.successfulModel` identifies the model returned by a completed, parsed response. A provider explicitly reported in the response/error is recorded; a selected endpoint is attributed as the serving provider only for a completed response.
- `reportedAttemptNumber` retains OpenRouter's reported counter without inventing identities for earlier attempts.
- Endpoint candidates and selected flags alone are never treated as a history of attempted models/providers.
- Missing or stripped router metadata remains unknown. OpenRouter documents that cache replays omit it; some errors omit it too. Truncated or malformed metadata is not completed by guessing from the fallback list.

The [generation-details endpoint](https://openrouter.ai/docs/api/api-reference/generations/get-generation) was reviewed. It can supplement final provider, usage, cost and finish data for a valid `gen-...` ID; its documented response does not guarantee a complete fallback history. Responses API `resp_...` IDs are preserved as response IDs and are not mislabeled as generation IDs. This milestone makes no automatic generation-detail/enrichment calls: opt-in routing metadata already provides the relevant attempt evidence when available, while extra lookups would add traffic during rate limiting. No guessed-ID calls, background requests, or follow-up API charges are introduced.

## Rate-limit interpretation

Original allowlisted response header values are retained, with equivalent headers under `error.metadata.headers` stored separately. HTTP headers take precedence when both sources provide a value. Known headers include Retry-After, X-RateLimit-Limit/Remaining/Reset, request/correlation IDs, and X-OpenRouter-Error-Origin. Headers containing authentication/cookies are excluded.

`rateLimit.kind` distinguishes structured free-tier per-minute/daily signals, upstream provider capacity, credit/budget limits, and unknown rate limits. It uses `error.metadata.limit_source`, provider attribution, and HTTP/error codes. It never guesses a minute/day limit from an error-message phrase, the numeric quota, or reset proximity. Older generic 429 responses can therefore retain an unknown subtype while preserving the exact available reset data.

`retryAt` accepts Retry-After seconds or an HTTP date, then falls back to X-RateLimit-Reset. Reset timestamps in Unix seconds or milliseconds are normalized. Missing/malformed values remain null. Raw values stay available for inspection. Completion status is distinct from finish reason; absent finish reasons remain null. These fields do not change the UI's retry behavior. See [OpenRouter error metadata and retry headers](https://openrouter.ai/docs/api_reference/errors-and-debugging) and [limits](https://openrouter.ai/docs/api_reference/limits).

## Privacy, size limits and retention

Request configuration stores only safe parameters: model order, count, timeout, language/units, output-token limit, JSON-schema fingerprint, and existing non-sensitive request switches. It excludes prompt text, custom topics/challenges, owner cookies/hashes, browser/IP/user details, and credentials. Generated question text, explanations, answers and reasoning are omitted from response snapshots; output structure and text lengths are retained instead. No hidden answers are introduced into player APIs.

Provider error messages and known diagnostic strings are redacted for known API/database secrets, prompt/topic/challenge echoes, bearer/API/JWT tokens, emails, phone-like numbers and URLs. Sensitive structured keys are redacted, and unknown metadata string fields are conservatively omitted. Nested JSON error `raw` fields are parsed and sanitized when possible. Treat these diagnostics as restricted operational data despite sanitization: generic text redaction cannot recognize every possible form of personal information or unknown secret.

Capture reads at most 64 KiB of the response clone. Stored sanitized snapshots are limited to 16 KiB, metadata/usage have smaller limits, and the saved trace is bounded to 64 KiB. Oversized data produces explicit truncation markers rather than a cut-off JSON string. Unstructured/malformed response bodies retain length and parsing state, not raw arbitrary text. The original SDK response stream is preserved and diagnostic capture failures do not turn a successful model response into a failure.

Default retention is 14 days. Set `OPENROUTER_TRACE_RETENTION_DAYS` to an integer from 1 to 90; invalid values safely use 14. Each new row receives its expiration at insertion; changing configuration affects new rows. Inspection immediately excludes expired traces. To remove expired storage, schedule an hourly operator job in the application environment:

```sh
npm run openrouter:traces -- cleanup --limit 1000
```

Cleanup deletes only expired trace rows, in bounded batches. It never touches packs or questions. If there is a backlog, repeat the command until it returns zero. Deployment does not install a scheduler automatically; use your hosting scheduler/cron with the same trusted database environment. Backups have their own retention policy and should follow your operational data policy.

If the process is killed after the in-flight insert, that row remains available as incomplete. If PostgreSQL is unavailable or the process dies before the initial write, durable diagnostics cannot be guaranteed; generation remains independent as required. No local-file or in-memory-only fallback is presented as persistent storage.

## Examples and verification

The JSON files below were produced through the actual tracing and screening code using mocked HTTP responses, not live provider calls:

- [Successful request with an explicitly reported model fallback](examples/openrouter-trace-success.json)
- [HTTP 429 with original/embedded headers, source classification and retryAt](examples/openrouter-trace-429.json)

Both examples share a synthetic pack ID. The success shows the ordered configuration separately from two explicitly reported attempts. The 429 keeps attempted routing unknown because no routing history was returned. Generated content and credentials are absent.

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:traces:local`. The local persistence test starts temporary PostgreSQL and mocks OpenRouter, so it consumes no AI credits or production data. It checks reconnection, transaction rollback durability, one row per HTTP invocation, correlation, RLS/privacy, filters, cleanup, and repeatable schema installation. The suite also covers HTTP success/429/402/403/500/503, retry/reset headers, embedded metadata, timeouts/abort/network errors, malformed response/candidate JSON, invalid questions, incomplete routing evidence, redaction/size limits, and diagnostics write failures.

## Files

- Database: `db/openrouter-traces-schema.sql`, `db/openrouter-traces.mjs`, `db/openrouter-traces.test.mjs`; installation/export changes in `db/schema.mjs` and `db/export-schema.mjs`.
- Capture and sanitization: `src/lib/openrouter-tracing.mjs`, `src/lib/openrouter-trace-safety.mjs`, `src/lib/openrouter-tracing.test.mjs`.
- Generation integration: `scripts/openrouter.mjs`, `db/generate-questions.mjs`, `src/server/lab-generation.mjs`, `src/server/question-lab.mjs`.
- Operator inspection: `scripts/openrouter-traces.mjs`, `scripts/openrouter-traces.test.mjs`.
- Integration/security tests: `tests/openrouter-traces.local.mjs`, `tests/fixtures/openrouter-responses.mjs`, `src/app/api/question-lab/route.test.mjs`.
- Configuration/documentation: `package.json`, `.env.example`, this guide, the two JSON examples, and the diagnostics link in `docs/question-lab.md`.

## Verification results

- `npm test`: 182 passing unit/API tests, including all existing gameplay/localization tests and the new tracing scenarios; no live OpenRouter calls.
- `npm run test:traces:local`: passed the real Lab-service → mocked SDK HTTP → persistent PostgreSQL → fresh connection/operator CLI workflow, including rollback, RLS and retention checks.
- `npm run test:lab:local`: 8 passed.
- `npm run test:db:local`: 10 passed.
- `npm run lint`, `git diff --check`, and `npm run build`: passed. The repository has no standalone type-check command; the configured Next build checks passed.
