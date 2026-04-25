import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { Loader2, Save, User, Shield, CreditCard, Key, Edit2 } from 'lucide-react';

// Fix #6: typed user/settings state — no more useState<any>
interface UserProfile {
  id: string;
  email: string;
  name?: string;
  tier?: string;
}

interface AppSettings {
  OPENROUTER_API_KEY: string;
  NOTIFICATION_ENABLED: boolean;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    OPENROUTER_API_KEY: '',
    NOTIFICATION_ENABLED: true,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [uRes, sRes] = await Promise.all([
          fetch('/api/auth/me').then(r => r.json()),
          fetch('/api/settings/OPENROUTER_API_KEY').then(r => r.json().catch(() => ({}))),
        ]);
        setUser(uRes as UserProfile);
        if (sRes?.value) setSettings(prev => ({ ...prev, OPENROUTER_API_KEY: sRes.value as string }));
      } catch (err) {
        console.error('Settings fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/settings/OPENROUTER_API_KEY', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings.OPENROUTER_API_KEY }),
      });
      alert(t('settings.saved'));
    } catch {
      alert(t('settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-(--color-term-accent)" />
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-500/50 text-white px-4 py-2 rounded-sm text-sm transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('settings.saveChanges')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile */}
        <Panel title={t('settings.profile')} icon={<User className="h-4 w-4" />} collapsible>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
                {t('settings.name')}
              </label>
              <div className="text-sm font-medium">{user?.name || t('settings.notSet')}</div>
            </div>
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
                {t('settings.email')}
              </label>
              <div className="text-sm font-medium">{user?.email}</div>
            </div>
            <div className="pt-2">
              <button
                onClick={async () => {
                  const newName = prompt(t('settings.enterName'), user?.name || '');
                  if (newName && newName !== user?.name) {
                    setSaving(true);
                    try {
                      const res = await fetch('/api/auth/update', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName }),
                      });
                      const updated = await res.json();
                      setUser((prev: any) => ({ ...prev, name: updated.name }));
                      alert(t('settings.profileUpdated'));
                    } catch {
                      alert(t('settings.updateFailed'));
                    } finally {
                      setSaving(false);
                    }
                  }
                }}
                className="text-xs text-sky-400 hover:underline flex items-center gap-1"
              >
                <Edit2 className="h-3 w-3" /> {t('settings.editProfile')}
              </button>
            </div>
          </div>
        </Panel>

        {/* Subscription */}
        <Panel title={t('settings.subscription')} icon={<CreditCard className="h-4 w-4" />} collapsible>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('settings.currentPlan')}</span>
              <span className="bg-sky-500/20 text-sky-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
                {user?.tier || 'Free'}
              </span>
            </div>
            <p className="text-xs text-(--color-term-muted)">
              {t('settings.trialQuota', { n: 50 })}
            </p>
            <button
              onClick={() => window.location.href = `mailto:sales@antigravity.ai?subject=Enterprise%20Plan%20Inquiry%20-%20${user?.email}`}
              className="w-full bg-sky-500 hover:bg-sky-600 py-2 text-xs transition-colors rounded-sm font-bold"
            >
              {t('settings.contactSales')}
            </button>
          </div>
        </Panel>

        {/* AI & Integration */}
        <Panel title={t('settings.aiIntegration')} icon={<Key className="h-4 w-4" />} collapsible className="md:col-span-2">
          <div className="p-4 space-y-6">
            <div>
              <label className="text-[11px] text-(--color-term-muted) uppercase tracking-widest block mb-2">
                {t('settings.apiKey')}
              </label>
              <input
                type="password"
                value={settings.OPENROUTER_API_KEY}
                onChange={e => setSettings({ ...settings, OPENROUTER_API_KEY: e.target.value })}
                placeholder="sk-or-v1-..."
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-sky-500 transition-colors"
              />
              <p className="text-[10px] text-(--color-term-muted) mt-2 italic">
                * {t('settings.apiKeyDesc')}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-(--color-term-border) pt-4">
              <div>
                <div className="text-sm font-medium">{t('settings.notifications')}</div>
                <div className="text-xs text-(--color-term-muted)">{t('settings.notificationsDesc')}</div>
              </div>
              <div
                className={cn(
                  'w-10 h-5 rounded-full relative cursor-pointer transition-colors',
                  settings.NOTIFICATION_ENABLED ? 'bg-sky-500' : 'bg-zinc-700',
                )}
                onClick={() => setSettings({ ...settings, NOTIFICATION_ENABLED: !settings.NOTIFICATION_ENABLED })}
              >
                <div className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                  settings.NOTIFICATION_ENABLED ? 'translate-x-5' : 'translate-x-0',
                )} />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
