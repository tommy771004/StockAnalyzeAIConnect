const TOKEN_KEY = 'auth_token';

/** Fired when any request returns 401 and a token was present (token expired). */
export const AUTH_EXPIRED_EVENT = 'auth:token_expired';

export async function fetchJ<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401 && token) {
      // Token expired: clear it and notify AuthContext via event — no hard reload
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
