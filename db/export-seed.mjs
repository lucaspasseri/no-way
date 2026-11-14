import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import questions from './seed/questions.json' with { type: 'json' };
import { validateBank, assertStatus } from './question-lifecycle.mjs';
import { questionValues, questionColumns, comparedColumns } from './seed-statements.mjs';

export function sqlLiteral(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string' || value.includes('\0') || !value.isWellFormed()) throw new Error('Invalid SQL literal.');
  return pg.escapeLiteral(value);
}

/** Offline, fixed identifiers, pg literal serialization, no database imports. */
export function createSeedSQL(bank = questions, { status = 'curated', transaction = true, promoteValidated = false } = {}) {
  assertStatus(status, true); validateBank(bank);
  const selected = bank.filter(row => status === 'all' || row.status === status).sort((a, b) => a.id - b.id);
  const statements = selected.map(row => {
    const values = questionValues(row).map(sqlLiteral);
    const literals = Object.fromEntries(questionColumns.map((name, i) => [name, values[i]]));
    const tuple = comparedColumns.map(name => `q.${name}`).join(', ');
    const expected = comparedColumns.map(name => `${literals[name]}${name === 'answer' ? '::numeric' : name === 'reference_date' ? '::date' : ''}`).join(', ');
    const same = names => names.map(name => `q.${name} IS NOT DISTINCT FROM ${literals[name]}${name === 'answer' ? '::numeric' : name === 'reference_date' ? '::date' : ''}`).join(' AND ');
    const promotion = promoteValidated && row.status === 'curated' ? `
      IF EXISTS (SELECT 1 FROM public.questions q WHERE q.seed_key = ${literals.seed_key}
        AND q.status = 'validated' AND (q.curated_id IS NULL OR q.curated_id = ${literals.curated_id})
        AND ${same(comparedColumns.filter(name => !['status', 'curated_id'].includes(name)))}) THEN
        UPDATE public.questions SET status = 'curated', curated_id = ${literals.curated_id},
          verified_at = ${literals.verified_at}::timestamptz, reviewed_at = ${literals.reviewed_at}::timestamptz,
          reviewed_by = ${literals.reviewed_by}, review_notes = ${literals.review_notes},
          verification_source_url = ${literals.verification_source_url}, updated_at = CURRENT_TIMESTAMP
          WHERE seed_key = ${literals.seed_key};
      ELSE
        RAISE EXCEPTION 'Reviewed promotion conflict for dataset identity ${row.id}.';
      END IF;` : `
      RAISE EXCEPTION 'Question import conflict for dataset identity ${row.id}; review content, status and curated ID manually.';`;
    const body = `BEGIN
  IF EXISTS (SELECT 1 FROM public.questions q WHERE q.seed_key = ${literals.seed_key}) THEN
    IF NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.seed_key = ${literals.seed_key}
      AND ROW(${tuple}) IS NOT DISTINCT FROM ROW(${expected})) THEN
${promotion}
    END IF;
  ELSE
    INSERT INTO public.questions (${questionColumns.join(', ')})
    VALUES (${values.join(', ')});
  END IF;
END;`;
    let delimiter = '$question_import$';
    while (body.includes(delimiter)) delimiter = delimiter.slice(0, -1) + '_$';
    return `DO ${delimiter}\n${body}\n${delimiter};`;
  });
  if (!transaction) return statements.join('\n\n');
  // Existing identity sequence is never reset or assigned dataset IDs.
  return `-- Question data only; apply the separately reviewed lifecycle schema first.
-- ${selected.length} ${status} questions. Conflicts abort the entire transaction.
BEGIN;
LOCK TABLE public.questions IN SHARE ROW EXCLUSIVE MODE;
${statements.join('\n\n')}
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = resolve(process.argv[2] || 'db/exports/seed.sql');
    const sql = createSeedSQL();
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, sql, 'utf8');
    console.log(`Seed SQL written to ${output}`);
  } catch (error) { console.error('Seed SQL export failed:', error.message); process.exitCode = 1; }
}
