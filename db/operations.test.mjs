import { it } from 'node:test';
import assert from 'node:assert/strict';
import { applySchema, assertQuestionSchema } from './schema.mjs';
import { questionColumns } from './seed-statements.mjs';
import { assertResetAllowed, seedQuestions } from './seed.mjs';
import bank from './seed/questions.json' with { type:'json' };
it('initializes the canonical non-destructive lifecycle schema',async()=>{
 let sql; await applySchema({query:async text=>{sql=text;}});
 assert.match(sql,/CREATE TABLE IF NOT EXISTS/);assert.match(sql,/curated_id integer UNIQUE/);assert.match(sql,/'generated', 'validated', 'curated'/);assert.doesNotMatch(sql,/\bDROP\b|TRUNCATE|DELETE/);
});
it('seeds with the same guarded SQL as offline exports and rolls back conflicts',async()=>{
 for(const fail of [false,true]) {
  const calls=[];let counts=0;
  const client={query:async sql=>{calls.push(sql);if(sql.includes('information_schema.columns'))return {rows:['id',...questionColumns,'created_at','updated_at'].map(column_name=>({column_name}))};if(sql.startsWith('SELECT count'))return {rows:[{count:counts++?bank.length:0}]};if(fail&&sql.startsWith('DO '))throw new Error('conflict');return {rows:[]};}};
  if(fail) {await assert.rejects(seedQuestions(client));assert.equal(calls.at(-1),'ROLLBACK');}
  else {assert.deepEqual(await seedQuestions(client),{inserted:bank.length,updated:0,unchanged:0});assert.equal(calls.at(-1),'COMMIT');}
  assert.doesNotMatch(calls.join('\n'),/DO UPDATE|setval|DELETE/);
 }
});
it('reports missing schema columns before seed writes and leaves legacy tables unchanged',async()=>{
 const missing=['seed_key','curated_id','validated_at'];
 const calls=[];
 const client={query:async sql=>{calls.push(sql);return {rows:['id',...questionColumns,'created_at','updated_at'].filter(name=>!missing.includes(name)).map(column_name=>({column_name}))};}};
 await assert.rejects(seedQuestions(client),error=>{
  assert.equal(error.code,'QUESTION_SCHEMA_MISMATCH');assert.deepEqual(error.missingColumns,missing);
  assert.match(error.message,/db\/upgrade-question-lifecycle.sql/);return true;
 });
 assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(sql=>sql.includes('INSERT INTO')||sql.includes('ALTER TABLE')||sql.includes('DROP TABLE')));
 await assert.rejects(assertQuestionSchema({query:async()=>({rows:[]})}),{code:'QUESTION_SCHEMA_MISMATCH'});
});
it('invalid data and production resets are refused before database access',async()=>{
 const client={query:async()=>{throw new Error('must not connect');}};
 await assert.rejects(seedQuestions(client,{bank:[{...bank[0],status:'approved'}]}),{code:'INVALID_STATUS'});
 for(const environment of ['production','','staging'])assert.throws(()=>assertResetAllowed({environment,confirmed:true}));
 assert.throws(()=>assertResetAllowed({environment:'development',confirmed:false}));
});
