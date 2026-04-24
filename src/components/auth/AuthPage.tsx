/**
 * src/components/auth/AuthPage.tsx
 * Login / Register form with tab toggle — MD3 Deep-Space theme.
 */
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { QuantumAnimation } from '../QuantumAnimation';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden bg-grid"
      style={{ background: 'var(--md-background)', color: 'var(--md-on-surface)' }}
    >
      <QuantumAnimation />
      {/* Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'var(--md-primary-container)', mixBlendMode: 'screen', filter: 'blur(128px)', opacity: 0.2 }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'var(--md-secondary-container)', mixBlendMode: 'screen', filter: 'blur(128px)', opacity: 0.2 }} />

      <main className="w-full max-w-md px-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl mb-4 shadow-lg"
            style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--md-primary)', fontSize: 32 }}>terminal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2"
            style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
            ASA 
          </h1>
          <p className="text-sm" style={{ color: 'var(--md-on-surface-variant)' }}>
            量化交易・安全登入
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl p-8 shadow-2xl"
          style={{ background: 'rgba(12,19,36,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(144,143,160,0.2)' }}>

          {/* Tab switcher */}
          <div className="flex rounded-xl p-1 mb-6"
            style={{ background: 'var(--md-surface-container)' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); }}
                className="flex-1 py-2 text-sm font-semibold rounded-xl transition"
                style={mode === m
                  ? { background: 'var(--md-primary-container)', color: 'var(--md-primary)', boxShadow: '0 0 12px rgba(192,193,255,0.2)' }
                  : { color: 'var(--md-outline)' }}
              >
                {m === 'login' ? '登入' : '建立帳號'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold mb-1 uppercase tracking-wider"
                  style={{ color: 'var(--md-on-surface-variant)' }}>
                  顯示名稱（選填）
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined" style={{ color: 'var(--md-outline)', fontSize: 20 }}>person</span>
                  </div>
                  <input
                    type="text"
                    placeholder="輸入名稱"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                    style={{ background: 'var(--md-surface-container-lowest)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold mb-1 uppercase tracking-wider"
                style={{ color: 'var(--md-on-surface-variant)' }}>
                {mode === 'login' ? '電子郵件 / Terminal ID' : '電子郵件'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined" style={{ color: 'var(--md-outline)', fontSize: 20 }}>badge</span>
                </div>
                <input
                  type="email"
                  placeholder="user@hermes.ai"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                  style={{ background: 'var(--md-surface-container-lowest)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1 uppercase tracking-wider"
                style={{ color: 'var(--md-on-surface-variant)' }}>
                密碼 (PassWord)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="material-symbols-outlined" style={{ color: 'var(--md-outline)', fontSize: 20 }}>key</span>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  required
                  minLength={8}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl py-3 pl-10 pr-10 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 transition"
                  style={{ background: 'var(--md-surface-container-lowest)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <button type="button" onClick={() => setShowPassword(p => !p)}
                    className="transition-colors"
                    style={{ color: 'var(--md-outline)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {showPassword ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* MFA Indicator */}
            <div className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-surface-container-high)' }}>
              <span className="material-symbols-outlined mt-0.5" style={{ color: 'var(--md-tertiary)', fontSize: 20 }}>shield_lock</span>
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>
                  MFA 驗證已啟用
                </div>
                <p className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                  登入後將要求提供硬體安全金鑰或生物辨識憑證。
                </p>
              </div>
            </div>

            {error && (
              <p className="text-xs text-center" style={{ color: 'var(--color-up)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full flex justify-center items-center gap-2 py-3 rounded-xl font-bold text-sm transition disabled:opacity-50"
              style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)', boxShadow: '0 0 15px rgba(192,193,255,0.2)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {busy ? 'hourglass_empty' : 'login'}
              </span>
              {busy ? '處理中…' : mode === 'login' ? '登入' : '建立帳號'}
            </button>
          </form>

          {/* Alternate Access */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: '1px solid var(--md-outline-variant)' }} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 text-xs font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(12,19,36,0.75)', color: 'var(--md-outline)' }}>
                  備用存取協定
                </span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { icon: 'fingerprint', label: '生物辨識' },
                { icon: 'api', label: 'API 密鑰' },
              ].map(btn => (
                <button
                  key={btn.label}
                  type="button"
                  className="flex justify-center items-center gap-2 py-2 px-4 rounded-xl text-sm transition"
                  style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{btn.icon}</span>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-xs tracking-widest" style={{ color: 'var(--md-outline)', fontFamily: 'var(--font-data)' }}>
            SYSTEM_STATUS: <span style={{ color: 'var(--md-secondary)' }}>ONLINE</span>
            {' '}| NODE: <span style={{ color: 'var(--md-on-surface-variant)' }}>TPE-01</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--md-outline)' }}>
            未經授權的存取將受到嚴密監控並記錄。
          </p>
        </div>
      </main>
    </div>
  );
}
