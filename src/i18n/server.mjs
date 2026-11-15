import 'server-only';
import { cookies } from 'next/headers';
import { preferenceCookie, restoreLocalization } from './config.mjs';
export async function requestLocalization() {
  return restoreLocalization((await cookies()).get(preferenceCookie)?.value);
}

export async function hasSavedUnitSystem() {
  try { return ['original', 'metric'].includes(JSON.parse((await cookies()).get(preferenceCookie)?.value).unitSystem); } catch { return false; }
}
