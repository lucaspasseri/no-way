# AI Lab recovery

Phase 3 adds a Lab-specific recovery loop around the existing candidate generator.
The SDK still makes one request with retries disabled. Operator/curation CLI calls
keep their existing native OpenRouter routing; the Lab pins each outgoing request
to one approved model so retries and fallback share a measurable request budget.
The existing configured primary/fallback order and explicit single-model overrides
remain authoritative. No models, token budgets, or prices are discovered or added
automatically.

## Request lifecycle and budgets

`createLabService.advance` retains its pack row lock and two global generation
lanes. `advanceGeneration` calls `recoverLabBatch`, then runs the unchanged parsing
and question-screening pipeline. Each generator invocation consumes one of the
existing seven/ten/twelve pack attempts, including failed requests and automatic
recovery. Skipping a cooldown consumes zero attempts. A single advance permits at
most three calls, further limited by the pack's remaining budget.

The first request targets the configured primary unless a known cooldown excludes
it. Provider failures prefer the next untried eligible alternative in configured
order; once those are exhausted, a transient failure may retry the current model.
Connection-establishment failures retry the same model. There is one loop, without
SDK retries or per-model subloops. The normal 1,200-token two-question output cap
and 1,000-token final single-question cap remain unchanged. A paid fallback is
eligible only if an operator explicitly included it in the configured ordered
list. There is no new monetary budget or assumption about a model's current price.

The default recovery deadline is 22 seconds, below the 30-second route and
28-second client deadlines. Per-call provider timeouts remain at most 20 seconds
and shrink to the remaining recovery duration. Backoff uses equal jitter between
half and all of the exponential delay: 500–1,000 ms, then 1,000–2,000 ms by default.
No wait above the maximum delay or beyond the remaining deadline is scheduled.
Database checkpoint/finalization time is bounded separately by the existing
connection/query timeouts; it can add a small amount of return latency after the
provider recovery deadline. No further provider request starts after that deadline.

Browser cancellation stops pending waits and further attempts when the server
receives it. The active call is allowed to finish within its deadline so navigation
does not discard an otherwise valid batch. Accepted questions are committed as
before. Local timeouts, socket resets, and generic network interruptions may have
completed remotely or incurred charges, so they are not automatically replayed.
Only `ECONNREFUSED`, `ENOTFOUND`, and `EAI_AGAIN` prove sufficiently early transport
failure for automatic replay. There are no remote mutations or content repair.

## Recovery decisions

| Evidence | Retry / fallback | Operational cooldown |
| --- | --- | --- |
| HTTP 408, 500, 502, 503, 504 | Next eligible approved model; otherwise bounded retry | None inferred |
| Proven connection-establishment failure | Bounded retry of the same model | None inferred |
| Local timeout or uncertain network completion | Stop automatic recovery; manual review/retry remains possible | None inferred |
| 429 with upstream/provider-capacity evidence on the pinned model | Unaffected approved alternative; otherwise honor a short feasible retry time | Local bucket for the affected model |
| Free-model per-minute limit | Only models outside that scope are eligible; otherwise honor a feasible wait | All configured `:free` models for the credential |
| Known daily free-model exhaustion | No retry within the exhausted free scope; only an explicitly configured unaffected model can be eligible | Free-model scope |
| 429 with unknown scope | Do not switch models to evade an unproven scope; retry only after a short feasible supplied wait | Original ordered configuration's request scope |
| Credit/budget restriction | Stop; no automatic switch or purchase flow | Credential scope, using supplied timing or a short local safety wait |
| HTTP 401/403, 400/404/422 | Fail fast; no blind retry | None inferred, except structured credit/budget restrictions |
| Malformed HTTP/candidate JSON or incomplete output | Stop provider recovery | Content failure remains distinct |
| Invalid questions / duplicates / units / difficulty | Existing screening and pack-fill behavior | No provider recovery or alternate-model repair |
| Shared cooldown database unavailable | Fail closed; no provider request/retry loop | Operator intervention may be required |

These decisions use normalized status, structured limit sources, timing headers,
and transport error codes. Provider prose, quota values, and endpoint candidate
lists are not evidence of scope or a model attempt. The upstream model bucket is
a conservative application policy for the pinned model, not a claim that all its
providers are unavailable. True provider-wide exclusions are not added: the current
responses do not reliably identify a stable provider routing key.

OpenRouter documents [model fallback pricing and routing](https://openrouter.ai/docs/guides/routing/model-fallbacks)
and [structured credit, budget, and request limits](https://openrouter.ai/docs/api_reference/limits).
The Lab does not invent undocumented account identity or reset windows.

## Shared cooldown storage

`openrouter_cooldowns` is private operational state, separate from historical
traces and pack lifetime. The existing bounded diagnostics pool provides
independent autocommit connections. Atomic upserts keep the later expiry and its
matching sanitized details; a shorter concurrent update cannot shorten a wait.
Pack rollback or expiry cannot erase an active restriction. Reads ignore expired
records immediately. A database error stops recovery instead of failing open.
Known unexpired Phase 2 daily waits are imported from legacy pack state on first
use, so installing the table does not discard an already recorded restriction.

Coordination is namespaced by a SHA-256 digest of the configured API credential.
The raw key and its digest never enter player responses. Instances sharing the
same credential and PostgreSQL database coordinate across players. Distinct keys
for the same OpenRouter account cannot be correlated without a reliable account
identifier; rotating keys is not a way to renew provider quota. No new service or
external account lookup is introduced.

Scopes are credential, all free models, the affected pinned model, or an unknown
request scope bound to the original ordered model configuration. Unknown request
scope is deliberately conservative and never described as a confirmed account
limit. Other model configurations do not inherit that unproven restriction.

Valid provider retry/reset instants are retained. Missing or expired timing uses a
bounded local safety wait, explicitly distinguished from provider timing in traces
and the UI. The default is 30 seconds, configurable between 1 second and 5 minutes.
Provider-supplied waits are not shortened to this local default or capped into an
earlier retry. They can exceed the recovery deadline; the response returns promptly
in that case. The UI uses the earliest time at which an approved model can be
checked, taking overlapping buckets into account. Passing that time never promises
renewed quota or successful generation.

## Configuration

| Variable | Default | Accepted values |
| --- | --- | --- |
| `AI_RECOVERY_ENABLED` | `true` | `false` disables Lab retries and automatic alternatives; only the primary is requested |
| `AI_RECOVERY_MAX_ATTEMPTS` | `3` | Integer 1–3 total calls per advance, also limited by remaining pack attempts |
| `AI_RECOVERY_MAX_DURATION_MS` | `22000` | Integer 100–22000 |
| `AI_RECOVERY_BASE_DELAY_MS` | `1000` | Integer 1–4000 |
| `AI_RECOVERY_MAX_DELAY_MS` | `4000` | Integer 1–4000 |
| `AI_RECOVERY_DEFAULT_COOLDOWN_MS` | `30000` | Integer 1000–300000; only application-assigned safety waits |

Malformed/out-of-range values use defaults. Effective delays respect both delay
limits. `OPENROUTER_MODEL` and `OPENROUTER_FALLBACK_MODELS` still control the approved
ordered models; an empty fallback setting permits same-model transient retries
but no alternate model. Trace retention still uses `OPENROUTER_TRACE_RETENTION_DAYS`.

## Installation and operator tooling

Existing installations must apply the additive initialization before enabling the
new app version:

```sh
npm run db:recovery
```

With credentials supplied by the host instead of a local `.env`:

```sh
node db/schema.mjs --recovery-only
```

This creates the operational table and adds the trace event discriminator and
nullable HTTP-attempt number for explicit non-HTTP decisions. It preserves existing
trace, pack, and canonical-question data and can be applied repeatedly. Fresh
`db:schema`, schema exports, and isolated test databases include the new schema.
`db:lab` also installs the cooldown table. Deployment/startup does not run DDL.
Use the trusted application role to own the new tables, or the existing trusted
service role with RLS bypass. It needs SELECT/INSERT/UPDATE on cooldowns; operator
cleanup also needs DELETE. Grants alone do not bypass RLS. Public roles receive no
grants or RLS policies.

Schedule separate bounded cleanup commands:

```sh
npm run openrouter:traces -- cleanup --limit 1000
npm run openrouter:traces -- cleanup-cooldowns --limit 1000
```

Trace rows retain the pack ID, pack attempt number, and HTTP attempt number. Every
recovery has a UUID shared across its HTTP records, original ordered models, actual
request targets, decisions, delays, cooldown scope/timing, and final outcome. A
request rejected before routing is still distinguished from a confirmed model
attempt. Skips are decision entries, not HTTP requests. If every model is skipped,
an explicit `recovery_decision` event has a null HTTP attempt number. Operator group
counts include only HTTP events. Inspect a public recovery reference with:

```sh
npm run openrouter:traces -- recovery RECOVERY_UUID
npm run openrouter:traces -- list --pack PACK_UUID
```

The CLI remains operator-only. Player/copy summaries reapply a strict allowlist and
omit raw provider bodies, prompts, authorization, private database state, stacks,
credential hashes, and arbitrary decision strings.

## Player experience and verification

The current synchronous API returns a final recovery summary. No live model-switch
activity, artificial percentage, SSE, WebSocket, or polling is added. Successful
alternatives/retries receive a subtle bilingual notice. Each batch summary remains
in the pack so a later clean batch does not erase an earlier recovery. The error
report exposes a sanitized disclosure with request count, requested/actual model,
skips, reasons, and stop decisions. Structural screening and generated/unverified
question statuses are unchanged.

Run:

```sh
npm test
npm run test:lab:local
npm run test:traces:local
npm run lint
npm run build
```

The unit suite injects clocks, jitter and waits into mocked SDK/HTTP scenarios.
PostgreSQL tests exercise atomic competing updates, independent transactions,
instance/credential isolation, expiry, private access, history reconstruction, and
storage failure. They use temporary local clusters and never read `.env`.

For manual simulations, start a **fresh** isolated preview:

```sh
node --import ./tests/register.mjs tests/lab-preview.mjs
```

Open the printed local URL's AI Lab, choose **My own topic**, and generate using:
Restart the preview for each independent scenario: fixed fixtures are deliberately
screened against questions in previous private packs.

| Topic | Simulation |
| --- | --- |
| `Browser recovery outage` | One 503 followed by approved fallback success; later clean batches preserve the notice |
| `Browser recovery limit` | One upstream-model 429 with a 60-second wait; the unaffected alternative is eligible |
| `Browser provider failure` | Persistent 503, bounded recovery failure |
| `Browser provider timeout` | Uncertain local deadline; no automatic replay |
| `Browser partial pack` | Validation/duplicate screening; no provider repair or bypass |

Provider requests are intercepted only in the explicitly opted-in preview process.
No real OpenRouter calls or production configuration changes occur. Restart the
preview between scenarios that reuse the fixed question fixtures. The
`tests/lab-recovery.browser.mjs` helper verifies the real routes/database, a six-call
ten-question recovered pack, retained history, Portuguese switching, mobile dark
theme and no runtime errors. Existing error, game, interruption and timeout browser
helpers remain available.

Content repair, dynamic pricing discovery, guaranteed account identity across
different credentials, provider-wide routing exclusions, and guaranteed quota
renewal are deliberately outside this phase. Gateway-internal endpoint routing
within one pinned model is not controlled or counted as additional application
HTTP calls; explicit routing evidence remains the only source of confirmed model
attempts.
