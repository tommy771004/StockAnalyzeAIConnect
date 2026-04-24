/**
 * src/utils/api.ts
 * Low-level fetch wrapper with JSON parsing and error normalisation.
 */

const BASE_URL = import.meta.env?.VITE_API_URL ?? '';

export const AUTH_EXPIRED_EVENT = 'auth-expired';

/**
 * Fetch JSON from a relative or absolute URL.
 * Throws a descriptive Error on non-2xx responses.
 */
export async function fetchJ<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    credentials: 'include', // send HttpOnly cookie automatically
    ...init,
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body?.error) msg = body.error;
    } catch { /* ignore json parse failure */ }
    throw new Error(msg);
  }

  // Handle empty responses (e.g., 204 No Content)
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
