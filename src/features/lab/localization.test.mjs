import { it } from 'node:test';
import assert from 'node:assert/strict';
import { labConfigSchema, defaultLabConfig } from './config.mjs';
import { screenLabCandidate, advanceGeneration } from '../../server/lab-generation.mjs';
import { labCandidates } from '../../../tests/fixtures/lab-candidates.mjs';
const config={...defaultLabConfig,locale:'pt-BR',unitSystem:'metric',topicMode:'custom',topic:'Nutrição',knowledge:'custom',challenge:'Ensino médio brasileiro'};
const question={...labCandidates[0],locale:'pt-BR',question:'Quantas faces tem um octaedro regular?',explanation:'Um octaedro regular tem oito faces triangulares.',measurement:null};
it('validates independent server preferences, batch sizes and custom topics in either language',()=>{
  for(const locale of ['en','pt-BR'])for(const unitSystem of ['metric','original'])for(const count of [10,15,20])for(const topic of ['Pokémon','Nutrição','História do Brasil','Molecular biology']){
    const parsed=labConfigSchema.parse({...config,locale,unitSystem,count,topic});
    assert.equal(parsed.topic,topic);assert.equal(parsed.locale,locale);assert.equal(parsed.unitSystem,unitSystem);
  }
  for(const patch of [{locale:'es'},{unitSystem:'imperial'},{count:11}])assert.equal(labConfigSchema.safeParse({...config,...patch}).success,false);
});
it('screens Portuguese counts and explicit native metric measurements without weakening factual checks',()=>{
  assert.equal(screenLabCandidate(question,[],config).answer,8);
  const measurement={...question,question:'Qual é a distância oficial de uma maratona, em quilômetros?',answer:42.195,unit:'quilômetros',measurement:{value:42.195,unit:'km',dimension:'length'}};
  assert.equal(screenLabCandidate(measurement,[],config).answer,42.195);
  for(const patch of [{locale:'en'},{question:'How many faces does a regular octahedron have?'},{answer:-1},{question:'Quantas faces tem este octaedro de 8 faces?'},{question:'Quantas pessoas há na população desta cidade?'},{question:'Qual é aproximadamente a quantidade de faces deste sólido?'}])assert.throws(()=>screenLabCandidate({...question,...patch},[],config));
  for(const patch of [{measurement:null},{measurement:{value:42,unit:'km',dimension:'length'}},{measurement:{value:42.195,unit:'km',dimension:'mass'}},{unit:'milhas',question:'Qual é a distância da prova em milhas?'}])assert.throws(()=>screenLabCandidate({...measurement,...patch},[],config));
  for(const unit of ['ounces','onças','gallons','galões'])assert.throws(()=>screenLabCandidate({...question,unit},[],config));
  assert.throws(()=>screenLabCandidate(question,[question],config),{code:'DUPLICATE_QUESTION'});
});
it('passes frozen preferences to mocked AI and retains partial packs through failures',async()=>{
  let captured;
  const initial={questions:[],attempts:0,rejected:0,status:'generating',lastError:null,reports:[]};
  const data=await advanceGeneration(config,initial,[],async options=>{captured=options;return {candidates:[question,{...question,locale:'en'}],model:'test/model'}});
  assert.equal(captured.preferences.locale,'pt-BR');assert.equal(captured.preferences.unitSystem,'metric');assert.equal(captured.preferences.topic,'Nutrição');
  assert.equal(data.questions.length,1);assert.equal(data.rejected,1);assert.equal(data.questions[0].verification,'unverified');
  assert.equal(data.questions[0].locale,'pt-BR');
  const failed=await advanceGeneration(config,data,[],async()=>{throw Object.assign(new Error('private'),{code:'AI_TIMEOUT'})});
  assert.deepEqual(failed.questions,data.questions);assert.equal(failed.lastErrorCode,'AI_TIMEOUT');assert.equal(config.locale,'pt-BR');
});

it('rejects localized answer leaks, ambiguous abbreviations and unsupported conversion exercises',()=>{
  for(const [unit,text] of [['oz','Qual é a massa deste objeto em oz?'],['gal','Qual é o volume deste recipiente em gal?'],['ft','Qual é a altura deste edifício em ft?']])assert.throws(()=>screenLabCandidate({...question,unit,question:text},[],config));
  assert.throws(()=>screenLabCandidate({...question,unit:'quilômetros',answer:1234.5,question:'Qual é a distância de 1.234,5 quilômetros deste percurso?',measurement:{value:1234.5,unit:'km',dimension:'length'}},[],config));
  assert.throws(()=>screenLabCandidate({...question,question:'Quantos metros equivalem a uma milha internacional?',unit:'metros',measurement:{value:8,unit:'m',dimension:'length'}},[],config));
});
