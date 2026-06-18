import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Terminal, ShieldAlert, Cpu, Database } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  const title = isRegister ? t('auth.register', 'Register') : t('auth.loginTitle', 'Sign In');
  const submitLabel = loading
    ? isRegister
      ? t('auth.registering', 'Registering...')
      : t('auth.loggingIn', 'Signing in...')
    : isRegister
      ? t('auth.establishUplink', 'ESTABLISH_UPLINK')
      : t('auth.initiateHandshake', 'INITIATE_HANDSHAKE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('auth.requiredFields', 'Required fields missing'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || t('auth.authFailed', 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center font-mono text-(--color-term-text) overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(8,11,16,1) 0%, rgba(5,8,13,1) 100%)' }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 z-0 term-grid-lines" />

      {/* Multi-orb ambient glow */}
      {/* Amber orb — primary */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '30%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      {/* Cyan orb — secondary */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '70%', left: '25%',
          transform: 'translate(-50%, -50%)',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />
      {/* Rose orb — tertiary */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '60%', right: '10%',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(248,113,113,0.05) 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md p-8"
        style={{
          background: 'linear-gradient(160deg, rgba(14,20,32,0.95) 0%, rgba(10,14,22,0.98) 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 0 1px rgba(245,158,11,0.08), 0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Top glass highlight */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.3) 40%, rgba(34,211,238,0.2) 60%, transparent)' }}
        />

        {/* Header */}
        <div className="mb-8 text-center">
          <div
            className="mb-5 inline-flex items-center justify-center p-3.5 relative"
            style={{
              border: '1px solid rgba(245,158,11,0.25)',
              background: 'rgba(245,158,11,0.08)',
              boxShadow: '0 0 20px rgba(245,158,11,0.15), inset 0 0 12px rgba(245,158,11,0.06)',
            }}
          >
            <Terminal className="h-6 w-6 text-(--color-term-accent)" />
            {/* Corner accent lines */}
            <span className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-(--color-term-accent)/60" />
            <span className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-(--color-term-accent)/60" />
            <span className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-(--color-term-accent)/60" />
            <span className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-(--color-term-accent)/60" />
          </div>
          <p className="mb-2 text-[10px] tracking-[0.28em] text-(--color-term-muted) font-sans">
            {t('auth.appTitle', 'STOCK AI CONNECT')}
          </p>
          <h1 className="text-xl font-bold tracking-[0.2em] text-(--color-term-text) font-sans">
            {title}
          </h1>
          <p className="mt-2 text-[11px] tracking-widest text-(--color-term-muted)/60">
            {t('auth.loginSubtitle', 'AUTONOMOUS_TRADING_SYNDICATE_v3')}
          </p>
        </div>

        {/* Error banner */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 flex items-center gap-3 border-l-2 border-(--color-term-negative) px-3 py-2.5 text-[11px] text-(--color-term-negative) tracking-widest overflow-hidden"
              style={{ background: 'rgba(248,113,113,0.08)', borderRadius: '0 2px 2px 0' }}
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name field (register only) */}
          <AnimatePresence>
            {isRegister && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden flex flex-col gap-1.5"
              >
                <label htmlFor="login-name" className="text-[10px] tracking-widest text-(--color-term-muted) font-sans font-semibold">
                  {t('auth.operatorId', 'OPERATOR_ID')}
                </label>
                <div className="relative">
                  <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-term-subtle)" aria-hidden="true" />
                  <input
                    id="login-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder', 'Enter handle...')}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    className="h-11 w-full pl-10 pr-4 text-[13px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-subtle)/60 focus:outline-none transition-all duration-200"
                    style={{
                      background: 'rgba(12,16,24,0.8)',
                      border: `1px solid ${nameFocused ? 'rgba(245,158,11,0.5)' : 'rgba(25,32,48,0.8)'}`,
                      boxShadow: nameFocused ? '0 0 0 2px rgba(245,158,11,0.1), 0 0 12px rgba(245,158,11,0.06)' : 'none',
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-[10px] tracking-widest text-(--color-term-muted) font-sans font-semibold">
              {t('auth.accessCoord', 'ACCESS_COORD (EMAIL)')}
            </label>
            <div className="relative">
              <Network
                aria-hidden="true"
                className={cn(
                  'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200',
                  emailFocused ? 'text-(--color-term-accent)' : 'text-(--color-term-subtle)',
                )}
              />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder', 'sys.operator@fin.local')}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                className="h-11 w-full pl-10 pr-4 text-[13px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-subtle)/60 focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(12,16,24,0.8)',
                  border: `1px solid ${emailFocused ? 'rgba(245,158,11,0.5)' : 'rgba(25,32,48,0.8)'}`,
                  boxShadow: emailFocused ? '0 0 0 2px rgba(245,158,11,0.1), 0 0 12px rgba(245,158,11,0.06)' : 'none',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-[10px] tracking-widest text-(--color-term-muted) font-sans font-semibold">
              {t('auth.securityKey', 'SECURITY_KEY')}
            </label>
            <div className="relative">
              <Database
                aria-hidden="true"
                className={cn(
                  'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200',
                  passFocused ? 'text-(--color-term-accent)' : 'text-(--color-term-subtle)',
                )}
              />
              <input
                id="login-password"
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onFocus={() => setPassFocused(true)}
                onBlur={() => setPassFocused(false)}
                className="h-11 w-full pl-10 pr-4 text-[13px] tracking-[0.25em] text-(--color-term-text) placeholder:text-(--color-term-subtle)/60 focus:outline-none transition-all duration-200"
                style={{
                  background: 'rgba(12,16,24,0.8)',
                  border: `1px solid ${passFocused ? 'rgba(245,158,11,0.5)' : 'rgba(25,32,48,0.8)'}`,
                  boxShadow: passFocused ? '0 0 0 2px rgba(245,158,11,0.1), 0 0 12px rgba(245,158,11,0.06)' : 'none',
                }}
              />
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'focus-ring relative mt-2 flex h-11 items-center justify-center overflow-hidden text-[12px] font-bold tracking-[0.22em] font-sans transition-all duration-200',
              loading && 'opacity-60 cursor-not-allowed',
            )}
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(245,158,11,0.12) 100%)',
              border: '1px solid rgba(245,158,11,0.45)',
              color: '#f59e0b',
              boxShadow: loading ? 'none' : '0 0 16px rgba(245,158,11,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
            aria-busy={loading}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(245,158,11,0.25), inset 0 1px 0 rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.65)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(245,158,11,0.12), inset 0 1px 0 rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.45)';
            }}
          >
            {/* Shimmer overlay */}
            {!loading && <span className="absolute inset-0 shimmer-btn opacity-40 pointer-events-none" />}
            <span className="relative z-10 flex items-center gap-2.5">
              {loading && (
                <span className="h-4 w-4 rounded-full border-2 border-(--color-term-accent)/40 border-t-(--color-term-accent) animate-spin" />
              )}
              {submitLabel}
            </span>
          </button>

          {/* Toggle register/login */}
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="focus-ring text-[10px] tracking-widest text-(--color-term-muted) hover:text-(--color-term-accent) motion-safe:transition-colors font-sans"
            >
              [{' '}{isRegister ? t('auth.switchToLogin', 'SWITCH_TO_LOGIN') : t('auth.requestAccess', 'REQUEST_NEW_ACCESS')}{' '}]
            </button>
          </div>
        </form>

        {/* Bottom corner decorators */}
        <span aria-hidden="true" className="absolute bottom-3 left-3 text-[8px] tracking-widest text-(--color-term-accent)/20 font-mono select-none">
          SYS:READY
        </span>
        <span aria-hidden="true" className="absolute bottom-3 right-3 text-[8px] tracking-widest text-(--color-term-muted)/20 font-mono select-none">
          v3.0.0
        </span>
      </motion.div>
    </div>
  );
}
