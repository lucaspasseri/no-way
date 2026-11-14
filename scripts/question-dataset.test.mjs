import { it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bank from '../db/seed/questions.json' with { type: 'json' };
it('offline CLI imports, validates, curates, demotes and preserves identities without database credentials',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'question-manifest-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'bank.json'),input=join(dir,'candidates.json');await writeFile(file,JSON.stringify([bank[0]]));
 const candidate={question:'How many sides does a regular hexagon have?',answer:6,unit:'count',category:'mathematics',difficulty:'easy',explanation:'A hexagon is a polygon defined to have exactly six sides.',sourceUrl:null,referenceDate:null};
 await writeFile(input,JSON.stringify([candidate]));
 const run=(...args)=>spawnSync(process.execPath,['scripts/question-dataset.mjs','--bank',file,...args],{encoding:'utf8',env:{...process.env,DATABASE_URL:'invalid'}});
 const success=(...args)=>{const r=run(...args);assert.equal(r.status,0,r.stderr);return r;};
 const read=async()=>JSON.parse(await readFile(file,'utf8'));
 success('import','--file',input);assert.equal((await read())[1].status,'generated');assert.equal((await read())[1].curatedId,undefined);
 assert.equal(run('import','--file',input).status,1);assert.equal((await read()).length,2);
 assert.equal(run('curate','2').status,1);
 success('validate','2');assert.equal((await read())[1].status,'validated');assert.equal((await read())[1].review,null);
 const evidence=['--reviewer','test-reviewer','--verified-answer','6','--source','https://example.org/test-only',
  '--notes','Test-only fixture evidence for checking workflow mechanics; no external review is claimed.','--independently-verified'];
 success('curate','2',...evidence);assert.equal((await read())[1].curatedId,2);
 assert.equal(JSON.parse(success('list','--status','curated').stdout).length,2);
 success('demote','2','--status','generated','--notes','Test-only concern flagged for factual revalidation.');
 assert.equal((await read())[1].curatedId,2);assert.equal((await read())[1].review,null);
 success('validate','2');success('curate','2',...evidence);success('check');
 assert.equal((await read())[1].curatedId,2);
 const before=await readFile(file,'utf8');assert.equal(run('demote','2','--status','all').status,1);assert.equal(await readFile(file,'utf8'),before);
});
