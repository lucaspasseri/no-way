import { z } from 'zod';

export const localeSchema = z.enum(['en', 'pt-BR']);
export const unitSystemSchema = z.enum(['original', 'metric']);
export const localizationSchema = z.strictObject({
  locale: localeSchema.default('en'),
  unitSystem: unitSystemSchema.default('original'),
});
export const preferenceCookie = 'no-way-preferences';
export function restoreLocalization(raw) {
  try {
    const value = JSON.parse(raw);
    const locale = localeSchema.safeParse(value?.locale).data ?? 'en';
    return { locale, unitSystem: unitSystemSchema.safeParse(value?.unitSystem).data ?? (locale === 'pt-BR' ? 'metric' : 'original') };
  } catch { return { locale: 'en', unitSystem: 'original' }; }
}
export function formatNumber(value, locale = 'en') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
}
// Accept ungrouped decimals or correctly grouped local numbers. Never guess
// whether an English decimal point was intended as a Portuguese separator.
export function parseNumber(input, locale = 'en') {
  if (typeof input === 'number') return input;
  const value = String(input).trim();
  const pattern = locale === 'pt-BR'
    ? /^[+-]?(?:(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d*)?|,\d+)(?:e[+-]?\d+)?$/i
    : /^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
  if (!pattern.test(value)) return NaN;
  return Number(locale === 'pt-BR' ? value.replaceAll('.', '').replace(',', '.') : value.replaceAll(',', ''));
}
