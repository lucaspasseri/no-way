import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries, translate, localizedMetadata } from '../i18n/translations.mjs';
import { restoreLocalization, parseNumber, formatNumber } from '../i18n/config.mjs';
import { convert, roundAnswer, metricMeasurement } from './measurements/convert.mjs';

it('keeps dictionaries complete, interpolates values and uses safe English fallbacks', () => {
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries['pt-BR']).sort());
  for (const dict of Object.values(dictionaries)) for (const [key, text] of Object.entries(dict)) {
    assert.ok(text.trim(), key);
    assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...text.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), key);
  }
  assert.equal(translate('pt-BR', 'Lock question'), 'Bloquear pergunta');
  assert.equal(translate('en', 'Lock question'), 'Lock question');
  assert.equal(translate('pt-BR', 'Generate {count} questions', { count: 15 }), 'Gerar 15 perguntas');
  assert.equal(translate('unknown', 'Lock question'), 'Lock question');
  assert.equal(translate('pt-BR', 'New content'), 'New content');
  for (const label of ['science', 'geography', 'history', 'culture', 'sports', 'mathematics', 'technology', 'nature', 'human-body', 'everyday', 'easy', 'medium', 'hard', 'mixed']) {
    assert.ok(localizedMetadata(label, 'pt-BR'));
  }
  assert.equal(localizedMetadata('human-body', 'pt-BR'), 'Corpo humano');
  assert.equal(localizedMetadata('hard', 'pt-BR'), 'Difícil');
});
it('restores preferences independently with sensible defaults and rejects corrupt values', () => {
  assert.deepEqual(restoreLocalization(null), { locale: 'en', unitSystem: 'original' });
  assert.deepEqual(restoreLocalization('{'), { locale: 'en', unitSystem: 'original' });
  assert.deepEqual(restoreLocalization('{"locale":"pt-BR"}'), { locale: 'pt-BR', unitSystem: 'metric' });
  for (const locale of ['en', 'pt-BR']) for (const unitSystem of ['metric', 'original']) assert.deepEqual(restoreLocalization(JSON.stringify({ locale, unitSystem })), { locale, unitSystem });
  assert.deepEqual(restoreLocalization('{"locale":"xx","unitSystem":"imperial"}'), { locale: 'en', unitSystem: 'original' });
});
it('formats and parses localized guesses without corrupting numbers or accepting invalid grouping', () => {
  assert.equal(formatNumber(1234.5, 'en'), '1,234.5');
  assert.equal(formatNumber(1234.5, 'pt-BR'), '1.234,5');
  for (const value of [0, .5, 1234.5, 9007199254740991]) for (const locale of ['en', 'pt-BR']) assert.equal(parseNumber(formatNumber(value, locale), locale), value);
  for (const input of ['', '1.5', '1,234.5', '1.23,5', '1,2,3', 'Infinity', '0x10', 'NaN']) assert.ok(Number.isNaN(parseNumber(input, 'pt-BR')), input);
  assert.equal(parseNumber(',5', 'pt-BR'), .5);
  assert.equal(parseNumber('.5', 'en'), .5);
  assert.equal(parseNumber('1,5e3', 'pt-BR'), 1500);
  assert.equal(parseNumber('1.234', 'pt-BR'), 1234);
  assert.equal(parseNumber('1,234', 'pt-BR'), 1.234);
});
it('converts explicit dimensioned measurements using exact published unit factors', () => {
  for (const [value, from, to, expected] of [[10,'mi','km',16.09344],[1,'ft','m',.3048],[1,'in','cm',2.54],[1,'lb','kg',.45359237],
    [1,'oz_mass','g',28.349523125],[1,'gal_us','L',3.785411784],[1,'gal_imperial','L',4.54609],[1,'fl_oz_us','mL',29.5735295625],
    [32,'F','C',0],[212,'F','C',100],[-40,'F','C',-40],[1,'kg','g',1000],[100,'cm','m',1]]) {
    assert.ok(Math.abs(convert(value,from,to)-expected) < 1e-10, `${from} to ${to}`);
  }
  for (const [from,to] of [['ounces','g'],['gallons','L'],['count','kg'],['year','C'],['percent','m'],['km','kg'],['unknown','m']]) assert.equal(convert(1,from,to), null);
  assert.equal(convert(Infinity,'mi','km'),null);
});
it('rounds fairly, prefers grams for small weights and preserves unplayable conversions', () => {
  assert.equal(roundAnswer(2.5),3); assert.equal(roundAnswer(-2.5),-3);
  assert.equal(roundAnswer(1.005,2),1.01); assert.equal(roundAnswer(2.499999),2);
  assert.equal(metricMeasurement(10,'mi').answer,16);
  assert.equal(metricMeasurement(.1,'lb').unit,'g'); assert.equal(metricMeasurement(.1,'lb').answer,45);
  assert.equal(metricMeasurement(.000001,'oz_mass'),null);
  assert.equal(metricMeasurement(-40,'F'),null);
  assert.equal(metricMeasurement(1e20,'mi'),null);
  assert.equal(metricMeasurement(1e9,'mi').answer,1609344000);
  assert.equal(roundAnswer(1,7),null);
});
it('keeps canonical localization content outside the client dependency graph', () => {
  const provider = readFileSync(new URL('../i18n/LocalizationProvider.jsx', import.meta.url),'utf8');
  assert.doesNotMatch(provider,/question-localizations|question-localization\.mjs/);
});
