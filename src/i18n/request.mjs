import { preferenceCookie, restoreLocalization } from './config.mjs';
import { translate } from './translations.mjs';
export function requestTranslator(request) {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(preferenceCookie + '='))?.slice(preferenceCookie.length + 1);
  let raw;
  try { raw = decodeURIComponent(value ?? ''); } catch { raw = null; }
  const { locale } = restoreLocalization(raw);
  return key => translate(locale, key);
}
