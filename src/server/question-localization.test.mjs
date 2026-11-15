import { it } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../db/seed/questions.json' with { type: 'json' };
import catalog from '../../db/seed/question-localizations.json' with { type: 'json' };
import { localizeQuestion, localizationDuplicateTexts } from './question-localization.mjs';
import { publicQuestion } from './questions.mjs';
import { resolveChallenge, gameReducer, createGameState } from '../features/game/game-rules.mjs';

it('translates every seeded question without changing canonical identity, lifecycle or answers', () => {
  assert.equal(catalog.length,seed.length); assert.equal(new Set(catalog.map(q=>q.source)).size,seed.length);
  for(const question of seed) {
    const copy = structuredClone(question);
    const localized = localizeQuestion(question,{locale:'pt-BR',unitSystem:'original'});
    assert.equal(localized.id,question.id); assert.equal(localized.curatedId,question.curatedId);
    assert.equal(localized.status,question.status); assert.equal(localized.answer,question.answer);
    assert.ok(localized.question.endsWith('?')); assert.notEqual(localized.question,question.question);
    assert.equal(localized.localization.fallback,false); assert.ok(localized.explanationTexts['pt-BR']); assert.notEqual(localized.explanation,question.explanation); assert.deepEqual(question,copy);
    assert.equal(localizeQuestion(question).question,question.question);
  }
});
it('safely falls back for unknown or changed canonical text, answer or unit', () => {
  for(const patch of [{question:'An unknown legacy question?'},{answer:'999999'},{unit:'unknown'}]) {
    const question = {...seed[0],...patch};
    const result = localizeQuestion(question,{locale:'pt-BR',unitSystem:'metric'});
    assert.equal(result.question,question.question); assert.equal(result.answer,question.answer);
    assert.equal(result.localization.fallback,true); assert.equal(result.localization.converted,false);
  }
});
it('converts only explicitly approved facts and uses the same rounded answer in challenge rules', () => {
  const approved=[54,55,56,137,138];
  for(const question of seed) {
    const result=localizeQuestion(question,{locale:'pt-BR',unitSystem:'metric'});
    assert.equal(result.localization.converted,approved.includes(question.id));
    if(!approved.includes(question.id)){assert.equal(result.answer,question.answer);continue}
    const expected=Math.round(Number(question.answer)*(question.unit==='feet'?.3048:1.609344));
    assert.equal(result.answer,expected); assert.match(result.question,/inteiro mais próximo/);
    assert.deepEqual(resolveChallenge(expected,result),{success:false});
    assert.equal(resolveChallenge(expected+.1,result).answer,expected);
    const en=localizeQuestion(question,{locale:'en',unitSystem:'metric'});
    assert.equal(en.answer,result.answer); assert.equal(en.id,result.id);
    assert.equal(publicQuestion(en).answer,undefined);
    const payload=JSON.stringify(publicQuestion(en));
    for(const privateKey of ['sourceAnswer','sourceUnit','measurement','explanation','explanationTexts','src','review']) assert.ok(!payload.includes(`"${privateKey}"`),privateKey);
  }
});
it('keeps counts, dates, percentages, metric relationships and embedded values intact', () => {
  for(const id of [27,28,32,33,117,131,168,186,195]){
    const question=seed.find(q=>q.id===id), result=localizeQuestion(question,{locale:'pt-BR',unitSystem:'metric'});
    assert.equal(result.answer,question.answer);assert.equal(result.unit,question.unit);assert.equal(result.localization.converted,false);
  }
});
it('preserves game progression and equality rules with derived answers', () => {
  const q=localizeQuestion(seed.find(q=>q.id===54),{locale:'pt-BR',unitSystem:'metric'});
  let state={...createGameState(),selectedQuestion:publicQuestion(q)};
  state=gameReducer(state,{type:'toggle-lock',now:1});
  state=gameReducer(state,{type:'guess',guess:{id:'guess',value:Number(q.answer)+1},now:2});
  const request={id:'req',questionId:q.id,questionIndex:0,guessId:'guess'};
  state=gameReducer(state,{type:'challenge-start',request});
  state=gameReducer(state,{type:'challenge-complete',requestId:'req',result:resolveChallenge(Number(q.answer)+1,q)});
  assert.equal(state.phase,'result');assert.equal(state.challenge.answer,q.answer);assert.equal(state.guesses.length,1);
});

it('keeps edited source evidence and its fallback without reusing a stale translation',()=>{
  const question={...seed[0],explanation:'Updated reference evidence in English.'};
  const result=localizeQuestion(question,{locale:'pt-BR',unitSystem:'original'});
  assert.equal(result.explanation,question.explanation);assert.equal(result.explanationTexts['pt-BR'],undefined);
});

it('screens translated duplicate wording locally without sending the private bank to generation',()=>{
  const existing=[{question:seed[0].question}];
  assert.deepEqual(localizationDuplicateTexts(existing,'en'),existing);
  assert.equal(localizationDuplicateTexts(existing,'pt-BR')[1].question,catalog[0].question);
});
