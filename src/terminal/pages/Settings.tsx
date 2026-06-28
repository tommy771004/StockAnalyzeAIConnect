import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../ui/Panel';
import { cn } from '../../lib/utils';
import { useToast } from '../../contexts/ToastContext';
import { Loader2, Save, User, Shield, CreditCard, Key, Edit2, Check, X } from 'lucide-react';
import { AgentTokenPanel } from '../../components/Settings/AgentTokenPanel';
import { AgentAuditPanel } from '../../components/Settings/AgentAuditPanel';

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
  const { toast } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
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
      toast(t('settings.saved'), 'success');
    } catch {
      toast(t('settings.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async () => {
    const newName = nameDraft.trim();
    if (!newName || newName === user?.name) { setEditingName(false); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const updated = await res.json();
      setUser(prev => (prev ? { ...prev, name: updated.name } : prev));
      toast(t('settings.profileUpdated'), 'success');
      setEditingName(false);
    } catch {
      toast(t('settings.updateFailed'), 'error');
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
          className="focus-ring flex items-center gap-2 bg-(--color-term-accent) hover:bg-(--color-term-accent-soft) disabled:opacity-50 text-(--color-term-bg) font-semibold px-4 py-2 rounded-sm text-sm motion-safe:transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('settings.saveChanges')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-start">
        {/* Left column — account */}
        <div className="flex flex-col gap-6">
        {/* Profile */}
        <Panel title={t('settings.profile')} icon={<User className="h-4 w-4" />} collapsible>
          <div className="p-4 space-y-4">
            <div>
              <label htmlFor="profile-name" className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
                {t('settings.name')}
              </label>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    id="profile-name"
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                    placeholder={t('settings.enterName')}
                    className="flex-1 bg-(--color-term-panel) border border-(--color-term-border) text-sm px-2 py-1 outline-none focus:border-(--color-term-accent) transition-colors rounded-sm"
                  />
                  <button type="button" onClick={handleSaveName} disabled={saving} aria-label={t('common.save', 'Save')}
                    className="focus-ring p-1.5 rounded-sm text-(--color-term-accent) hover:bg-(--color-term-accent)/10 disabled:opacity-50">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => setEditingName(false)} aria-label={t('common.cancel', 'Cancel')}
                    className="focus-ring p-1.5 rounded-sm text-(--color-term-muted) hover:bg-white/5">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-sm font-medium">{user?.name || t('settings.notSet')}</div>
              )}
            </div>
            <div>
              <label className="text-[10px] text-(--color-term-muted) uppercase tracking-widest block mb-1">
                {t('settings.email')}
              </label>
              <div className="text-sm font-medium">{user?.email}</div>
            </div>
            {!editingName && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => { setNameDraft(user?.name || ''); setEditingName(true); }}
                  className="focus-ring text-xs text-(--color-term-accent) hover:underline flex items-center gap-1"
                >
                  <Edit2 className="h-3 w-3" /> {t('settings.editProfile')}
                </button>
              </div>
            )}
          </div>
        </Panel>

        {/* Subscription */}
        <Panel title={t('settings.subscription')} icon={<CreditCard className="h-4 w-4" />} collapsible>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('settings.currentPlan')}</span>
              <span className="bg-(--color-term-accent)/20 text-(--color-term-accent) text-[10px] px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">
                {user?.tier || 'Free'}
              </span>
            </div>
            <p className="text-xs text-(--color-term-muted)">
              {t('settings.trialQuota', { n: 50 })}
            </p>
            <button
              onClick={() => window.location.href = `mailto:sales@antigravity.ai?subject=Enterprise%20Plan%20Inquiry%20-%20${user?.email}`}
              className="focus-ring w-full bg-(--color-term-accent) hover:bg-(--color-term-accent-soft) text-(--color-term-bg) py-2 text-xs motion-safe:transition-colors rounded-sm font-bold"
            >
              {t('settings.contactSales')}
            </button>
          </div>
        </Panel>
        </div>

        {/* AI & Integration */}
        <Panel title={t('settings.aiIntegration')} icon={<Key className="h-4 w-4" />} collapsible>
          <div className="p-4 space-y-6">
            <div>
              <label htmlFor="openrouter-api-key" className="text-[11px] text-(--color-term-muted) uppercase tracking-widest block mb-2">
                {t('settings.apiKey')}
              </label>
              <input
                id="openrouter-api-key"
                type="password"
                value={settings.OPENROUTER_API_KEY}
                onChange={e => setSettings({ ...settings, OPENROUTER_API_KEY: e.target.value })}
                placeholder="sk-or-v1-..."
                className="w-full bg-(--color-term-panel) border border-(--color-term-border) text-sm p-2 outline-none focus:border-(--color-term-accent) transition-colors"
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
              <button
                type="button"
                role="switch"
                aria-checked={settings.NOTIFICATION_ENABLED}
                aria-label={t('settings.notifications')}
                onClick={() => setSettings({ ...settings, NOTIFICATION_ENABLED: !settings.NOTIFICATION_ENABLED })}
                className={cn(
                  'focus-ring w-10 h-5 rounded-full relative cursor-pointer transition-colors shrink-0',
                  settings.NOTIFICATION_ENABLED ? 'bg-(--color-term-accent)' : 'bg-zinc-700',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                  settings.NOTIFICATION_ENABLED ? 'translate-x-5' : 'translate-x-0',
                )} />
              </button>
            </div>
          </div>
        </Panel>
        <div className="md:col-span-2 space-y-6">
          <Panel title={t('agentTokens.title', 'Scoped Agent Tokens')} icon={<Shield className="h-4 w-4" />} collapsible>
            <div className="p-4"><AgentTokenPanel /></div>
          </Panel>
          <Panel title={t('agentAudit.title', 'Agent Audit Trail')} icon={<Shield className="h-4 w-4" />} collapsible>
            <div className="p-4"><AgentAuditPanel /></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
