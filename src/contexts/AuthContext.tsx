/**
 * src/contexts/AuthContext.tsx
 * Provides authentication state + helpers (login / register / logout).
 * JWT is handled strictly via HttpOnly Cookies by the backend.
 * NO tokens are stored in localStorage nor sent via Authorization headers.
 */
import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchJ, AUTH_EXPIRED_EVENT } from '../utils/api';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  tier: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Always true initially, until we check cookie auth state with backend
  const [loading, setLoading] = useState(true);

  // Restore session via automatically sent HttpOnly cookie
  useEffect(() => {
    fetchJ<AuthUser>('/api/auth/me')
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Listen for token-expired events (e.g. 401s from the API wrapper)
  useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await fetchJ<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const data = await fetchJ<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJ('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

