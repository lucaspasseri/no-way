import { it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import questions from './seed/questions.json' with { type: 'json' };
import { createSeedSQL, sqlLiteral } from './export-seed.mjs';
const mixed = [questions[0], { ...questions[1], status: 'validated', review: null, curatedId: undefined }, { ...questions[2], status: 'generated', review: null, curatedId: undefined }];
it('exports each status, defaults to curated, validates the whole input and sorts deterministically', () => {
  assert.equal((createSeedSQL(mixed).match(/INSERT INTO/g)||[]).length,1);
  for (const status of ['curated','validated','generated']) assert.equal((createSeedSQL(mixed,{status}).match(/INSERT INTO/g)||[]).length,1);
  assert.equal((createSeedSQL(mixed,{status:'all'}).match(/INSERT INTO/g)||[]).length,3);
  assert.equal(createSeedSQL([...questions].reverse()),createSeedSQL());
  assert.throws(()=>createSeedSQL(mixed,{status:'pending'}));
  for (const input of [[], [{...questions[0],answer:'Infinity'}], [{...questions[0],status:'validated',review:null,unit:''}]]) assert.throws(()=>createSeedSQL(input));
});
it('serializes apostrophes, Unicode, backslashes, nullable fields and hostile dollar delimiters with pg literals', () => {
  const row={...questions[0],question:"What's the length of São Paulo’s $question_import$ C:\\data in million kilometers?",status:'generated',review:null,curatedId:undefined,src:null};
  const sql=createSeedSQL([row],{status:'all'});
  assert.ok(sql.includes(sqlLiteral(row.question))); assert.ok(sql.includes('São Paulo'));
  assert.ok(sql.includes('DO $question_import_$')); assert.ok(sql.includes('NULL'));
  assert.equal(sqlLiteral(null),'NULL'); assert.throws(()=>sqlLiteral('nul\0byte'));
  assert.throws(()=>sqlLiteral('\ud800'));
});
it('never assigns primary keys, rewrites content, resets sequences or deletes records', () => {
  const sql=createSeedSQL();
  assert.match(sql,/IS NOT DISTINCT FROM/); assert.match(sql,/RAISE EXCEPTION/); assert.match(sql,/seed_key/);
  assert.doesNotMatch(sql,/INSERT INTO public.questions \(id|DO UPDATE|setval|DELETE FROM|DROP TABLE|TRUNCATE/);
  assert.match(sql,/BEGIN;\nLOCK TABLE/); assert.ok(sql.endsWith('COMMIT;\n'));
});
it('prints only SQL without credentials or database access, and supports the older file export command', async t => {
  const env={...process.env,DATABASE_URL:'postgres://invalid:invalid@invalid.invalid/invalid'};
  for (const args of [[],['--status','all'],['--status','validated'],['--status','generated']]) {
    const result=spawnSync(process.execPath,['scripts/export-questions.mjs',...args],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/^-- Question data only;/); assert.equal(result.stderr,'');
  }
  const invalid=spawnSync(process.execPath,['scripts/export-questions.mjs','--status','oops'],{env,encoding:'utf8'});
  assert.equal(invalid.status,1); assert.equal(invalid.stdout,'');
  const directory=await mkdtemp(join(tmpdir(),'question-sql-')); t.after(()=>rm(directory,{recursive:true,force:true}));
  const output=join(directory,'seed.sql');
  const result=spawnSync(process.execPath,['db/export-seed.mjs',output],{env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); assert.equal(await readFile(output,'utf8'),createSeedSQL());
  const schemaOutput=join(directory,'schema.sql');
  const schemaResult=spawnSync(process.execPath,['db/export-schema.mjs',schemaOutput],{env,encoding:'utf8'});
  assert.equal(schemaResult.status,0,schemaResult.stderr);
  const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
  assert.ok((await readFile(schemaOutput,'utf8')).includes(schema));
});
