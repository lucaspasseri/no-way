// Explicit, read-only checks against the single database from .env.
import { it, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool } from './pool.mjs';
import { getQuestions } from '../src/server/questions.mjs';
import questions from './seed/questions.json' with { type: 'json' };

const pool = getPool();
after(() => pool.end());

it('connects to PostgreSQL and finds the initialized schema and constraints', async () => {
  const { rows } = await pool.query(`SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions'`);
  const columns = Object.fromEntries(rows.map(row => [row.column_name, row.data_type]));
  assert.equal(columns.id, 'integer');
  assert.equal(columns.answer, 'numeric');
  assert.equal(columns.created_at, 'timestamp with time zone');
  const { rows: constraints } = await pool.query(`SELECT contype FROM pg_constraint WHERE conrelid = 'public.questions'::regclass`);
  assert.ok(constraints.some(row => row.contype === 'p'));
  assert.ok(constraints.filter(row => row.contype === 'c').length >= 5);
});

it('retrieves seeded curated questions with compatible IDs, answers, and metadata', async () => {
  const actual = await getQuestions();
  for (const question of questions) {
    const found = actual.find(row => row.curatedId === question.curatedId);
    assert.ok(found); assert.equal(found.origin, 'seed');
    for (const key of ['question','answer','category','unit','difficulty','explanation','src','src-label','status']) assert.equal(found[key], question[key]);
  }
  assert.equal(new Set(actual.map(question => question.id)).size, actual.length);
  const { rows } = await pool.query('SELECT id, status FROM public.questions ORDER BY id');
  assert.deepEqual(actual.map(question => question.id), rows.filter(row => row.status === 'curated').map(row => row.id));
});
