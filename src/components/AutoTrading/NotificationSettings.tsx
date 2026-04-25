/**
 * src/components/AutoTrading/NotificationSettings.tsx
 *
 * 通知通道設定：Telegram / Discord / Email / Webhook，
 * 對應後端 /api/autotrading/notifications endpoint。
 */
import React, { useEffect, useState } from 'react';
import { Bell, Plus, Trash2, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', placeholder: 'BOT_TOKEN:CHAT_ID', help: '從 @BotFather 取得 token，再用 @userinfobot 取得 chat id' },
  { id: 'discord', name: 'Discord', placeholder: 'https://discord.com/api/webhooks/...', help: '在頻道 → 整合 → Webhook → 複製 URL' },
  { id: 'webhook', name: 'Generic Webhook', placeholder: 'https://your-server.com/hook', help: '自訂 server，POST JSON' },
  { id: 'email', name: 'Email', placeholder: 'you@example.com', help: '需設 RESEND_API_KEY 環境變數，否則只 log' },
] as const;

const TRIGGERS = [
  { id: 'kill_switch', label: 'Kill Switch 觸發' },
  { id: 'risk_block', label: '訂單被風控攔截' },
  { id: 'fill', label: '訂單成交' },
  { id: 'daily_report', label: '每日結算' },
] as const;

interface SettingRow {
  id: number;
  channel: string;
  target: string;
  enabled: boolean;
  triggers: string[];
}

export function NotificationSettings() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ channel: 'telegram' as string, target: '', triggers: ['kill_switch'] as string[] });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/autotrading/notifications', { credentials: 'include' });
      const data = await res.json();
      if (data.ok) setRows(data.settings);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function save() {
    if (!draft.target.trim()) {
      setToast({ type: 'error', msg: 'target 必填' });
      return;
    }
    try {
      const res = await fetch('/api/autotrading/notifications', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      setDraft({ channel: 'telegram', target: '', triggers: ['kill_switch'] });
      load();
      setToast({ type: 'success', msg: '已儲存' });
    } catch (e) {
      setToast({ type: 'error', msg: (e as Error).message });
    }
  }

  async function remove(id: number) {
    await fetch(`/api/autotrading/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  async function test(channel: string, target: string) {
    try {
      const res = await fetch('/api/autotrading/notifications/test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, target }),
      });
      const data = await res.json();
      setToast({ type: data.ok ? 'success' : 'error', msg: data.message ?? (data.ok ? '測試訊息已送出' : '失敗') });
    } catch (e) {
      setToast({ type: 'error', msg: (e as Error).message });
    }
  }

  const channelMeta = CHANNELS.find(c => c.id === draft.channel) ?? CHANNELS[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Bell className="h-3 w-3 text-cyan-400" />
        <span className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">Notification Channels</span>
      </div>

      {/* Existing rows */}
      <div className="space-y-1">
        {rows.length === 0 && (
          <div className="text-[10px] text-(--color-term-muted) px-2 py-3 text-center">尚未設定任何通道</div>
        )}
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 border border-(--color-term-border) rounded text-[10px]">
            <span className="text-cyan-300 uppercase font-bold w-16">{r.channel}</span>
            <span className="flex-1 font-mono text-(--color-term-muted) truncate">{r.target}</span>
            <span className="text-(--color-term-muted)">{(r.triggers || []).length} 事件</span>
            {r.enabled ? <span className="text-emerald-400">●</span> : <span className="text-(--color-term-muted)">○</span>}
            <button onClick={() => remove(r.id)} className="text-rose-400 hover:text-rose-300 p-0.5"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>

      {/* New row */}
      <div className="border border-(--color-term-border) rounded p-3 space-y-2 bg-black/20">
        <div className="flex items-center gap-2">
          <select
            value={draft.channel}
            onChange={e => setDraft({ ...draft, channel: e.target.value })}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-white"
          >
            {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            type="text"
            value={draft.target}
            onChange={e => setDraft({ ...draft, target: e.target.value })}
            placeholder={channelMeta.placeholder}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-white font-mono"
          />
          <button
            onClick={() => test(draft.channel, draft.target)}
            className="px-2 py-1 text-[10px] border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 rounded hover:bg-cyan-500/20 flex items-center gap-1"
          >
            <Send className="h-3 w-3" /> 測試
          </button>
        </div>
        <div className="text-[9px] text-(--color-term-muted) px-1">{channelMeta.help}</div>

        <div>
          <div className="text-[9px] text-(--color-term-muted) uppercase mb-1">觸發事件</div>
          <div className="flex flex-wrap gap-1.5">
            {TRIGGERS.map(t => {
              const active = draft.triggers.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDraft({
                    ...draft,
                    triggers: active ? draft.triggers.filter(x => x !== t.id) : [...draft.triggers, t.id],
                  })}
                  className={cn(
                    'px-2 py-1 text-[9px] rounded border',
                    active ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-(--color-term-border) text-(--color-term-muted)'
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={save}
          className="w-full py-1.5 text-[10px] font-bold uppercase tracking-widest border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 rounded hover:bg-cyan-500/20 flex items-center justify-center gap-2"
        >
          <Plus className="h-3 w-3" /> 新增通道
        </button>
      </div>

      {toast && (
        <div className={cn(
          'p-2 border rounded flex items-center gap-2 text-[10px]',
          toast.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
        )}>
          {toast.type === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
