// Owns a fresh temporary cluster; never loads .env or production credentials.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import bank from '../db/seed/questions.json' with { type: 'json' };
import { applySchema } from '../db/schema.mjs';
import { seedQuestions } from '../db/seed.mjs';
import { createSeedSQL } from '../db/export-seed.mjs';
import { storeCandidates, reviewQuestion } from '../db/question-repository.mjs';
import { getPool } from '../db/pool.mjs';
import { getQuestions, challengeQuestion } from '../src/server/questions.mjs';
import { GET } from '../src/app/api/questions/route.js';
const candidate = { question: 'How many sides does a regular hexagon have?', answer: 6, unit: 'count', category: 'mathematics', difficulty: 'easy', explanation: 'A hexagon is a polygon defined to have exactly six sides.', sourceUrl: null, referenceDate: null };
const evidence = { reviewer: 'test-reviewer', notes: 'Test-only evidence; validates workflow mechanics, not an external factual review.', sourceUrl: 'https://example.org/polygons', verifiedAnswer: 6, independentlyVerified: true };
it('exercises canonical schema, SQL imports, upgrades and gameplay in isolated PostgreSQL', { timeout: 60000 }, async t => {
  const bin = process.env.PG_BIN || execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim();
  const directory = await mkdtemp(join(tmpdir(),'no-way-postgres-')), data = join(directory,'data');
  const command = (name,args) => execFileSync(join(bin,name),args,{encoding:'utf8',stdio:'pipe'});
  let started=false, client, appPool;
  const previous={ url:process.env.DATABASE_URL, mode:process.env.NODE_ENV };
  t.after(async()=>{
    await appPool?.end(); await client?.end();
    if(started) command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);
    await rm(directory,{recursive:true,force:true});
    if(previous.url===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previous.url;
    if(previous.mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.mode;
  });
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  command('initdb',['-D',data,'-U','question_test','-A','trust','--no-locale','--encoding=UTF8']);
  command('pg_ctl',['-D',data,'-l',join(directory,'server.log'),'-o',`-F -h 127.0.0.1 -p ${port} -k ${directory}`,'-w','start']);started=true;
  process.env.DATABASE_URL=`postgres://question_test@127.0.0.1:${port}/postgres`;process.env.NODE_ENV='test';
  client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();appPool=getPool();
  const scalar=async(sql,params)=>(await client.query(sql,params)).rows[0];
  const rolledBack=async(sql,code)=>{try{await assert.rejects(client.query(sql),{code});}finally{await client.query('ROLLBACK');}};
  await t.test('fresh schema export supports initial seeding and repeat seeding after a manual reset',async()=>{
    const output=join(directory,'fresh-schema.sql');
    execFileSync(process.execPath,['db/export-schema.mjs',output],{stdio:'pipe'});
    await client.query(await readFile(output,'utf8'));
    assert.deepEqual(await seedQuestions(client),{inserted:bank.length,updated:0,unchanged:0});
    assert.deepEqual(await seedQuestions(client),{inserted:0,updated:0,unchanged:bank.length});
    await client.query('DROP TABLE public.questions');
  });
  await t.test('imports 200 rows twice with stable identities, preserves unrelated referenced records and identity high water',async()=>{
    await applySchema(client);await applySchema(client);
    await client.query("INSERT INTO public.questions(id,question,answer) VALUES (9000,'An unrelated historical question?',42)");
    await client.query("SELECT setval('public.questions_id_seq', 10000, true)");
    await client.query('CREATE TABLE public.history (question_id integer REFERENCES public.questions(id))');
    await client.query('INSERT INTO public.history VALUES (9000)');
    await client.query(createSeedSQL());
    const before=(await client.query('SELECT id,seed_key,curated_id FROM public.questions ORDER BY id')).rows;
    assert.equal(before.length,bank.length+1);assert.ok(before.filter(r=>r.seed_key).every(r=>r.id>10000));
    await client.query(createSeedSQL());assert.deepEqual((await client.query('SELECT id,seed_key,curated_id FROM public.questions ORDER BY id')).rows,before);
    assert.equal((await scalar('SELECT question FROM public.questions WHERE id=9000')).question,'An unrelated historical question?');
    assert.equal((await scalar('SELECT count(*)::integer n FROM public.history')).n,1);
    assert.deepEqual(await seedQuestions(client),{inserted:0,updated:0,unchanged:bank.length});
    assert.deepEqual((await getQuestions()).map(row=>row.curatedId),bank.map(row=>row.curatedId));
    const payload=await (await GET(new Request('http://localhost/api/questions'))).json();assert.equal(payload.questions.length,1);
    assert.ok(payload.questions.every(row=>!('status'in row)&&!('answer'in row)&&!('review'in row)&&!('src'in row)));
  });
  await t.test('content, lifecycle, curated ID and normalized-text conflicts abort whole imports without overwriting history',async()=>{
    const first=await scalar("SELECT id FROM public.questions WHERE seed_key='predefined:1'");
    await client.query('INSERT INTO public.history VALUES ($1)',[first.id]);
    await client.query('UPDATE public.questions SET answer=42 WHERE id=$1',[first.id]);
    await rolledBack(createSeedSQL(),'P0001');assert.equal(Number((await scalar('SELECT answer FROM public.questions WHERE id=$1',[first.id])).answer),42);
    await client.query('UPDATE public.questions SET answer=$2 WHERE id=$1',[first.id,bank[0].answer]);
    await client.query("UPDATE public.questions SET status='generated',verified_at=NULL WHERE id=$1",[first.id]);
    await rolledBack(createSeedSQL(),'P0001');assert.equal((await scalar('SELECT status FROM public.questions WHERE id=$1',[first.id])).status,'generated');
    await client.query("UPDATE public.questions SET status='curated',verified_at=reviewed_at WHERE id=$1",[first.id]);
    const other={...bank[0],id:9999,question:'How many unique test markers appear in this count question?',unit:'count',answer:'1',review:{...bank[0].review,verifiedAnswer:1}};
    await rolledBack(createSeedSQL([other]),'23505');
    const duplicate={...bank[0],id:9998,curatedId:9998};await rolledBack(createSeedSQL([duplicate]),'23505');
  });
  await t.test('status-specific SQL round trips quotes, Unicode, nulls, backslashes and dollar delimiters',async()=>{
    const row={...bank[0],id:8000,curatedId:undefined,status:'generated',review:null,src:null,'src-label':null,
      question:"What's São Paulo’s $question_import$ C:\\path in million kilometers?",explanation:"Literal Unicode and apostrophe: café’s \\ path; $question_import$ stays inside text."};
    await client.query(createSeedSQL([row],{status:'generated'}));await client.query(createSeedSQL([row],{status:'all'}));
    const stored=await scalar("SELECT question,source_url,curated_id,answer_context FROM public.questions WHERE seed_key='predefined:8000'");
    assert.equal(stored.question,row.question);assert.equal(stored.answer_context,row.explanation);assert.equal(stored.source_url,null);assert.equal(stored.curated_id,null);
    await client.query(createSeedSQL([row],{status:'validated'}));
  });
  await t.test('reviewed legacy promotion is opt-in, content-checked, repeatable and preserves primary keys',async()=>{
    const row={...bank[0],id:8100,curatedId:8100,question:'According to the test reference, what is the fixture length in million kilometers?'};
    await client.query(createSeedSQL([{...row,status:'validated',review:null,curatedId:undefined}],{status:'validated'}));
    const before=await scalar("SELECT id FROM public.questions WHERE seed_key='predefined:8100'");
    await rolledBack(createSeedSQL([row]),'P0001');
    await client.query(createSeedSQL([row],{promoteValidated:true}));
    await client.query(createSeedSQL([row],{promoteValidated:true}));
    const after=await scalar("SELECT id,status,curated_id FROM public.questions WHERE seed_key='predefined:8100'");
    assert.equal(after.id,before.id);assert.equal(after.status,'curated');assert.equal(after.curated_id,8100);
    await client.query("UPDATE public.questions SET status='generated',verified_at=NULL WHERE id=$1",[before.id]);
    await rolledBack(createSeedSQL([row],{promoteValidated:true}),'P0001');
    // Leave the reserved ID small enough for the following next-ID assertion.
    await client.query('DELETE FROM public.questions WHERE id=$1',[before.id]);
  });
  let id;
  await t.test('generated and validated questions remain unplayable; curation and demotion preserve references',async()=>{
    const result=await storeCandidates(client,[candidate,candidate,{...candidate,answer:NaN}],'test/model');
    assert.equal(result.stored.length,1);assert.equal(result.failures.length,2);id=result.stored[0].id;
    assert.equal(result.stored[0].status,'generated');await assert.rejects(challengeQuestion(id,7),{code:'QUESTION_UNAVAILABLE'});
    await assert.rejects(reviewQuestion(client,id,'curated',evidence),{code:'INVALID_TRANSITION'});
    await reviewQuestion(client,id,'validated');await assert.rejects(challengeQuestion(id,7),{code:'QUESTION_UNAVAILABLE'});
    await assert.rejects(reviewQuestion(client,id,'curated',{...evidence,verifiedAnswer:7}),{code:'ANSWER_MISMATCH'});
    const curated=await reviewQuestion(client,id,'curated',evidence);assert.equal(curated.curatedId,bank.length+1);
    assert.equal((await challengeQuestion(id,7)).answer,6);
    await client.query('INSERT INTO public.history VALUES ($1)',[id]);
    await reviewQuestion(client,id,'generated',{reviewer:'tester',notes:'Flagged for revalidation after a test-only factual concern.'});
    await assert.rejects(challengeQuestion(id,7),{code:'QUESTION_UNAVAILABLE'});
    await reviewQuestion(client,id,'validated');assert.equal((await reviewQuestion(client,id,'curated',evidence)).curatedId,curated.curatedId);
    assert.equal((await scalar('SELECT count(*)::integer n FROM public.history WHERE question_id=$1',[id])).n,1);
  });
  await t.test('database constraints reject invalid numeric values and incomplete curation',async()=>{
    for(const answer of ['NaN','Infinity','-Infinity','-1','9007199254740992'])await assert.rejects(client.query("INSERT INTO public.questions(question,answer) VALUES ('Invalid numeric test?', $1::numeric)",[answer]),{code:'23514'});
    await assert.rejects(client.query("UPDATE public.questions SET status='curated' WHERE id=9000"),{code:'23514'});
  });
  await t.test('concurrent candidate writes serialize duplicate checks',async()=>{
    const left=await appPool.connect(),right=await appPool.connect();
    try {
      const next={...candidate,question:'How many sides does a regular nonagon have?',answer:9};
      const reports=await Promise.all([storeCandidates(left,[next],'test/model'),storeCandidates(right,[next],'test/model')]);
      assert.equal(reports.reduce((n,r)=>n+r.stored.length,0),1);assert.equal(reports.reduce((n,r)=>n+r.failures.length,0),1);
    } finally {left.release();right.release();}
  });
  await t.test('upgrade is separate, repeatable and preserves legacy PKs and foreign keys while requiring re-review',async()=>{
    await client.query('DROP TABLE public.history');await client.query('DROP TABLE public.questions');
    const legacy=await readFile(new URL('./fixtures/questions-pre-curation.sql',import.meta.url),'utf8');await client.query(legacy);
    await rolledBack(createSeedSQL(),'42703');
    await assert.rejects(seedQuestions(client),error=>{
      assert.equal(error.code,'QUESTION_SCHEMA_MISMATCH');
      assert.deepEqual(error.missingColumns,['seed_key','curated_id','validated_at']);return true;
    });
    await client.query("INSERT INTO public.questions(id,question,answer,origin,status) VALUES (51,'Legacy generated example?',1,'manual','pending')");
    await client.query("INSERT INTO public.questions(id,question,answer,origin,status,verified_at,reviewed_at,reviewed_by,review_notes,verification_source_url) VALUES (88,'Legacy approved example?',2,'seed','approved',now(),now(),'reviewer','Legacy factual and quality notes.','https://example.org/legacy')");
    await client.query('CREATE TABLE public.history(question_id integer REFERENCES public.questions(id))');await client.query('INSERT INTO public.history VALUES (88)');
    const upgrade=await readFile(new URL('../db/upgrade-question-lifecycle.sql',import.meta.url),'utf8');
    await client.query(upgrade);await client.query(upgrade);await applySchema(client);
    const rows=(await client.query('SELECT id,status,seed_key,verified_at FROM public.questions ORDER BY id')).rows;
    assert.deepEqual(rows,[{id:51,status:'generated',seed_key:null,verified_at:null},{id:88,status:'validated',seed_key:'predefined:88',verified_at:null}]);
    assert.equal((await scalar('SELECT question_id FROM public.history')).question_id,88);
  });
});
