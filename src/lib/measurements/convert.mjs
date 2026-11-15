import { units } from './units.mjs';

export function convert(value, from, to) {
  const source = units[from], target = units[to];
  if (!Number.isFinite(value) || !source || !target || source.dimension !== target.dimension) return null;
  const result = (value * source.factor + (source.offset ?? 0) - (target.offset ?? 0)) / target.factor;
  return Number.isFinite(result) ? result : null;
}
// Decimal rounding, half away from zero, with a precision cap for stable play.
export function roundAnswer(value, decimals = 0) {
  if (!Number.isFinite(value) || !Number.isInteger(decimals) || decimals < 0 || decimals > 6) return null;
  const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let coefficient = BigInt(whole + fraction);
  const shift = fraction.length - Number(exponent) - decimals;
  if (shift > 0) {
    const divisor = 10n ** BigInt(shift);
    coefficient = coefficient / divisor + (coefficient % divisor * 2n >= divisor ? 1n : 0n);
  } else coefficient *= 10n ** BigInt(-shift);
  const rounded = Math.sign(value) * Number(`${coefficient}e-${decimals}`);
  return Object.is(rounded, -0) ? 0 : rounded;
}
export function metricMeasurement(value, from, { decimals = 0, to = units[from]?.metric ?? from } = {}) {
  let converted = convert(value, from, to);
  if (converted === null) return null;
  if (from === 'lb' && to === 'kg' && Math.abs(converted) < 1 && value !== 0) {
    to = 'g'; converted = convert(value, from, to);
  }
  const answer = roundAnswer(converted, decimals);
  // Existing game only accepts nonnegative answers; never change this rule.
  if (answer === null || answer < 0 || answer > Number.MAX_SAFE_INTEGER || (answer === 0 && converted !== 0)) return null;
  return { answer, unit: to, dimension: units[to].dimension, decimals };
}
