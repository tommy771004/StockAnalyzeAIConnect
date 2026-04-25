/**
 * src/components/AutoTrading/BrokerSettings.tsx
 * 券商 API 與連線設定頁
 */
import React, { useState } from 'react';
import { Shield, Key, FileText, Globe, CheckCircle2, AlertCircle, ShieldAlert, Percent } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BROKER_OPTIONS } from './types';

interface Props {
  onConnect: (config: any) => Promise<{ ok: boolean; message: string; requiresLocalSetup?: boolean }>;
  disabled?: boolean;
}

export function BrokerSettings({ onConnect, disabled }: Props) {
  const [selectedBroker, setSelectedBroker] = useState<string>('simulated');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [certPath, setCertPath] = useState('');
  const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' });

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/autotrading/broker/status');
        const data = await res.json();
        if (data.ok && data.config) {
          setSelectedBroker(data.config.brokerId);
          setAccountId(data.config.accountId);
          setStatus({ type: 'success', msg: `已從伺服器恢復連線: ${data.config.brokerId}` });
        }
      } catch (e) { /* silent fail */ }
    };
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    setStatus({ type: 'loading', msg: '正在嘗試建立連線...' });
    const res = await onConnect({
      brokerId: selectedBroker,
      apiKey,
      apiSecret,
      certPath,
      accountId,
      mode: 'real'
    });
    
    if (res.ok) {
      setStatus({ type: 'success', msg: res.message });
    } else {
      setStatus({ type: 'error', msg: res.message });
    }
  };

  const broker = BROKER_OPTIONS.find(b => b.id === selectedBroker);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Shield className="h-3 w-3 text-cyan-400" />
        <span className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">
          Broker Connectivity & API Setup
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {BROKER_OPTIONS.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => { setSelectedBroker(b.id); setStatus({ type: 'idle', msg: '' }); }}
            disabled={disabled}
            className={cn(
              "text-left p-3 border rounded-sm transition-all flex items-center gap-4",
              selectedBroker === b.id ? "border-cyan-500/40 bg-cyan-500/5" : "border-(--color-term-border) bg-white/2 hover:bg-white/3"
            )}
          >
            <div className={cn(
              "h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
              selectedBroker === b.id ? "border-cyan-400 bg-cyan-400 text-black" : "border-(--color-term-muted)"
            )}>
              {selectedBroker === b.id && <div className="h-1.5 w-1.5 bg-black rounded-full" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px] font-bold", selectedBroker === b.id ? "text-cyan-300" : "text-(--color-term-text)")}>
                  {b.name}
                </span>
                {!b.available && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 font-bold uppercase">
                    Requires Bridge
                  </span>
                )}
              </div>
              <div className="text-[9px] text-(--color-term-muted) mt-0.5">{b.note}</div>
            </div>
          </button>
        ))}
      </div>

      {/* API Form */}
      {selectedBroker !== 'simulated' && (
        <div className="p-4 border border-(--color-term-border) rounded-sm space-y-3 bg-black/20">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
                <Key className="h-2.5 w-2.5" /> API Key
              </label>
              <input 
                type="password" 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
                placeholder="輸入券商 API Key"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
                <Key className="h-2.5 w-2.5" /> API Secret / Token
              </label>
              <input 
                type="password" 
                value={apiSecret} 
                onChange={e => setApiSecret(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
                placeholder="輸入 API Secret"
              />
            </div>
            {selectedBroker === 'sinopac' && (
              <div>
                <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
                  <FileText className="h-2.5 w-2.5" /> 憑證路徑 (.pfx)
                </label>
                <input 
                  type="text" 
                  value={certPath} 
                  onChange={e => setCertPath(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
                  placeholder="C:\Users\Name\AppData\...\cert.pfx"
                />
              </div>
            )}
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
                <Globe className="h-2.5 w-2.5" /> 帳號 (Account ID)
              </label>
              <input 
                type="text" 
                value={accountId} 
                onChange={e => setAccountId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
                placeholder="F123456789"
              />
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleConnect}
            disabled={disabled || status.type === 'loading'}
            className="w-full mt-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
          >
            {status.type === 'loading' ? '正在建立加密連線...' : '測試並儲存券商連線'}
          </button>
        </div>
      )}

      {selectedBroker === 'simulated' && (
        <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-sm flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-emerald-300 leading-relaxed">
            模擬交易模式已啟動。系統將自動模擬台灣市場的交易稅與手續費，無需任何憑證或連線設定即可開始測試 AI 策略。
          </div>
        </div>
      )}

      {/* Connection Feedback */}
      {status.type !== 'idle' && (
        <div className={cn(
          "p-3 border rounded flex items-start gap-3",
          status.type === 'success' ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
          status.type === 'error' ? "border-rose-500/30 bg-rose-500/10 text-rose-400" :
          "border-zinc-700 bg-zinc-800 text-zinc-400"
        )}>
          {status.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
          <div className="text-[10px] whitespace-pre-wrap">{status.msg}</div>
        </div>
      )}
    </div>
  );
}
