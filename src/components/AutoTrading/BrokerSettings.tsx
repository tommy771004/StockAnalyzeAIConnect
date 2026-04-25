/**
 * src/components/AutoTrading/BrokerSettings.tsx
 * 券商 API 與連線設定頁
 *
 * 重構重點（2026-04）：
 *  - 不可用的 broker（KGI / Yuanta / Fugle / IB）UI 上明顯標示並停用「測試連線」按鈕
 *  - 顯示 Sinopac Python Bridge URL（讀自 /api/autotrading/broker/status）
 *  - API Key/Secret 採用 password 欄位 + 不寫死 placeholder，避免誤觸
 *  - 連線後給予 toast 與「最後測試時間」
 */
import React, { useEffect, useState } from 'react';
import { Shield, Key, FileText, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { BROKER_OPTIONS } from './types';

interface Props {
  onConnect: (config: any) => Promise<{ ok: boolean; message: string; requiresLocalSetup?: boolean }>;
  disabled?: boolean;
}

interface ServerStatus {
  brokerId: string;
  accountId: string;
  mode: string;
}

export function BrokerSettings({ onConnect, disabled }: Props) {
  const [selectedBroker, setSelectedBroker] = useState<string>('simulated');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [certPath, setCertPath] = useState('');
  const [accountId, setAccountId] = useState('');
  const [bridgeUrl, setBridgeUrl] = useState<string>('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg: string }>({ type: 'idle', msg: '' });
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/autotrading/broker/status', { credentials: 'include' });
        const data = await res.json();
        if (data.ok && data.config) {
          setSelectedBroker(data.config.brokerId);
          setAccountId(data.config.accountId ?? '');
          setBridgeUrl(data.bridgeUrl ?? '');
          setStatus({ type: 'success', msg: `已從伺服器恢復設定: ${data.config.brokerId}` });
        }
      } catch {
        // ignore — 未登入或服務未就緒
      }
    };
    fetchStatus();
  }, []);

  const broker = BROKER_OPTIONS.find(b => b.id === selectedBroker);
  const isStub = broker && !broker.available && selectedBroker !== 'sinopac';

  async function handleConnect() {
    setStatus({ type: 'loading', msg: '正在嘗試建立連線...' });
    try {
      const res = await onConnect({
        brokerId: selectedBroker,
        apiKey,
        apiSecret,
        certPath,
        accountId,
        bridgeUrl: bridgeUrl || undefined,
        mode: selectedBroker === 'simulated' ? 'simulated' : 'real',
      });
      setLastTestedAt(new Date().toLocaleString());
      setStatus({ type: res.ok ? 'success' : 'error', msg: res.message });
    } catch (e) {
      setStatus({ type: 'error', msg: (e as Error).message ?? '連線失敗' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Shield className="h-3 w-3 text-cyan-400" />
        <span className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">
          Broker Connectivity & API Setup
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {BROKER_OPTIONS.map(b => {
          const stub = !b.available && b.id !== 'sinopac';
          return (
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
                {stub && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold uppercase">
                    Coming Soon
                  </span>
                )}
                {!b.available && b.id === 'sinopac' && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 font-bold uppercase">
                    Requires Bridge
                  </span>
                )}
              </div>
              <div className="text-[9px] text-(--color-term-muted) mt-0.5">{b.note}</div>
            </div>
          </button>
        );})}
      </div>

      {/* API Form */}
      {selectedBroker !== 'simulated' && (
        <div className="p-4 border border-(--color-term-border) rounded-sm space-y-3 bg-black/20">
          {selectedBroker === 'sinopac' && (
            <div>
              <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
                <Globe className="h-2.5 w-2.5" /> Python Bridge URL
              </label>
              <input
                type="text"
                value={bridgeUrl}
                onChange={e => setBridgeUrl(e.target.value)}
                disabled={isStub}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
                placeholder="http://localhost:8001"
              />
              <div className="text-[9px] text-(--color-term-muted) mt-1">需先啟動 server/python/sinopac_bridge.py</div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
              <Key className="h-2.5 w-2.5" /> API Key
            </label>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={isStub}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
              placeholder={isStub ? '此券商尚未支援' : ''}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[9px] text-(--color-term-muted) uppercase mb-1.5">
              <Key className="h-2.5 w-2.5" /> API Secret / Token
            </label>
            <input
              type="password"
              autoComplete="off"
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              disabled={isStub}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
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
              disabled={isStub}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-white font-mono focus:border-cyan-500/50 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleConnect}
            disabled={disabled || isStub || status.type === 'loading'}
            className="w-full mt-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isStub ? '此券商尚未支援' : status.type === 'loading' ? '正在建立加密連線...' : '測試並儲存券商連線'}
          </button>

          {lastTestedAt && (
            <div className="text-[9px] text-(--color-term-muted) text-right">最後測試：{lastTestedAt}</div>
          )}
        </div>
      )}

      {selectedBroker === 'simulated' && (
        <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-sm flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-emerald-300 leading-relaxed">
            模擬交易模式已啟動。系統將自動模擬台灣市場的交易稅與手續費（含當沖減半），無需任何憑證或連線設定即可開始測試 AI 策略。
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
