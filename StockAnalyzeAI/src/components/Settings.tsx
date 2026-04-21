/**
 * Settings.tsx
 *
 * Fix: handleSave now calls setSetting() IPC — settings persist across sessions
 * Fix: useEffect loads settings from IPC on mount (not just localStorage)
 * New: db stats display, keyboard shortcuts actually shown, better Chinese labels
 */
import { useState, useEffect } from 'react';
import {
  Key, Shield, Zap, Save, Server, Bell, Palette,
  Keyboard, Database, CheckCircle, Eye, EyeOff,
  Trash2, Download, RefreshCw, AlertCircle, Info, Cpu, BarChart2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getSetting, setSetting, getDbStats } from '../services/api';
import { motion } from 'motion/react';
import { useSettings } from '../contexts/SettingsContext';
import { MODELS } from '../constants';
import Decimal from 'decimal.js';

const DEFAULT_SETTINGS = {
  openrouterKey:       '',
  ollamaBaseUrl:       'http://localhost:11434',
  useOllama:           false,
  maxRisk:             '2.0',
  defaultRR:           '2.5',
  atrMultiplier:       '1.5',
  dailyDrawdown:       '5.0',
  aggressiveness:      'Balanced',
  autoTrading:         false,
  priceAlerts:         true,
  orderFillAlerts:     true,
  riskAlerts:          true,
  browserNotifications:false,
  compactMode:         false,
  animationsOn:        true,
  autoRefreshInterval: '30',
  fontSize:            'normal',
};
type S = typeof DEFAULT_SETTINGS & Record<string, unknown>;

const SECTIONS = [
  { id:'api',     icon:Key,      label:'API 金鑰',   desc:'設定 AI 服務連接' },
  { id:'ollama',  icon:Server,   label:'本地 AI',    desc:'Ollama 本機模型' },
  { id:'risk',    icon:Shield,   label:'風險控管',   desc:'資金與風險參數' },
  { id:'trading', icon:Zap,      label:'交易設定',   desc:'委託與執行預設值' },
  { id:'market-ai', icon:BarChart2, label:'市場與 AI', desc:'圖表與 AI 模型預設' },
  { id:'ai',      icon:Cpu,      label:'AI 行為',    desc:'交易決策模式' },
  { id:'notif',   icon:Bell,     label:'通知設定',   desc:'警報與提醒' },
  { id:'display', icon:Palette,  label:'顯示設定',   desc:'介面外觀' },
  { id:'data',    icon:Database, label:'資料管理',   desc:'匯出與清除' },
  { id:'hotkeys', icon:Keyboard, label:'快捷鍵',     desc:'鍵盤操作說明' },
];

const HOTKEYS = [
  { key:'M', action:'切換到市場總覽',       hint:'Markets 頁面' },
  { key:'T', action:'切換到 Trading Core', hint:'快速分析個股' },
  { key:'B', action:'切換到回測引擎',       hint:'執行策略回測' },
  { key:'S', action:'切換到市場情緒',       hint:'Sentiment 分析' },
  { key:'X', action:'切換到智慧選股',       hint:'XQ-style 選股掃描' },
  { key:'P', action:'切換到投資組合',       hint:'查看持倉' },
  { key:'J', action:'切換到交易日誌',       hint:'記錄交易' },
  { key:'R', action:'刷新當前頁面',         hint:'重新載入資料' },
  { key:'⌘K', action:'全域股票搜尋',       hint:'快速搜尋任何代碼' },
  { key:'Esc', action:'關閉彈窗 / 取消操作', hint:'' },
];

// ─────────────────────────────────────────────────────────────────────────────
interface DbStats {
  trades: number;
  positions: number;
  watchlist: number;
  alerts: number;
  dataPath: string;
  engine: string;
}

export default function Settings() {
  const [settings,      setSettings]      = useState<S>({ ...DEFAULT_SETTINGS });
  const { updateSetting } = useSettings();
  const [saved,         setSaved]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [active,        setActive]        = useState('api');
  const [showKey,       setShowKey]       = useState<Record<string,boolean>>({});
  const [dbStats,       setDbStats]       = useState<DbStats | null>(null);
  const [saveErr,       setSaveErr]       = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [loaded,        setLoaded]        = useState(false);

  // ── Load from IPC on mount ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Try to load each key from persistent storage
        const keys = Object.keys(DEFAULT_SETTINGS);
        const pairs = await Promise.all(keys.map(async k => {
          const v = await getSetting(k);
          return [k, v] as [string, unknown];
        }));
        const loaded: Partial<S> = {};
        pairs.forEach(([k, v]) => { if (v !== null && v !== undefined) loaded[k] = v; });
        setSettings(prev => ({ ...prev, ...loaded }));
      } catch(e) {
        // Fallback to localStorage for backwards compat
        console.warn('[Settings] loadFromIPC:', e);
        try {
          const raw = localStorage.getItem('llm_trader_settings');
          if (raw) setSettings(prev => ({ ...prev, ...JSON.parse(raw) }));
        } catch(le) { console.warn('[Settings] loadFromLocalStorage:', le); }
      } finally { setLoaded(true); }
    })();

    // Load db stats
    getDbStats().then(res => setDbStats(res as DbStats | null)).catch(e => console.warn('[Settings] getDbStats:', e));
  }, []);

  const set = (key: string, val: unknown) => {
    setSettings(p => ({ ...p, [key]: val }));
    updateSetting(key, val);
  };

  // ── Save to IPC ────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true); setSaveErr('');
    try {
      // Save all settings to persistent IPC store
      await Promise.all(
        (Object.entries(settings) as [keyof typeof settings, unknown][]).map(([k, v]) => setSetting(k as string, v))
      );
      // Also keep localStorage as fallback
      localStorage.setItem('llm_trader_settings', JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch(e: unknown) {
      setSaveErr(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const exportSettings = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], {type:'application/json'}));
    a.download = 'liquid-settings.json'; a.click();
  };

  const clearData = () => {
    localStorage.clear();
    setSettings({ ...DEFAULT_SETTINGS });
    setClearConfirm(false);
  };

  const requestNotifPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      set('browserNotifications', perm === 'granted');
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const Row = ({ label, hint, children }: { label:string; hint?:string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border-color)]">
      <div>
        <div className="text-sm font-semibold text-[var(--text-color)]">{label}</div>
        {hint && <div className="text-xs text-zinc-500 mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  const Toggle = ({ k }: { k: string }) => (
    <button onClick={() => set(k, !settings[k])}
      className={cn('relative w-11 h-6 rounded-full transition-colors', settings[k]?'bg-emerald-500':'bg-[var(--border-color)]')}>
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', Boolean(settings[k])&&'translate-x-5')}/>
    </button>
  );

  const TextInput = ({ k, placeholder, type='text' }: { k:string; placeholder?:string; type?:string }) => (
    <input type={type} value={settings[k] as string|number|undefined ?? ''} onChange={e => set(k, e.target.value)}
      placeholder={placeholder}
      className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none focus:border-emerald-500/50 w-full md:w-64 transition-colors"/>
  );

  const NumInput = ({ k, min, max, step, unit }: {k:string; min?:number; max?:number; step?:string; unit?:string}) => (
    <div className="flex items-center gap-2">
      <input type="number" value={settings[k] as string|number|undefined ?? ''} min={min} max={max} step={step??'0.1'}
        onChange={e => set(k, e.target.value)}
        className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none focus:border-emerald-500/50 w-28 text-right font-mono transition-colors"/>
      {unit && <span className="text-xs text-zinc-500">{unit}</span>}
    </div>
  );

  const SecretInput = ({ k, placeholder }: {k:string; placeholder?:string}) => (
    <div className="relative">
      <input type={showKey[k]?'text':'password'} value={settings[k] as string|number|undefined ?? ''} onChange={e => set(k, e.target.value)}
        placeholder={placeholder??'未設定'}
        className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 pr-9 text-[var(--text-color)] text-sm focus:outline-none focus:border-emerald-500/50 w-full md:w-64 font-mono transition-colors"/>
      <button onClick={() => setShowKey(p => ({ ...p, [k]:!p[k] }))}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-[var(--text-color)] transition-colors">
        {showKey[k] ? <EyeOff size={14}/> : <Eye size={14}/>}
      </button>
    </div>
  );

  if (!loaded) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-zinc-400 text-sm">
        <RefreshCw size={16} className="animate-spin"/> 載入設定中…
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden p-4 md:p-6"
    >

      {/* ── Sidebar ── */}
      <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-3 md:gap-2 px-1 md:px-0 -mx-1 md:mx-0 overflow-x-auto md:overflow-y-auto pb-3 md:pb-0 border-b md:border-b-0 border-zinc-800 snap-x md:snap-none snap-mandatory mobile-hide-scrollbar scroll-smooth">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={cn(
              'shrink-0 snap-start flex items-center md:items-start gap-2.5 md:gap-3 px-4 md:px-4 py-2.5 md:py-3 rounded-2xl text-left transition-all whitespace-nowrap border',
              active===s.id
                ? 'bg-zinc-800 border-zinc-600 text-zinc-100 shadow-lg shadow-black/30'
                : 'bg-zinc-900/60 md:bg-transparent border-zinc-800 md:border-transparent text-zinc-400 hover:bg-zinc-800/50',
            )}>
            <s.icon size={18} className={cn('mt-0 md:mt-0.5 shrink-0', active===s.id?'text-zinc-100':'')}/>
            <div className="hidden md:block">
              <div className="text-sm font-black leading-tight uppercase tracking-widest">{s.label}</div>
              <div className="label-meta opacity-60 mt-1 uppercase tracking-widest">{s.desc}</div>
            </div>
            {/* mobile label：取消 tracking-widest（對 CJK 反而擠壓） */}
            <span className="md:hidden text-[13px] font-bold">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-zinc-100 uppercase tracking-tighter">{SECTIONS.find(s=>s.id===active)?.label}</h2>
            <p className="label-meta text-zinc-500 mt-1 uppercase tracking-widest">{SECTIONS.find(s=>s.id===active)?.desc}</p>
          </div>
          {active !== 'hotkeys' && (
            <div className="flex items-center gap-3">
              {saveErr && <span className="text-xs text-rose-400 flex items-center gap-1"><AlertCircle size={11}/>{saveErr}</span>}
              <button onClick={save} disabled={saving}
                className={cn('flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest border transition-all',
                  saved?'bg-emerald-500/10 text-emerald-300 border-emerald-500/20':'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700')}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : saved ? <CheckCircle size={14}/> : <Save size={14}/>}
                {saving ? '儲存中…' : saved ? '已儲存 ✓' : '儲存設定'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 liquid-glass-strong rounded-[2rem] p-4 md:p-8 border border-zinc-800 bg-zinc-900/50">

          {/* ── API 金鑰 ── */}
          {active==='api' && (
            <div>
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
                <div className="text-blue-400 font-bold mb-1 flex items-center gap-1.5"><Info size={12}/> 說明</div>
                OpenRouter 提供多種 AI 模型（Claude、GPT-4o、Gemini 等）的統一 API，
                注冊免費帳號後可取得金鑰。設定後，TradingCore 的 AI 分析功能才能正常運作。
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
                <div className="text-amber-400 font-bold mb-1 flex items-center gap-1.5"><AlertCircle size={12}/> 安全提醒</div>
                API 金鑰目前儲存於本地設定檔（明文）。請勿在共用裝置上使用，並避免洩露金鑰給他人。
                如有疑慮，請至 OpenRouter 後台定期輪換（Rotate）金鑰。
              </div>
              <Row label="OpenRouter API Key" hint="從 openrouter.ai 取得，用於 AI 分析功能">
                <SecretInput k="openrouterKey" placeholder="sk-or-v1-…"/>
              </Row>
              <Row label="API 狀態">
                <span className={cn('text-xs px-2 py-1 rounded-full font-bold border',
                  settings.openrouterKey ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30')}>
                  {settings.openrouterKey ? '✓ 已設定' : '⚠️ 未設定（AI 功能受限）'}
                </span>
              </Row>
              <div className="mt-4 p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
                <div className="text-xs text-zinc-500 mb-2">快速取得 API Key：</div>
                <div className="text-xs text-zinc-400 space-y-1">
                  <div>1. 前往 <span className="text-blue-400 font-mono">https://openrouter.ai</span> 注冊帳號</div>
                  <div>2. 點擊「Keys」→「Create Key」</div>
                  <div>3. 複製金鑰貼到上方輸入框</div>
                  <div>4. 點擊「儲存設定」</div>
                </div>
              </div>
            </div>
          )}

          {/* ── 本地 AI ── */}
          {active==='ollama' && (
            <div>
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
                <div className="text-indigo-400 font-bold mb-1">💡 什麼是 Ollama？</div>
                Ollama 可以在你的電腦上本地執行 AI 模型，完全免費且保護隱私，不需要 API Key。
                需先從 <span className="text-indigo-400 font-mono">https://ollama.ai</span> 安裝後才能使用。
              </div>
              <Row label="啟用本地模型" hint="使用 Ollama 替代 OpenRouter">
                <Toggle k="useOllama"/>
              </Row>
              <Row label="Ollama 伺服器位址" hint="預設為 http://localhost:11434">
                <TextInput k="ollamaBaseUrl" placeholder="http://localhost:11434"/>
              </Row>
              <Row label="連線狀態">
                <span className={cn('text-xs px-2 py-1 rounded-full font-bold border',
                  settings.useOllama ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30')}>
                  {settings.useOllama ? '✓ 已啟用' : '未啟用'}
                </span>
              </Row>
            </div>
          )}

          {/* ── 風險控管 ── */}
          {active==='risk' && (
            <div>
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
                <div className="text-rose-400 font-bold mb-1">⚠️ 風險管理說明</div>
                這些參數用於 AI 推薦停損點和倉位大小計算。合理的風險控制是長期盈利的關鍵。
                一般建議：單筆風險 1-2%，回撤上限 5-10%。
              </div>
              <Row label="單筆最大風險" hint="每筆交易最多損失本金的百分比（建議 1-2%）">
                <NumInput k="maxRisk" min={0.1} max={10} unit="% / 筆"/>
              </Row>
              <Row label="預設風報比" hint="獲利目標 ÷ 停損距離（建議 ≥ 2:1）">
                <NumInput k="defaultRR" min={0.5} max={10} unit="倍"/>
              </Row>
              <Row label="ATR 倍數（停損）" hint="真實波動幅度的幾倍作為停損距離">
                <NumInput k="atrMultiplier" min={0.5} max={5} unit="倍 ATR"/>
              </Row>
              <Row label="每日最大回撤上限" hint="觸發後停止交易（風控保護）">
                <NumInput k="dailyDrawdown" min={1} max={20} unit="% / 天"/>
              </Row>
            </div>
          )}

          {/* ── 交易設定 ── */}
          {active==='trading' && (
            <div>
              <Row label="預設委託數量" hint="下單時預設的股數">
                <NumInput k="defaultOrderQty" min={1} max={10000} step="1" unit="股"/>
              </Row>
              <Row label="預設委託類型" hint="ROD (限價當日有效) 或 IOC (立即成交否則取消)">
                <select value={String(settings.defaultOrderType || 'ROD')} onChange={e => set('defaultOrderType', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="ROD">ROD</option>
                  <option value="IOC">IOC</option>
                </select>
              </Row>
              <Row label="預設價格類型" hint="LMT (限價) 或 MKT (市價)">
                <select value={String(settings.defaultPriceType || 'LMT')} onChange={e => set('defaultPriceType', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="LMT">LMT</option>
                  <option value="MKT">MKT</option>
                </select>
              </Row>
              <Row label="滑價容忍度" hint="市價單允許的最大價格偏差">
                <NumInput k="slippageTolerance" min={0} max={5} step="0.1" unit="%"/>
              </Row>
              <Row label="預設券商" hint="下單時預設使用的券商">
                <TextInput k="defaultBroker" placeholder="例如：元大、富邦"/>
              </Row>
            </div>
          )}

          {/* ── 市場與 AI 設定 ── */}
          {active==='market-ai' && (
            <div>
              <Row label="預設圖表週期" hint="圖表預設顯示的時間週期">
                <select value={String(settings.defaultChartTimeframe || '1D')} onChange={e => set('defaultChartTimeframe', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="1M">1 分鐘</option>
                  <option value="5M">5 分鐘</option>
                  <option value="1H">1 小時</option>
                  <option value="1D">1 天</option>
                </select>
              </Row>
              <Row label="顯示貨幣" hint="投資組合與分析顯示的貨幣單位">
                <select value={String(settings.displayCurrency || 'TWD')} onChange={e => set('displayCurrency', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="TWD">TWD</option>
                  <option value="USD">USD</option>
                </select>
              </Row>
              <Row label="預設 AI 模型" hint="AI 分析時預設使用的模型">
                <select value={String(settings.defaultModel || MODELS[0].id)} onChange={e => set('defaultModel', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  {MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Row>
              <Row label="AI 系統指令" hint="自訂 AI 的分析風格與行為">
                <textarea value={String(settings.systemInstruction || '')} onChange={e => set('systemInstruction', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none w-full md:w-64 h-28 md:h-24"
                  placeholder="例如：你是一個保守的技術分析師..."/>
              </Row>
            </div>
          )}

          {/* ── AI 行為 ── */}
          {active==='ai' && (
            <div>
              <Row label="交易積極程度" hint="影響 AI 產生的買賣訊號頻率">
                <select value={settings.aggressiveness as string | undefined} onChange={e => set('aggressiveness', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="Conservative">保守型（訊號少但準）</option>
                  <option value="Balanced">均衡型（預設）</option>
                  <option value="Aggressive">積極型（訊號多）</option>
                </select>
              </Row>
              <Row label="自動交易模式" hint="⚠️ 啟用後 AI 可自動執行委託（高風險）">
                <div className="flex items-center gap-2">
                  <Toggle k="autoTrading"/>
                  {settings.autoTrading && <span className="text-xs text-rose-400 font-bold">注意：已啟用自動交易</span>}
                </div>
              </Row>
            </div>
          )}

          {/* ── 通知設定 ── */}
          {active==='notif' && (
            <div>
              <Row label="價格突破警報" hint="達到設定價位時通知">
                <Toggle k="priceAlerts"/>
              </Row>
              <Row label="委託成交通知" hint="訂單成交時立即提示">
                <Toggle k="orderFillAlerts"/>
              </Row>
              <Row label="風控觸發警報" hint="回撤超限或風控條件觸發時通知">
                <Toggle k="riskAlerts"/>
              </Row>
              <Row label="系統通知權限" hint="使用瀏覽器/Electron 原生通知視窗">
                <div className="flex items-center gap-2">
                  <Toggle k="browserNotifications"/>
                  <button onClick={requestNotifPermission}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 border border-indigo-500/20 rounded-lg transition-colors">
                    請求權限
                  </button>
                </div>
              </Row>
            </div>
          )}

          {/* ── 顯示設定 ── */}
          {active==='display' && (
            <div>
              <Row label="介面主題" hint="選擇深色或淺色模式">
                <select value={String(settings.theme || 'dark')} onChange={e => set('theme', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="dark">深色</option>
                  <option value="light">淺色</option>
                  <option value="system">系統預設</option>
                </select>
              </Row>
              <Row label="語言" hint="選擇應用程式顯示語言">
                <select value={String(settings.language || 'zh-TW')} onChange={e => set('language', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="zh-TW">繁體中文</option>
                  <option value="en-US">English</option>
                </select>
              </Row>
              <Row label="側邊欄預設狀態" hint="應用程式啟動時側邊欄的狀態">
                <select value={String(settings.sidebarDefaultState || 'expanded')} onChange={e => set('sidebarDefaultState', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="expanded">展開</option>
                  <option value="collapsed">收合</option>
                </select>
              </Row>
              <Row label="Pro 模式 (緊湊顯示)" hint="縮小字體與間距，最大化螢幕資訊密度，適合專業交易員">
                <Toggle k="compactMode"/>
              </Row>
              <Row label="啟用動畫效果" hint="關閉可提升低效能設備的流暢度">
                <Toggle k="animationsOn"/>
              </Row>
              <Row label="自動刷新間隔" hint="市場資料的更新頻率（秒）">
                <div className="flex items-center gap-2">
                  <select value={settings.autoRefreshInterval as string | undefined} onChange={e => set('autoRefreshInterval', e.target.value)}
                    className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                    <option value="10">10 秒</option>
                    <option value="20">20 秒</option>
                    <option value="30">30 秒（預設）</option>
                    <option value="60">60 秒</option>
                    <option value="120">2 分鐘</option>
                  </select>
                </div>
              </Row>
              <Row label="字體大小" hint="調整全域字體大小">
                <select value={settings.fontSize as string | undefined} onChange={e => set('fontSize', e.target.value)}
                  className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-xl px-3 py-2 text-[var(--text-color)] text-sm focus:outline-none">
                  <option value="small">小</option>
                  <option value="normal">標準</option>
                  <option value="large">大</option>
                </select>
              </Row>
            </div>
          )}

          {/* ── 資料管理 ── */}
          {active==='data' && (
            <div>
              {dbStats && (
                <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)] p-4 mb-4">
                  <div className="text-sm font-bold text-[var(--text-color)] mb-3">📊 資料庫狀態</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ['交易記錄', dbStats.trades, '筆'],
                      ['持倉數量', dbStats.positions, '檔'],
                      ['自選股', dbStats.watchlist, '支'],
                      ['價格警報', dbStats.alerts, '條'],
                    ].map(([k,v,u]) => (
                      <div key={k as string} className="bg-[var(--bg-color)] rounded-lg p-3">
                        <div className="text-xs text-zinc-500">{k}</div>
                        <div className="text-xl font-bold text-[var(--text-color)]">{v} <span className="text-xs text-zinc-500">{u}</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-zinc-500">
                    儲存路徑：<span className="font-mono text-zinc-400">{dbStats.dataPath}</span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">引擎：{dbStats.engine}</div>
                </div>
              )}
              <Row label="匯出設定" hint="將目前的設定匯出為 JSON 檔案">
                <button onClick={exportSettings}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 text-sm border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors">
                  <Download size={13}/> 匯出 JSON
                </button>
              </Row>
              <Row label="刷新資料統計">
                <button onClick={() => getDbStats().then(res => setDbStats(res as DbStats | null))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--bg-color)] text-zinc-300 text-sm border border-[var(--border-color)] hover:bg-[var(--border-color)] transition-colors">
                  <RefreshCw size={13}/> 重新整理
                </button>
              </Row>
              <div className="mt-6 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                <div className="text-sm font-bold text-rose-400 mb-1">⚠️ 危險區域</div>
                <div className="text-xs text-zinc-400 mb-3">清除本機所有資料，此操作無法復原。</div>
                {!clearConfirm ? (
                  <button onClick={() => setClearConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 text-sm border border-rose-500/30 hover:bg-rose-500/30 transition-colors">
                    <Trash2 size={13}/> 清除所有本機資料
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-300">確定要清除所有資料？</span>
                    <button onClick={clearData} className="px-3 py-1.5 rounded-xl bg-rose-500 text-[var(--text-color)] text-xs font-bold hover:bg-rose-400 transition-colors">確認清除</button>
                    <button onClick={() => setClearConfirm(false)} className="px-3 py-1.5 rounded-xl bg-[var(--bg-color)] text-zinc-400 text-xs border border-[var(--border-color)] transition-colors">取消</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 快捷鍵 ── */}
          {active==='hotkeys' && (
            <div>
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 mb-4 text-xs text-zinc-400">
                <div className="text-indigo-400 font-bold mb-1">⌨️ 鍵盤快捷鍵</div>
                使用快捷鍵可以快速切換頁面，不需要點擊側邊欄。快捷鍵在任何輸入框外都可使用。
              </div>
              <div className="space-y-2">
                {HOTKEYS.map(k => (
                  <div key={k.key} className="flex items-center gap-3 p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-color)]">
                    <kbd className="min-w-[36px] text-center bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-[var(--text-color)] shadow">
                      {k.key}
                    </kbd>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[var(--text-color)]">{k.action}</div>
                      {k.hint && <div className="text-xs text-zinc-500">{k.hint}</div>}
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400/60"/>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-zinc-500 bg-[var(--card-bg)] rounded-xl p-3 border border-[var(--border-color)]">
                💡 快捷鍵在 App.tsx 中已實作監聽，確保 Electron 視窗處於焦點狀態即可使用。
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}