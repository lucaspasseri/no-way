import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { runTraceCommand } from './openrouter-traces.mjs';

const id = 'c04f337b-1cb4-4ce3-947b-71c89d73518e';
it('inspects operator diagnostics using read-only transactions and bound filters', async () => {
  for (const args of [['list','--http-status','429','--error','rate_limit','--since','2026-11-01','--group-by','pack'], ['show',id]]) {
    const calls = [];
    const result = await runTraceCommand(args, async () => ({
      query: async (sql, values) => { calls.push({sql, values}); return { rows: sql.startsWith('SELECT') ? [{ details: { id }, packId: id }] : [] }; },
      release: () => calls.push({sql:'RELEASE'}),
    }));
    assert.equal(calls[0].sql, 'BEGIN READ ONLY'); assert.equal(calls.at(-2).sql,'COMMIT'); assert.equal(calls.at(-1).sql,'RELEASE');
    assert.ok(!calls.some(call=>/INSERT|UPDATE|DELETE/.test(call.sql)));
    assert.ok(result);
    if(args[0]==='show')assert.equal(result.id,id);
  }
});
it('rejects malformed or unauthorised commands before attempting database access', async () => {
  for(const args of [[],['show','invalid'],['list','--status','any'],['list','--http-status','bad'],['list','--limit','1001'],
    ['list','--pack',"';DROP TABLE traces"],['list','--since','yesterday'],['list','--group-by','model'],['cleanup','--model','x'],['delete',id],['list','--sql','SELECT 1']]) {
    await assert.rejects(runTraceCommand(args,async()=>{assert.fail('Invalid arguments must not connect');}));
  }
});
it('exposes no diagnostics when operator database credentials are unavailable', () => {
  const result=spawnSync(process.execPath,['scripts/openrouter-traces.mjs','list'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:''},encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/trusted database access/);
});
it('runs retention cleanup only as an explicit operator command',async()=>{
  const calls=[];
  const result=await runTraceCommand(['cleanup','--limit','50'],async()=>({
    query:async(sql,values)=>{calls.push({sql,values});return{rowCount:4}},release:()=>{},
  }));
  assert.deepEqual(result,{removed:4});assert.equal(calls[0].sql,'BEGIN');
  assert.deepEqual(calls.find(call=>call.sql.startsWith('DELETE')).values,[50]);
});

it('inspects one correlated recovery and cleans expired operational cooldowns separately',async()=>{
  const calls=[];
  const client={query:async(sql,values)=>{calls.push({sql,values});return{rows:[],rowCount:2}},release:()=>{}};
  assert.equal(await runTraceCommand(['recovery',id],async()=>client),null);
  assert.equal(calls[0].sql,'BEGIN READ ONLY');
  assert.deepEqual(calls.find(call=>call.sql.includes("details#>>'{recovery,id}'")).values,[id]);
  calls.length=0;
  assert.deepEqual(await runTraceCommand(['cleanup-cooldowns','--limit','10'],async()=>client),{removed:2});
  assert.equal(calls[0].sql,'BEGIN');assert.deepEqual(calls.find(call=>call.sql.startsWith('DELETE')).values,[10]);
});
