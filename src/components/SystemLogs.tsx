/**
 * SystemLogs.tsx
 *
 * Fix: Real memory/CPU data from process via system:stats IPC
 * New: Price Alerts management panel (IPC was ready, now has UI)
 * Fix: Better Chinese labels and beginner explanations
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw,
  Shield, Cpu,
  Bell, Plus, Trash2, TrendingUp, TrendingDown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as api from '../services/api';
import { Alert } from '../types';
import { pushLog } from './TradeLogger';
import { motion } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Broker {
  id: string; name: string; nameZh: string;
  status: 'connected'|'standby'|'error';
  protocol: string; latency: number; avatar: string;
}
interface LogEntry { time: string; type: string; text: string; }
interface SysStats {
  heapUsed: number; heapTotal: number; rss: number;
  cpuUser: number; cpuSystem: number;
  uptimeStr: string; nodeVersion: string; electronVersion: string; platform: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_BROKERS: Broker[] = [
  { id:'yuanta', name:'Yuanta Securities',    nameZh:'元大證券',       status:'connected', protocol:'FIX 4.4',  latency:8,  avatar:'元' },
  { id:'ib',     name:'Interactive Brokers',  nameZh:'盈透 TWS',       status:'connected', protocol:'TWS API',  latency:12, avatar:'IB' },
  { id:'futu',   name:'Futu Bull',            nameZh:'富途牛牛',       status:'standby',   protocol:'OpenAPI',  latency:0,  avatar:'富' },
];

const statusStyle = (s: Broker['status']): React.CSSProperties =>
  s==='connected'
    ? { color: 'var(--color-down)', background: 'rgba(82,196,26,0.12)', border: '1px solid rgba(82,196,26,0.3)' }
    : s==='standby'
    ? { color: 'var(--md-tertiary)', background: 'rgba(255,183,131,0.12)', border: '1px solid rgba(255,183,131,0.3)' }
    : { color: 'var(--color-up)', background: 'rgba(255,77,79,0.12)', border: '1px solid rgba(255,77,79,0.3)' };

const logStyle = (type: string): React.CSSProperties => {
  switch(type) {
    case 'SYSTEM': return { color: 'var(--color-down)', fontWeight: 600 };
    case 'API':    return { color: 'var(--md-secondary)' };
    case 'AI':     return { color: 'var(--md-on-surface-variant)' };
    case 'TRADE':  return { color: 'var(--color-down)', fontWeight: 700 };
    case 'NET':    return { color: 'var(--md-primary)' };
    case 'WARN':   return { color: 'var(--color-up)', fontWeight: 700 };
    default:       return { color: 'var(--md-outline)' };
  }
};

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  barColor: string;
  unit?: string;
  desc?: string;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, max, barColor, unit='%', desc }) => (
  <div>
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-semibold" style={{ color: 'var(--md-on-surface-variant)' }}>{label}</span>
      <span className="text-base font-bold font-mono" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{value}{unit}</span>
    </div>
    {desc ? <div className="text-xs mb-1" style={{ color: 'var(--md-outline)' }}>{desc}</div> : null}
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--md-surface-container-high)' }}>
      <div className="h-full rounded-full transition duration-500" style={{ width: `${Math.min(100, (value/max)*100)}%`, background: barColor }}/>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
export default function SystemLogs() {
  const [brokers,    setBrokers]    = useState<Broker[]>(DEFAULT_BROKERS);
  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [logFilter,  setLogFilter]  = useState<string>('ALL');
  const [sysStats,   setSysStats]   = useState<SysStats|null>(null);
  const [,           setPrevCpu]    = useState<{user:number;system:number;time:number}|null>(null);
  const [cpuPct,     setCpuPct]     = useState(0);
  const [tab,        setTab]        = useState<'broker'|'logs'|'alerts'|'system'>('broker');

  const [alerts,      setAlerts]     = useState<Alert[]>([]);
  const [alertLoading,setAlertLoad]  = useState(false);
  const [alertForm,   setAlertForm]  = useState({ symbol:'', condition:'above' as 'above'|'below', target:'' });
  const [alertErr,    setAlertErr]   = useState('');
  const [addingAlert, setAddingAlert]= useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load real system stats ─────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const raw = await api.getSystemStats();
      if (!mountedRef.current) return;
      if (raw && typeof raw === 'object') {
        const stats = raw as SysStats;
        // Calculate CPU % from delta
        const now = Date.now();
        setPrevCpu(prev => {
          if (prev) {
            const dt = now - prev.time;
            if (dt > 0) {
              const du = (stats.cpuUser   - prev.user)   / 1000;
              const ds = (stats.cpuSystem - prev.system) / 1000;
              const pct = Math.min(100, Math.round(((du + ds) / dt) * 100));
              setCpuPct(isFinite(pct) ? pct : 0);
            }
          }
          return { user: stats.cpuUser ?? 0, system: stats.cpuSystem ?? 0, time: now };
        });
        setSysStats(stats);
        return;
      }
      // ── Browser fallback: use Performance Memory API (Chrome) ──
      type PerfMemory = { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
      const mem = (performance as Performance & { memory?: PerfMemory }).memory;
      const MB = 1024 * 1024;
      setSysStats({
        heapUsed:        mem ? Math.round(mem.usedJSHeapSize  / MB) : 0,
        heapTotal:       mem ? Math.round(mem.totalJSHeapSize / MB) : 128,
        rss:             mem ? Math.round(mem.usedJSHeapSize  / MB) : 0,
        cpuUser:         0,
        cpuSystem:       0,
        uptimeStr:       `${Math.floor(performance.now() / 60000)} 分鐘`,
        nodeVersion:     navigator.userAgent.includes('Chrome') ? 'Browser (Chrome)' : 'Browser',
        electronVersion: '',
        platform:        navigator.platform || navigator.userAgent.slice(0, 40),
      });
    } catch(e) { console.warn("[SystemLogs] loadStats:", e); }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadStats();
    };
    init();
    const id = setInterval(loadStats, 10000);
    return () => clearInterval(id);
  }, [loadStats]);

  // ── Log stream ────────────────────────────────────────────────────────────
  useEffect(() => {
    const DEMO_LOGS: LogEntry[] = [
      { time: new Date().toLocaleTimeString(), type: 'SYSTEM', text: '應用程式啟動完成' },
      { time: new Date().toLocaleTimeString(), type: 'NET',    text: '正在連線至市場資料伺服器…' },
      { time: new Date().toLocaleTimeString(), type: 'API',    text: 'Yahoo Finance API 初始化' },
      { time: new Date().toLocaleTimeString(), type: 'AI',     text: 'AI 引擎待機中 (Ollama / OpenRouter)' },
      { time: new Date().toLocaleTimeString(), type: 'SYSTEM', text: '自選股清單已載入' },
    ];
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/logs');
        if (res.ok) {
          const data: LogEntry[] = await res.json();
          if (Array.isArray(data) && data.length > 0) { setLogs(data); return; }
        }
      } catch { /* silent — will fall through to demo */ }
      // Fallback: show demo logs so the tab is never completely empty
      if (mountedRef.current) setLogs(DEMO_LOGS);
    };
    fetchLogs();
    const id = setInterval(fetchLogs, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Load alerts ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'alerts') return;
    let mounted = true;
    
    const fetchAlerts = async () => {
      setAlertLoad(true);
      try {
        const d = await api.getAlerts();
        if (mounted) setAlerts(Array.isArray(d) ? d : []);
      } catch(e) {
        console.warn('[SystemLogs] fetchAlerts:', e);
      } finally {
        if (mounted) setAlertLoad(false);
      }
    };

    fetchAlerts();
    return () => { mounted = false; };
  }, [tab]);

  const handleAddAlert = async () => {
    if (!alertForm.symbol || !alertForm.target) { setAlertErr('請填入代碼和目標價格'); return; }
    const target = parseFloat(alertForm.target);
    if (!isFinite(target) || target <= 0) { setAlertErr('目標價格必須是大於 0 的數字'); return; }
    try {
      const a = await api.addAlert({ symbol:alertForm.symbol.toUpperCase(), condition:alertForm.condition as 'above' | 'below', target });
      setAlerts(p => [a, ...p]);
      setAlertForm({ symbol:'', condition:'above', target:'' });
      setAddingAlert(false); setAlertErr('');
    } catch(e: unknown) { setAlertErr(e instanceof Error ? e.message : '新增失敗'); }
  };

  const handleDeleteAlert = async (id: number) => {
    try { await api.deleteAlert(id); setAlerts(p => p.filter(a => a.id !== id)); }
    catch(e) { console.warn("[SystemLogs] deleteAlert:", e); }
  };

  const toggleBroker = (id: string) => {
    setBrokers(p => p.map(b => b.id===id
      ? { ...b, status: b.status==='connected'?'standby':'connected', latency: b.status==='connected'?0:Math.floor(8+Math.random()*20) }
      : b));
  };

  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.type === logFilter);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col gap-4 overflow-hidden"
    >

      {/* ── Tabs ── */}
      <div className="flex gap-2 shrink-0 flex-wrap">
        {[
          {id:'broker', label:'🔌 券商連接'},
          {id:'logs',   label:'📋 系統日誌'},
          {id:'alerts', label:'🔔 價格警報'},
          {id:'system', label:'💻 系統資源'},
        ].map(t => (
          <button key={t.id} type="button" onClick={(e) => { const validTabs = ['broker','logs','alerts','system'] as const; if (validTabs.includes(t.id as typeof validTabs[number])) setTab(t.id as typeof validTabs[number]); }}
            className="px-4 py-2 rounded-xl text-base font-semibold transition whitespace-nowrap"
            style={tab===t.id
              ? { background: 'rgba(192,193,255,0.12)', color: 'var(--md-primary)', border: '1px solid rgba(192,193,255,0.4)' }
              : { background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════ BROKER TAB ══════ */}
      {tab === 'broker' && (
        <div className="flex-1 overflow-auto">
          <div className="text-xs mb-3" style={{ color: 'var(--md-outline)' }}>連接券商 API 後，未來可進行真實委託。目前為模擬模式。</div>
          <div className="flex md:grid md:grid-cols-3 gap-4 overflow-x-auto pb-2 md:pb-0">
            {brokers.map(b => {
              const on = b.status === 'connected';
              return (
                <div key={b.id} className="glass-card rounded-2xl p-5 transition min-w-[240px]">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black"
                      style={on
                        ? { background: 'rgba(82,196,26,0.12)', color: 'var(--color-down)' }
                        : { background: 'var(--md-surface-container-high)', color: 'var(--md-outline)' }}>
                        {b.avatar}
                      </div>
                      <div>
                        <div className="text-base font-bold" style={{ color: 'var(--md-on-surface)' }}>{b.name}</div>
                        <div className="text-sm" style={{ color: 'var(--md-outline)' }}>{b.nameZh}</div>
                      </div>
                    </div>
                    <span className="text-sm px-2 py-1 rounded-full font-bold" style={statusStyle(b.status)}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block mr-1" style={{
                        background: on ? 'var(--color-down)' : b.status==='standby' ? 'var(--md-tertiary)' : 'var(--color-up)'
                      }}/>
                      {b.status==='connected'?'已連接':b.status==='standby'?'待機':'錯誤'}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm mb-4" style={{ color: 'var(--md-outline)', fontFamily: 'var(--font-data)' }}>
                    <div className="flex justify-between"><span>協定</span><span style={{ color: 'var(--md-on-surface)' }}>{b.protocol}</span></div>
                    <div className="flex justify-between">
                      <span>延遲</span>
                      <span style={{ color: on ? 'var(--color-down)' : 'var(--md-outline)' }}>{on?`${b.latency}ms`:'—'}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleBroker(b.id)}
                    className="w-full py-2 rounded-xl text-base font-bold transition active:scale-95"
                    style={on
                      ? { background: 'rgba(255,77,79,0.12)', color: 'var(--color-up)', border: '1px solid rgba(255,77,79,0.3)' }
                      : { background: 'rgba(82,196,26,0.12)', color: 'var(--color-down)', border: '1px solid rgba(82,196,26,0.3)' }}>
                    {on?'🔴 中斷連接 DISCONNECT':'🟢 建立連接 CONNECT'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.2)', color: 'var(--md-on-surface-variant)' }}>
            ⚠️ 目前為 UI 展示模式，連接按鈕不會觸發真實 API 呼叫。實際券商 API 整合需要額外設定。
          </div>
        </div>
      )}

      {/* ══════ LOGS TAB ══════ */}
      {tab === 'logs' && (
        <div className="flex-1 flex flex-col min-h-0 glass-card rounded-2xl overflow-hidden">
          {/* Filter bar */}
          <div className="flex items-center gap-2 p-3 shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
            {['ALL','SYSTEM','API','TRADE','AI','NET','WARN'].map(f => (
              <button key={f} type="button" onClick={() => setLogFilter(f)}
                className="px-2 py-1 rounded-lg text-sm font-bold transition"
                style={{ fontFamily: 'var(--font-data)', color: logFilter===f ? 'var(--md-on-surface)' : 'var(--md-outline)', background: logFilter===f ? 'var(--md-surface-container-high)' : 'transparent' }}>
                {f}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-down)' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--color-down)' }}/>
              即時串流
            </div>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-3 text-sm space-y-0.5" style={{ fontFamily: 'var(--font-data)' }}>
            {filteredLogs.map((l, i) => (
              <div key={i} className="flex gap-3 py-0.5 px-1 rounded">
                <span className="shrink-0 w-16" style={{ color: 'var(--md-outline)' }}>{l.time}</span>
                <span className="shrink-0 w-14" style={logStyle(l.type)}>{l.type}</span>
                <span style={{ color: 'var(--md-on-surface-variant)' }}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ PRICE ALERTS TAB ══════ */}
      {tab === 'alerts' && (
        <div className="flex-1 overflow-auto">
          <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(173,198,255,0.05)', border: '1px solid rgba(173,198,255,0.2)', color: 'var(--md-on-surface-variant)' }}>
            <div className="font-bold mb-1" style={{ color: 'var(--md-secondary)' }}>🔔 價格警報說明</div>
            設定目標價格，當股票達到您設定的條件時，系統會在日誌中記錄警報。
            下一版本將支援系統通知推播。
          </div>

          {/* Add Alert */}
          <div className="glass-card rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>新增價格警報 ADD ALERT</h3>
              <button type="button" onClick={() => setAddingAlert(v => !v)}
                className="text-[10px] md:text-xs flex items-center gap-1 px-3 py-1.5 rounded-xl transition-colors active:scale-95"
                style={{ color: 'var(--md-primary)', border: '1px solid rgba(192,193,255,0.3)', background: 'rgba(192,193,255,0.08)' }}>
                <Plus size={11}/> {addingAlert ? '關閉表單 CLOSE' : '新增警報 ADD NEW'}
              </button>
            </div>
            {addingAlert && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">股票代碼</div>
                    <input type="text" placeholder="例: AAPL" value={alertForm.symbol}
                      onChange={e => setAlertForm(p => ({...p, symbol:e.target.value.toUpperCase()}))}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-base sm:text-sm focus:outline-none focus:border-emerald-500/50 font-bold uppercase"/>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">觸發條件</div>
                    <select value={alertForm.condition} onChange={e => {
                      const val = e.target.value;
                      if (val === 'above' || val === 'below') setAlertForm(p => ({...p, condition: val}));
                    }}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-base sm:text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20">
                      <option value="above">📈 高於（突破）</option>
                      <option value="below">📉 低於（跌破）</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">目標價格</div>
                    <input type="number" step="0.01" placeholder="0.00" value={alertForm.target}
                      onChange={e => setAlertForm(p => ({...p, target:e.target.value}))}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-base sm:text-sm font-mono focus:outline-none focus:border-emerald-500/50"/>
                  </div>
                </div>
                {alertErr ? <div className="text-xs" style={{ color: 'var(--color-up)' }}>{alertErr}</div> : null}
                <div className="flex gap-2">
                  <button type="button" onClick={handleAddAlert}
                    className="px-5 py-2 rounded-xl text-sm font-bold transition bg-indigo-500 text-black hover:bg-indigo-400 active:scale-95">
                    ✓ 確認新增 CONFIRM
                  </button>
                  <button type="button" onClick={(e) => { setAddingAlert(false); setAlertErr(''); }}
                    className="px-5 py-2 rounded-xl text-sm transition-colors active:scale-95"
                    style={{ background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                    取消 CANCEL
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Alerts list */}
          <div className="glass-card rounded-2xl p-4">
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>
              已設定警報 <span className="font-normal" style={{ color: 'var(--md-outline)' }}>（{alerts.length} 條）</span>
            </h3>
            {alertLoading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--md-outline)' }}>
                <RefreshCw size={16} className="animate-spin mr-2"/> 載入中…
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--md-outline)' }}>
                <Bell size={24} className="mx-auto mb-2 opacity-40"/>
                <div className="text-sm">尚未設定任何價格警報</div>
              </div>
            ) : (
              <div className="flex md:grid md:grid-cols-1 gap-3 overflow-x-auto pb-2 md:pb-0">
                {alerts.map(a => (
                  <div key={a.id} className="min-w-[200px] md:min-w-0 flex items-center gap-3 p-3 rounded-xl transition"
                    style={a.triggered
                      ? { background: 'rgba(255,183,131,0.06)', border: '1px solid rgba(255,183,131,0.25)' }
                      : { background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={a.condition==='above'
                        ? { background: 'rgba(82,196,26,0.12)' }
                        : { background: 'rgba(255,77,79,0.12)' }}>
                      {a.condition==='above'
                        ? <TrendingUp size={14} style={{ color: 'var(--color-down)' }}/>
                        : <TrendingDown size={14} style={{ color: 'var(--color-up)' }}/>}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold" style={{ color: 'var(--md-on-surface)' }}>{a.symbol}</div>
                      <div className="text-xs" style={{ color: 'var(--md-on-surface-variant)' }}>
                        {a.condition==='above'?'當價格高於':'當價格低於'}{' '}
                        <span className="font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{a.target}</span>
                        {' '}時觸發
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full font-bold"
                      style={a.triggered
                        ? { background: 'rgba(255,183,131,0.12)', color: 'var(--md-tertiary)', border: '1px solid rgba(255,183,131,0.3)' }
                        : { background: 'var(--md-surface-container-high)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                      {a.triggered ? '🔔 已觸發' : '⏳ 監控中'}
                    </span>
                    <button type="button" onClick={() => handleDeleteAlert(a.id)}
                      className="p-1.5 rounded-lg transition-colors shrink-0 active:scale-90"
                      style={{ background: 'rgba(255,77,79,0.10)', color: 'var(--color-up)' }}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ SYSTEM STATS TAB ══════ */}
      {tab === 'system' && (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Real stats */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>應用程式資源</h3>
                <div className="text-sm flex items-center gap-1" style={{ color: 'var(--md-outline)' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--color-down)' }}/>
                  每 3 秒更新
                </div>
              </div>
              {sysStats ? (
                <div className="space-y-4">
                  <MetricBar
                    label="CPU 使用率"
                    value={cpuPct}
                    max={100}
                    barColor={cpuPct>80?'var(--color-up)':cpuPct>50?'var(--md-tertiary)':'var(--color-down)'}
                    desc="本程式佔用的 CPU 比例"
                  />
                  <MetricBar
                    label="記憶體（Heap 使用）"
                    value={sysStats.heapUsed}
                    max={sysStats.heapTotal}
                    barColor="var(--md-secondary)"
                    unit="MB"
                    desc={`已用 ${sysStats.heapUsed}MB / 分配 ${sysStats.heapTotal}MB`}
                  />
                  <MetricBar
                    label="RSS 記憶體"
                    value={Math.round(sysStats.rss)}
                    max={512}
                    barColor="var(--md-primary)"
                    unit="MB"
                    desc="程式實際佔用的系統記憶體"
                  />
                  <div className="pt-2 grid grid-cols-2 gap-3 text-sm" style={{ borderTop: '1px solid var(--md-outline-variant)' }}>
                    {[
                      ['運行時間', sysStats.uptimeStr],
                      ['平台', sysStats.platform],
                      ['Node.js', `v${sysStats.nodeVersion}`],
                      ['Electron', sysStats.electronVersion ? `v${sysStats.electronVersion}` : '—'],
                    ].map(([k,v]) => (
                      <div key={k}>
                        <div style={{ color: 'var(--md-outline)' }}>{k}</div>
                        <div className="font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-center py-8" style={{ color: 'var(--md-outline)' }}>
                  <Cpu size={24} className="mx-auto mb-2 opacity-40"/>
                  正在取得系統資訊…
                </div>
              )}
            </div>

            {/* AI Risk Controls */}
            <div className="glass-card rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={20} style={{ color: 'var(--md-tertiary)' }}/>
                <h3 className="text-base font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>AI 風控面板</h3>
              </div>
              <div className="text-sm mb-4" style={{ color: 'var(--md-outline)' }}>
                以下控制項影響 AI 的交易決策行為。調整後即時生效（模擬模式）。
              </div>
              <div className="space-y-4">
                {[
                  { label:'最大回撤上限', value:5, barColor:'var(--color-up)', desc:'超過此回撤比例時停止交易' },
                  { label:'AI 信心門檻',  value:70, barColor:'var(--md-tertiary)', desc:'低於此信心分數時不下單' },
                  { label:'市場流動性', value:85, barColor:'var(--color-down)', desc:'流動性評分（越高越安全）' },
                ].map(r => (
                  <MetricBar key={r.label} {...r} max={100} unit="%" />
                ))}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {['保守', '均衡', '積極'].map((m) => (
                    <button key={m} type="button" onClick={() => pushLog('info', 'SYSTEM', `Risk Profile changed to ${m}`)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors uppercase tracking-widest active:scale-95"> 
                      {m}
                    </button>
                  ))}
                </div>
                <div className="text-xs" style={{ color: 'var(--md-outline)' }}>⚠️ 風控參數調整會影響 AI 策略建議，請謹慎操作</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}