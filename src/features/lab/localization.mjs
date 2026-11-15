import { z } from 'zod';
import { candidateSchema, questionError } from '../../../db/question-validation.mjs';
import { units } from '../../lib/measurements/units.mjs';

export const measurementSchema = z.strictObject({
  value: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
  unit: z.enum(Object.keys(units)),
  dimension: z.enum(['length', 'mass', 'volume', 'temperature']),
});
export const localizedCandidateSchema = candidateSchema.extend({
  locale: z.enum(['en', 'pt-BR']), measurement: measurementSchema.nullable(),
});
const names = {
  km: ['kilometers', 'quilômetros'], m: ['meters', 'metros'], cm: ['centimeters', 'centímetros'], mm: ['millimeters', 'milímetros'],
  mi: ['miles', 'milhas'], ft: ['feet', 'pés'], in: ['inches', 'polegadas'],
  kg: ['kilograms', 'quilogramas'], g: ['grams', 'gramas'], lb: ['pounds', 'libras'],
  oz_mass: ['mass ounces', 'onças de massa'], L: ['liters', 'litros'], mL: ['milliliters', 'mililitros'],
  gal_us: ['US gallons', 'galões americanos'], gal_imperial: ['Imperial gallons', 'galões imperiais'],
  fl_oz_us: ['US fluid ounces', 'onças fluidas americanas'], F: ['degrees Fahrenheit', 'graus Fahrenheit'], C: ['degrees Celsius', 'graus Celsius'],
};
export function screenLocalization(input, config) {
  const { locale = 'en', unitSystem = 'original' } = config;
  const { locale: declared, measurement, ...candidate } = input;
  if ((declared !== undefined && declared !== locale) || (locale === 'pt-BR' && declared !== locale)) throw questionError('WRONG_LOCALE', 'Wrong question language.');
  const text = candidate.question?.toLowerCase() ?? '';
  if (locale === 'pt-BR' && (!/\b(quantos|quantas|qual|em que|segundo|de acordo|sob|na |no )/i.test(text) || /\b(how many|what is|according to)\b/i.test(text))) throw questionError('WRONG_LOCALE', 'Wrong question language.');
  // Qualified metric quantities are allowed, but ambiguous ounces/gallons are
  // rejected even when the provider claims this is a dimensionless count.
  if (/^(oz|fl\.? oz|gal|ounces?|onças?|gallons?|galões|fluid ounces?)$/i.test(candidate.unit ?? '')) throw questionError('AMBIGUOUS_UNIT', 'Specify the measurement definition.');
  if (unitSystem === 'metric' && /\b(miles?|feet|inches|pounds?|ounces?|gallons?|fahrenheit|milhas?|polegadas?|libras?|onças?|galões)\b|\bpés\b/i.test(text + ' ' + candidate.unit)) throw questionError('INCOMPATIBLE_UNIT', 'Use metric units.');
  // Generated conversion exercises would require independently verified source
  // measurements. Until those exist, reject them rather than trust model math.
  if (/\b(convert|conversion|converted|equivalent|conversão|converter|convertido|equivale|equivalem|corresponde|correspondem)\b/i.test(text)) throw questionError('UNSAFE_CONVERSION', 'Use native-unit facts instead of conversion exercises.');
  const recognized = Object.hasOwn(units, candidate.unit ?? '') ? [candidate.unit, names[candidate.unit]] : Object.entries(names).find(([, labels]) => labels.some(name => name.toLowerCase() === candidate.unit?.toLowerCase()));
  if (unitSystem === 'metric' && recognized && units[recognized[0]].metric) throw questionError('INCOMPATIBLE_UNIT', 'Use metric units.');
  if (recognized && !measurement) throw questionError('MISSING_MEASUREMENT', 'Provide structured answer measurement.');
  if (measurement != null) {
    const parsed = measurementSchema.safeParse(measurement);
    if (!parsed.success || measurement.value !== candidate.answer || units[measurement.unit]?.dimension !== measurement.dimension
      || !recognized || recognized[0] !== measurement.unit || (unitSystem === 'metric' && units[measurement.unit].metric)) throw questionError('INVALID_MEASUREMENT', 'Inconsistent answer measurement.');
  }
  return candidate;
}
