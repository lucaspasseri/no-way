# Question dataset and service

The checked-in manifest contains **200 curated questions**, with curated IDs **1–200**.
The game reads PostgreSQL; it does not fall back to JSON or invoke AI during play.
Only `curated` rows enter the page, `GET /api/questions`, or `POST /api/challenge`.
The public question payload includes `status` and `curatedId`, while answers,
review evidence, source links and explanations remain hidden until a successful
challenge. Database `id` continues to identify challenges and historical references.
The home page and question route declare request-time boundaries before database
reads, so production builds can complete without connecting to a database.

## Lifecycle

| Status | Meaning | Playable |
| --- | --- | --- |
| `generated` | Imported or AI-created candidate; may still be ambiguous or factually wrong | No |
| `validated` | Passed schema, required fields, finite nonnegative safe numerical range, explicit units, wording/date, and duplicate screening | No |
| `curated` | Validated again and approved with matching source-checked answer, reviewer and factual/quality notes | Yes |

The centralized `db/question-lifecycle.mjs` implements `generated → validated → curated`.
Validation never creates factual evidence. Curation requires `independentlyVerified: true`,
a checked HTTP(S) source, an exactly matching numerical answer, and detailed notes
covering factual scope, rounding, difficulty, relevance and duplicate review. The flag
records an operator assertion; software cannot prove that the operator read a source.
A suggested AI source or agreement between models does not meet that requirement.

Demote questionable or outdated questions to `generated` with detailed notes, then
validate and review again. A structurally sound question can also be demoted to
`validated`. Both clear active factual approval. There is no fourth rejected status:
a failed candidate stays generated, with revalidation/rejection reasons in notes.
The database retains review notes but `verified_at` must be null outside curation.
Do not edit content already referenced by gameplay: demote it and create a replacement
candidate with a new identity when changing the fact or wording.

The duplicate heuristic ignores generic question words, normalizes case, accents and
punctuation, and screens token overlap. A unique normalized-text database index also
blocks exact duplicates across statuses. The heuristic catches close wording, not all
semantic paraphrases; curation must inspect related facts. Different named planets
with different measurements are not automatically the same question.

## Identities

* JSON `id` is the permanent dataset identity. The original IDs `1, 2, 6, 7, 10`
  remain unchanged; additions use `11–205`.
* Database `id` is PostgreSQL's identity primary key. Inserts omit it. Existing PKs,
  foreign keys and game history are never renumbered.
* `seed_key = predefined:<JSON id>` identifies a manifest record across repeated
  imports, even when its production primary key differs from a fresh database.
* `curatedId` in JSON/API maps to unique positive `curated_id` in PostgreSQL.
  The published bank has no gaps. New curation allocates `MAX(curated_id) + 1`
  under the same writer lock used for validation and duplicate detection.

A demoted question retains its reserved curated ID. Re-curation restores that ID;
other questions do not reuse it. A live database may therefore have gaps among
currently playable records. Never compact these IDs in production. The offline
`check` command enforces contiguous IDs for a final published manifest; resolve a
shortfall by reviewing reserved records, not by renumbering referenced records.
Do not allocate independently in a production bank and an offline manifest and expect
their curated IDs to agree: conflicting assignments deliberately abort imports.

## Offline manifest workflow

These commands require neither database credentials nor an AI key. Use `--bank`
to work on a copy instead of the checked-in manifest. Dataset commands use JSON IDs.
Imports take an array in the existing candidate schema:

```json
[
  {
    "question": "How many sides does a regular hexagon have?",
    "answer": 6,
    "unit": "count",
    "category": "mathematics",
    "difficulty": "easy",
    "explanation": "A hexagon is a polygon defined to have exactly six sides.",
    "sourceUrl": null,
    "referenceDate": null
  }
]
```

```sh
npm run questions -- generate --count 3 --offline --file candidates.json
npm run questions:dataset -- check
npm run --silent questions:dataset -- list --status generated
npm run --silent questions:dataset -- list --status validated
npm run --silent questions:dataset -- list --status curated
npm run questions:dataset -- import --file candidates.json
npm run questions:dataset -- validate 206
npm run questions:dataset -- curate 206 --reviewer 'editor' --verified-answer 6 \
  --source 'https://your-checked-reference.example/polygons' \
  --notes 'Replace this with actual factual, wording, difficulty and duplicate review notes.' \
  --independently-verified
npm run questions:dataset -- demote 206 --status generated \
  --notes 'The source has changed; the answer needs a fresh factual review.'
```

IDs above are examples; inspect `list` for actual IDs. Never use the example evidence
URL to claim factual verification. Imports are schema-screened, duplicate-checked and
stored as generated. Validation and curation are separate deliberate operations.
The optional first command makes one AI request and saves candidate JSON without
connecting to a database; it refuses to overwrite an existing file. Omit it when
importing your own candidates. It supplies no factual verification evidence.
Offline transitions store their validation and review timestamps in the manifest;
exports preserve these timestamps rather than inventing a new verification date.
`--bank /tmp/questions.json` applies to every dataset command. Writes replace the
manifest atomically after validation; serialize edits to the same manifest file.

Supported categories: `science`, `geography`, `history`, `culture` (including
entertainment), `sports`, `mathematics`, `technology`, `nature`, `human-body`, `everyday`.
Difficulties are `easy`, `medium`, `hard`. Count questions use `unit: "count"` and
“How many”; other units must appear literally in the wording. Changing facts need
an explicit YYYY-MM-DD date in both wording and `referenceDate`. Answers must be
finite, nonnegative, and no greater than `Number.MAX_SAFE_INTEGER`.

## Database operator workflow and AI

The existing protected operator CLI uses database primary keys, not JSON IDs or
curated IDs. It loads `.env` only on explicit invocation. It has no public write API.

```sh
npm run questions -- generate --count 3
npm run questions -- generate --count 3 --model provider/model-slug
npm run questions -- import --file candidates.json
npm run questions -- list --status generated
npm run questions -- list --status validated
npm run questions -- list --status curated
npm run questions -- list --status all
npm run questions -- validate 123
npm run questions -- curate 123 --reviewer 'editor' --verified-answer 6 \
  --source 'https://your-checked-reference.example/polygons' \
  --notes 'Replace this with actual factual, wording, difficulty and duplicate review notes.' \
  --independently-verified
npm run questions -- demote 123 --status generated --reviewer 'editor' \
  --notes 'Flagged after identifying a factual uncertainty requiring revalidation.'
```

Database imports accept one to five schema-valid candidates per call. AI generation
uses the existing OpenRouter integration, key, model configuration, bounded request
and structured-output schema. It makes no factual approval claims. The 195 additions
in this change were authored and source-checked during the coding task; no OpenRouter
requests were made to produce the shipped bank.

## Offline SQL export

The exporter reads the manifest, validates the entire input, selects a status,
and prints deterministic PostgreSQL to stdout. **Default: curated only.** It imports
no connection pool, loads no `.env`, and never executes SQL. Use `--silent` to suppress
npm's command banner when redirecting stdout; the Node script itself prints only SQL.

```sh
npm run --silent questions:export-sql > curated-questions.sql
npm run --silent questions:export-sql -- --status curated > curated-questions.sql
npm run --silent questions:export-sql -- --status validated > validated-questions.sql
npm run --silent questions:export-sql -- --status generated > generated-questions.sql
npm run --silent questions:export-sql -- --status all > all-questions.sql
npm run --silent questions:export-sql -- --input /tmp/questions.json --status all > candidates.sql
# Equivalent direct command without npm's banner:
node scripts/export-questions.mjs --status curated > curated-questions.sql
# Existing file-based command remains available:
npm run db:export:seed # writes db/exports/seed.sql, curated only
```

`--input` expects an offline manifest, including status and review metadata, rather
than the operator CLI's database-row listing. The shipped manifest has zero generated
or validated rows, so those filters initially produce empty valid transactions.

SQL uses `pg.escapeLiteral` for strings, explicit SQL nulls and fixed schema identifiers.
Dollar-quoted block delimiters are chosen to avoid collisions with record content.
Each file uses a transaction and writer lock. On an existing `seed_key`, content,
source metadata, status and curated ID must match; otherwise the whole import fails.
Identical imports preserve existing review timestamps and reviewer metadata. New
records let PostgreSQL allocate PKs. Unique text/curated-ID collisions raise errors,
including collisions with unrelated manually created records. No data export deletes
records, overwrites question content, updates an unrelated row, or resets a sequence.
A failed PostgreSQL transaction can still consume identity sequence numbers; gaps in
database PKs are normal and must not be repaired by reseeding.

## Existing production schema: manual compatibility steps

Production is not contacted by any build, test or SQL generation step.

1. Inspect the actual schema, constraints, sequence and dependent foreign keys, and
   review `db/upgrade-question-lifecycle.sql` against it. This upgrade supports the
   previous canonical schema with `verification_source_url`. It refuses older unknown
   layouts; reconcile those separately. A development `db:schema` run is not a production
   upgrade and intentionally refuses an incompatible existing table.
2. Review and manually apply that separate schema-update file. It adds `seed_key`,
   `curated_id`, `validated_at` and their constraints, expands categories, and replaces
   the old status constraints. PKs/content/FKs stay intact. Legacy `pending` and
   `rejected` become generated; review notes remain. Legacy `approved` becomes
   validated, preserving its old review evidence for inspection but clearing active
   factual verification. This conservative conversion temporarily removes those rows
   from gameplay until they are curated again. Plan the schema/data application in
   a maintenance window; the schema script takes an exclusive table lock.
3. Generate and review curated data SQL. For fresh or already matching curated rows,
   use the default export. For previously approved seed rows downgraded by the upgrade,
   explicitly opt into adoption of the checked-in factual reviews:

   ```sh
   npm run --silent questions:export-sql -- --status curated --promote-validated \
     > reviewed-curated-questions.sql
   ```

   This optional data file promotes **only validated seed records with exactly
   matching immutable content and a null or matching curated ID**. It changes review
   metadata/status/curated ID, never question content or database PKs. Review the
   evidence in the manifest before choosing this option: it intentionally also applies
   to locally demoted validated rows with matching content. Generated rows, changed
   content, occupied curated IDs and unrelated text collisions still abort. Default
   exports never promote or undo a demotion. The same flag is safe to repeat.
4. Review the full generated file, then execute it manually in PostgreSQL, stopping
   on errors (for example `psql -X --set ON_ERROR_STOP=1 --file reviewed-curated-questions.sql`
   against the database you explicitly selected). Schema and data are separate files
   and separate transactions. Inspect row counts, primary-key mapping and playable
   statuses before reopening gameplay. No deployment automation is provided.

`db:export:schema` is an existing **destructive fresh-database/reset export**, containing
`DROP TABLE`. Never use it as a production upgrade. Production uses the additive
upgrade file above. The normal `db:seed` command also refuses content/status conflicts;
it does not automatically adopt legacy reviews. Use the reviewed SQL option for that
specific manual import.

After a manual database reset, create the current schema with `npm run db:schema`
before running `npm run db:seed`. If you recreate the table from exported SQL,
first regenerate it with `npm run db:export:schema`: ignored files under
`db/exports/` are snapshots and can retain an older schema after a code update.
PostgreSQL error `42703` means a referenced column is absent. The seed command now
checks the required columns before inserting and reports `QUESTION_SCHEMA_MISMATCH`
with the missing names. `CREATE TABLE IF NOT EXISTS` cannot add columns to an
existing old table; use the separate reviewed upgrade for that case.

## Verification and factual limits

`npm test` checks lifecycle, dataset, exporter and existing game/API behavior.
`npm run test:db:local` creates and destroys its own UTF-8 PostgreSQL cluster without
loading `.env`; it checks real SQL parsing, repeat imports, conflicts, history/FK
preservation, escaping, legacy upgrade/adoption, concurrency and API eligibility.
It requires local PostgreSQL binaries (`PG_BIN` can select their directory).
`npm run test:db` is the separate opt-in read-only check against `.env`; never use it
as a substitute for the isolated tests or run it against production automatically.

[Dataset audit](question-curation-report.md) records the source review, counts,
excluded draft and remaining limitations. Tests prove structural/workflow properties;
they do not automatically re-check websites or independently establish factual truth.
