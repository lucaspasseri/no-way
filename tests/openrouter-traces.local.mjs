import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { temporaryPostgres } from './temporary-postgres.mjs';
import { applyTraceSchema } from '../db/schema.mjs';
import { closeTracePool, listTraces, cleanupTraces } from '../db/openrouter-traces.mjs';
import { runTraceCommand } from '../scripts/openrouter-traces.mjs';
import { createLabService } from '../src/server/question-lab.mjs';
import { advanceGeneration } from '../src/server/lab-generation.mjs';
import { defaultLabConfig } from '../src/features/lab/config.mjs';
import { labCandidates } from './fixtures/lab-candidates.mjs';
import { openrouterResponse } from './fixtures/openrouter-responses.mjs';

it('persists HTTP outcomes across connection restarts, transaction rollbacks, retention and private access', { timeout: 60000 }, async t => {
  const db=await temporaryPostgres();
  const previous={url:process.env.DATABASE_URL,key:process.env.OPENROUTER_API_KEY,mode:process.env.NODE_ENV};
  process.env.DATABASE_URL=db.connectionString;process.env.OPENROUTER_API_KEY='isolated-tracing-key';process.env.NODE_ENV='test';
  t.after(async()=>{
    await closeTracePool();await db.close();
    for(const [key,value] of Object.entries({DATABASE_URL:previous.url,OPENROUTER_API_KEY:previous.key,NODE_ENV:previous.mode})){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  });
  await applyTraceSchema(db.pool);await applyTraceSchema(db.pool);
  const packId=randomUUID(),initial={questions:[],attempts:0,rejected:0,status:'generating',lastError:null,reports:[]};
  let fail=true;
  const transport=mock.method(globalThis,'fetch',async()=>fail?Response.json({error:{code:429,message:'Original provider diagnostic',metadata:{limit_source:'openrouter_free_tier_daily'}}},
    {status:429,headers:{'Retry-After':'60','X-RateLimit-Reset':'1900000000'}})
    :Response.json(openrouterResponse(JSON.stringify({candidates:labCandidates.slice(0,2)}))));
  t.after(()=>transport.mock.restore());
  const client=await db.pool.connect();
  await client.query('BEGIN');
  await client.query('INSERT INTO public.question_lab_packs(id,owner_hash,config,data) VALUES ($1,$2,$3::jsonb,$4::jsonb)',[packId,'rollback-test-owner',JSON.stringify(defaultLabConfig),JSON.stringify(initial)]);
  const first=await advanceGeneration(defaultLabConfig,initial,[],undefined,{packId});
  await client.query('ROLLBACK');client.release();
  assert.equal(first.lastErrorCode,'AI_RATE_LIMIT');
  assert.equal((await db.pool.query('SELECT count(*)::integer AS n FROM public.question_lab_packs WHERE id=$1',[packId])).rows[0].n,0,'Pack data rolled back independently of its trace');
  let rows=await listTraces(db.pool,{pack:packId});
  assert.equal(rows.length,1);assert.equal(rows[0].httpStatus,429);
  const id=rows[0].id;
  const saved=await listTraces(db.pool,{id});
  assert.equal(saved.rateLimit.kind,'free_tier_daily');assert.equal(saved.error.message,'Original provider diagnostic');
  assert.equal(saved.http.headers['retry-after'],'60');assert.equal(saved.validation.received,null);
  assert.equal(saved.request.models.length>=1,true);
  await closeTracePool();
  const reconnected=new pg.Client({connectionString:db.connectionString});await reconnected.connect();
  assert.equal((await listTraces(reconnected,{id})).id,id);await reconnected.end();
  fail=false;
  first.errorDetails.rateLimit.resetAt=first.errorDetails.rateLimit.retryAt='2020-01-01T00:00:00.000Z';
  const second=await advanceGeneration(defaultLabConfig,first,[],undefined,{packId});
  assert.equal(second.questions.length,2);assert.equal(second.attempts,2);
  rows=await listTraces(db.pool,{pack:packId});assert.equal(rows.length,2);assert.equal(transport.mock.callCount(),2);
  assert.deepEqual(rows.map(row=>row.attempt).sort(),[1,2]);
  assert.equal((await listTraces(db.pool,{groupByPack:true}))[0].requests,2);
  const service=createLabService({pool:()=>db.pool,options:async()=>({categories:['science','mathematics']})});
  const actualPack=await service.create(randomUUID(),'trusted-test-owner',defaultLabConfig);
  const generatedPack=await service.advance(actualPack.id,'trusted-test-owner',0);
  assert.equal(generatedPack.accepted,2);
  assert.equal((await listTraces(db.pool,{pack:actualPack.id})).length,1,'Real Lab orchestration supplies the pack correlation');
  assert.ok(!JSON.stringify(generatedPack).includes('responseSnapshot'));
  assert.ok(generatedPack.questions.every(question=>!('answer' in question)&&!('trace' in question)));
  const inspected=await runTraceCommand(['show',id],()=>db.pool.connect());assert.equal(inspected.id,id);
  await db.pool.query('CREATE ROLE trace_test_player NOLOGIN');
  await db.pool.query('GRANT USAGE ON SCHEMA public TO trace_test_player');
  const untrusted=await db.pool.connect();
  try{
    await untrusted.query('SET ROLE trace_test_player');
    await assert.rejects(untrusted.query('SELECT * FROM public.openrouter_request_traces'),{code:'42501'});
    await untrusted.query('RESET ROLE');
    await db.pool.query('GRANT SELECT ON public.openrouter_request_traces TO trace_test_player');
    await untrusted.query('SET ROLE trace_test_player');
    assert.deepEqual((await untrusted.query('SELECT * FROM public.openrouter_request_traces')).rows,[],'RLS protects even accidental SELECT grants');
  }finally{await untrusted.query('RESET ROLE');untrusted.release();}
  await db.pool.query("UPDATE public.openrouter_request_traces SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[id]);
  assert.equal(await listTraces(db.pool,{id}),null);
  assert.equal(await cleanupTraces(db.pool,1),1);assert.equal((await listTraces(db.pool,{pack:packId})).length,1);
});
