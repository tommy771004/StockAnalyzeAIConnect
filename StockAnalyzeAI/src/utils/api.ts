const TOKEN_KEY = 'auth_token';

export async function fetchJ<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) {
      // Clear stale token and reload to show login screen
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
