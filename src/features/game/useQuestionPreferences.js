import { useState, useSyncExternalStore } from 'react';
import { preferencesKey, restorePreferences } from './question-selection.mjs';

function subscribe(listener) {
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
function snapshot() {
  try { return localStorage.getItem(preferencesKey); } catch { return null; }
}
const serverSnapshot = () => null;

export default function useQuestionPreferences(options) {
  const stored = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [draft, setDraft] = useState(null);
  const preferences = draft ?? restorePreferences(stored, options);
  function updatePreferences(next) {
    setDraft(next);
    try { localStorage.setItem(preferencesKey, JSON.stringify(next)); } catch { /* Play still works without storage. */ }
  }
  return [preferences, updatePreferences];
}
