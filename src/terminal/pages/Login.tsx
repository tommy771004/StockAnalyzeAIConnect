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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError(t('auth.requiredFields'));
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
      setError(err.message || t('auth.authFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-(--color-term-bg) font-mono text-(--color-term-text) overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 z-0 term-grid-lines" />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-(--color-term-accent) opacity-5 blur-[150px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md border border-(--color-term-border) bg-(--color-term-panel) shadow-2xl p-8 backdrop-blur-md"
      >
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center justify-center border border-(--color-term-accent)/30 bg-(--color-term-accent)/10 p-3 text-(--color-term-accent)">
            <Terminal className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold tracking-[0.2em] text-(--color-term-text)">
            FIN-TERMINAL
          </h1>
          <p className="mt-2 text-[11px] tracking-widest text-(--color-term-muted)">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-4 flex items-center gap-3 border-l-2 border-(--color-term-negative) bg-(--color-term-negative)/10 px-3 py-2 text-[11px] text-(--color-term-negative) tracking-widest"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <AnimatePresence>
            {isRegister && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden flex flex-col gap-1"
              >
                <label className="text-[10px] tracking-widest text-(--color-term-muted)">
                  {t('auth.operatorId')}
                </label>
                <div className="relative">
                  <Cpu className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-term-subtle)" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.namePlaceholder')}
                    className="h-10 w-full border border-(--color-term-border) bg-(--color-term-surface) pl-10 pr-4 text-[13px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-subtle) focus:border-(--color-term-accent) focus:outline-none transition-colors"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] tracking-widest text-(--color-term-muted)">
              {t('auth.accessCoord')}
            </label>
            <div className="relative">
              <Network className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-term-subtle)" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="h-10 w-full border border-(--color-term-border) bg-(--color-term-surface) pl-10 pr-4 text-[13px] tracking-widest text-(--color-term-text) placeholder:text-(--color-term-subtle) focus:border-(--color-term-accent) focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] tracking-widest text-(--color-term-muted)">
              {t('auth.securityKey')}
            </label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-term-subtle)" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10 w-full border border-(--color-term-border) bg-(--color-term-surface) pl-10 pr-4 text-[13px] tracking-[0.25em] text-(--color-term-text) placeholder:text-(--color-term-subtle) focus:border-(--color-term-accent) focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'mt-2 relative h-10 overflow-hidden border border-(--color-term-accent) bg-(--color-term-accent)/20 text-[12px] font-bold tracking-[0.2em] text-(--color-term-accent) transition-all hover:bg-(--color-term-accent)/30',
              loading && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className={cn('relative z-10', loading && 'invisible')}>
              {isRegister ? t('auth.establishUplink') : t('auth.initiateHandshake')}
            </span>
            {loading && (
              <div className="absolute inset-0 z-0 flex items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-(--color-term-accent) border-t-transparent" />
              </div>
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-[10px] tracking-widest text-(--color-term-muted) hover:text-(--color-term-text) transition-colors"
            >
              [ {isRegister ? t('auth.switchToLogin') : t('auth.requestAccess')} ]
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
