import 'server-only';
import catalog from '../../db/seed/question-localizations.json' with { type: 'json' };
import { metricMeasurement } from '../lib/measurements/convert.mjs';
import { localizationSchema } from '../i18n/config.mjs';

const bySource = new Map(catalog.map(entry => [entry.source, entry]));
/** Server-only derivation. Catalog entries contain canonical answers and must
 * never be imported into a Client Component or serialized in public payloads. */
export function localizeQuestion(question, input = {}) {
  const { locale, unitSystem } = localizationSchema.parse(input);
  const entry = bySource.get(question.question);
  const valid = entry && entry.sourceUnit === question.unit && Number(entry.sourceAnswer) === Number(question.answer);
  let texts = { en: question.question };
  const explanationTexts = { en: question.explanation };
  if (valid && entry.sourceExplanation === question.explanation) explanationTexts['pt-BR'] = entry.explanation;
  let answer = question.answer, unit = question.unit, converted = false;
  if (valid) {
    texts['pt-BR'] = entry.question;
    if (unitSystem === 'metric' && entry.measurement && entry.metricQuestions) {
      const value = metricMeasurement(Number(answer), entry.measurement.unit, { decimals: entry.measurement.decimals, to: entry.measurement.target });
      if (value && value.dimension === entry.measurement.dimension) {
        answer = value.answer; unit = value.unit; texts = entry.metricQuestions; converted = true;
      }
    }
  }
  return { ...question, explanation: explanationTexts[locale] ?? question.explanation, explanationTexts, question: texts[locale] ?? texts.en, answer, unit,
    localization: { locale, unitSystem, texts, converted, fallback: !texts[locale], translationStatus: valid ? entry.translationStatus : 'missing' } };
}

/** Duplicate checks can compare both source and translated wording locally.
 * These texts never enter the AI prompt or public selection payload. */
export function localizationDuplicateTexts(existing, locale) {
  if (locale !== 'pt-BR') return existing;
  return existing.flatMap(row => {
    const entry = bySource.get(row.question);
    return entry ? [row, { question: entry.question }] : [row];
  });
}
