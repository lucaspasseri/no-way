'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { preferenceCookie, restoreLocalization, formatNumber } from './config.mjs';
import { translate, localizedMetadata } from './translations.mjs';

const Context = createContext(null);
export function LocalizationProvider({ initial, initialUnitExplicit = false, children }) {
  const explicitUnits = useRef(initialUnitExplicit);
  const [preferences, setPreferences] = useState(initial);
  function updatePreferences(patch) {
    if (patch.unitSystem) explicitUnits.current = true;
    const next = restoreLocalization(JSON.stringify({ ...preferences, ...patch, ...(!explicitUnits.current && { unitSystem: undefined }) }));
    setPreferences(next);
    document.documentElement.lang = next.locale;
    document.cookie = `${preferenceCookie}=${encodeURIComponent(JSON.stringify({ locale: next.locale, ...(explicitUnits.current && { unitSystem: next.unitSystem }) }))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  useEffect(() => { document.documentElement.lang = preferences.locale; }, [preferences.locale]);
  return <Context.Provider value={{ ...preferences, updatePreferences }}>{children}</Context.Provider>;
}
export function useI18n() {
  const preferences = useContext(Context) ?? { locale: 'en', unitSystem: 'original' };
  return { ...preferences,
    t: (key, values) => translate(preferences.locale, key, values),
    formatNumber: value => formatNumber(value, preferences.locale),
    metadataLabel: value => localizedMetadata(value, preferences.locale),
  };
}
