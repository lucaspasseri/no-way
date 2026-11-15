import en from './en.json' with { type: 'json' };
import pt from './pt-BR.json' with { type: 'json' };
export const dictionaries = { en, 'pt-BR': pt };
export function translate(locale, key, values = {}) {
  // Stored generation failures are stable allowlisted English messages plus a
  // recovery suffix. Translate at display time, including after a locale change.
  if (locale === 'pt-BR' && !Object.hasOwn(pt, key)) {
    const retry = /^(.*) You have (\d+) generation (attempts?) remaining\.$/.exec(key);
    if (retry) return translate(locale, retry[1]) + ' ' + translate(locale, `You have {count} generation ${retry[3]} remaining.`, { count: retry[2] });
    const prefix = Object.keys(pt).filter(candidate => key.startsWith(candidate + ' ')).sort((a,b) => b.length-a.length)[0];
    if (prefix) return translate(locale, prefix) + ' ' + translate(locale, key.slice(prefix.length + 1));
  }
  const text = dictionaries[locale]?.[key] ?? en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
const labels = {
  science: 'Ciência', geography: 'Geografia', history: 'História', culture: 'Cultura', sports: 'Esportes', mathematics: 'Matemática', technology: 'Tecnologia', nature: 'Natureza', 'human-body': 'Corpo humano', everyday: 'Cotidiano',
  easy: 'Fácil', medium: 'Média', hard: 'Difícil', mixed: 'Variada',
};
export function localizedMetadata(value, locale = 'en') {
  return locale === 'pt-BR' && labels[value] ? labels[value] : value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
