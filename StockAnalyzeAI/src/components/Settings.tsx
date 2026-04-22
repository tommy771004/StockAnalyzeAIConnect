/**
 * Settings.tsx
 *
 * Fix: handleSave now calls setSetting() IPC ??settings persist across sessions
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
  { id:'api',     icon:Key,      label:'API ?�鑰',   desc:'設�? AI ?��???��' },
  { id:'ollama',  icon:Server,   label:'?�地 AI',    desc:'Ollama ?��?模�?' },
  { id:'risk',    icon:Shield,   label:'風險?�管',   desc:'資�??�風?��??? },
  { id:'trading', icon:Zap,      label:'交�?設�?',   desc:'委�??�執行�?設�? },
  { id:'market-ai', icon:BarChart2, label:'市場??AI', desc:'?�表??AI 模�??�設' },
  { id:'ai',      icon:Cpu,      label:'AI 行為',    desc:'交�?決�?模�?' },
  { id:'notif',   icon:Bell,     label:'?�知設�?',   desc:'警報?��??? },
  { id:'display', icon:Palette,  label:'顯示設�?',   desc:'介面外�?' },
  { id:'data',    icon:Database, label:'資�?管�?',   desc:'?�出?��??? },
  { id:'hotkeys', icon:Keyboard, label:'快捷??,     desc:'?�盤?��?說�?' },
];

const HOTKEYS = [
  { key:'M', action:'?��??��??�總�?,       hint:'Markets ?�面' },
  { key:'T', action:'?��???Trading Core', hint:'快速�??�個股' },
  { key:'B', action:'?��??��?測�???,       hint:'?��?策略?�測' },
  { key:'S', action:'?��??��??��?�?,       hint:'Sentiment ?��?' },
  { key:'X', action:'?��??�智?�選??,       hint:'XQ-style ?�股?��?' },
  { key:'P', action:'?��??��?資�???,       hint:'?��??��? },
  { key:'J', action:'?��??�交?�日�?,       hint:'記�?交�?' },
  { key:'R', action:'?�新?��??�面',         hint:'?�新載入資�?' },
  { key:'?�K', action:'?��??�票?��?',       hint:'快速�?尋任何代�? },
  { key:'Esc', action:'?��?彈�? / ?��??��?', hint:'' },
];

// ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
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

  // ?�?� Load from IPC on mount ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
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

  // ?�?� Save to IPC ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
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
      setSaveErr(e instanceof Error ? e.message : '?��?失�?');
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

  // ?�?� UI helpers ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
  const Row = ({ label, hint, children }: { label:string; hint?:string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
      <div>
        <div className="text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>{label}</div>
        {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--md-outline)' }}>{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  const Toggle = ({ k }: { k: string }) => (
    <button onClick={() => set(k, !settings[k])}
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{ background: settings[k] ? 'var(--md-primary)' : 'var(--md-surface-container-high)' }}>
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', Boolean(settings[k])&&'translate-x-5')}/>
    </button>
  );

  const TextInput = ({ k, placeholder, type='text' }: { k:string; placeholder?:string; type?:string }) => (
    <input type={type} value={settings[k] as string|number|undefined ?? ''} onChange={e => set(k, e.target.value)}
      placeholder={placeholder}
      className="rounded-xl px-3 py-2 text-sm focus:outline-none w-full md:w-64 transition-colors"
      style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}/>
  );

  const NumInput = ({ k, min, max, step, unit }: {k:string; min?:number; max?:number; step?:string; unit?:string}) => (
    <div className="flex items-center gap-2">
      <input type="number" value={settings[k] as string|number|undefined ?? ''} min={min} max={max} step={step??'0.1'}
        onChange={e => set(k, e.target.value)}
        className="rounded-xl px-3 py-2 text-sm focus:outline-none w-28 text-right font-mono transition-colors"
        style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}/>
      {unit && <span className="text-xs" style={{ color: 'var(--md-outline)' }}>{unit}</span>}
    </div>
  );

  const SecretInput = ({ k, placeholder }: {k:string; placeholder?:string}) => (
    <div className="relative">
      <input type={showKey[k]?'text':'password'} value={settings[k] as string|number|undefined ?? ''} onChange={e => set(k, e.target.value)}
        placeholder={placeholder??'?�設�?}
        className="rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none w-full md:w-64 font-mono transition-colors"
        style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}/>
      <button onClick={() => setShowKey(p => ({ ...p, [k]:!p[k] }))}
        className="absolute right-2 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--md-outline)' }}>
        {showKey[k] ? <EyeOff size={14}/> : <Eye size={14}/>}
      </button>
    </div>
  );

  if (!loaded) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--md-outline)' }}>
        <RefreshCw size={16} className="animate-spin"/> 載入設�?中�?      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden p-4 md:p-6"
    >

      {/* ?�?� Sidebar ?�?� */}
      <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-3 md:gap-2 px-1 md:px-0 -mx-1 md:mx-0 overflow-x-auto md:overflow-y-auto pb-3 md:pb-0 snap-x md:snap-none snap-mandatory mobile-hide-scrollbar scroll-smooth" style={{ borderBottom: '1px solid var(--md-outline-variant)' }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className="shrink-0 snap-start flex items-center md:items-start gap-2.5 md:gap-3 px-4 md:px-4 py-2.5 md:py-3 rounded-2xl text-left transition-all whitespace-nowrap"
            style={active===s.id
              ? { background: 'rgba(192,193,255,0.12)', border: '1px solid rgba(192,193,255,0.4)', color: 'var(--md-primary)' }
              : { background: 'transparent', border: '1px solid transparent', color: 'var(--md-outline)' }}>
            <s.icon size={18} className="mt-0 md:mt-0.5 shrink-0"
              style={active===s.id ? { color: 'var(--md-primary)' } : { color: 'var(--md-outline)' }}/>
            <div className="hidden md:block">
              <div className="text-sm font-black leading-tight uppercase tracking-widest">{s.label}</div>
              <div className="label-meta opacity-60 mt-1 uppercase tracking-widest">{s.desc}</div>
            </div>
            {/* mobile label：�?�?tracking-widest（�? CJK ?�而�?壓�? */}
            <span className="md:hidden text-[13px] font-bold">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ?�?� Content ?�?� */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>{SECTIONS.find(s=>s.id===active)?.label}</h2>
            <p className="label-meta mt-1 uppercase tracking-widest" style={{ color: 'var(--md-outline)' }}>{SECTIONS.find(s=>s.id===active)?.desc}</p>
          </div>
          {active !== 'hotkeys' && (
            <div className="flex items-center gap-3">
              {saveErr && <span className="text-xs flex items-center gap-1" style={{ color: 'var(--md-error)' }}><AlertCircle size={11}/>{saveErr}</span>}
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all"
                style={saved
                  ? { background: 'rgba(82,196,26,0.1)', color: 'var(--color-down)', border: '1px solid rgba(82,196,26,0.25)' }
                  : { background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface)', border: '1px solid var(--md-outline-variant)' }}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : saved ? <CheckCircle size={14}/> : <Save size={14}/>}
                {saving ? '?��?中�? : saved ? '已儲�??? : '?��?設�?'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 glass-card rounded-[2rem] p-4 md:p-8">

          {/* ?�?� API ?�鑰 ?�?� */}
          {active==='api' && (
            <div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(173,198,255,0.05)', border: '1px solid rgba(173,198,255,0.2)', color: 'var(--md-on-surface-variant)' }}>
                <div className="font-bold mb-1 flex items-center gap-1.5" style={{ color: 'var(--md-secondary)' }}><Info size={12}/> 說�?</div>
                OpenRouter ?��?多種 AI 模�?（Claude?�GPT-4o?�Gemini 等�??�統一 API�?                注�??�費帳�?後可?��??�鑰?�設定�?，TradingCore ??AI ?��??�能?�能�?��?��???              </div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(255,183,131,0.05)', border: '1px solid rgba(255,183,131,0.2)', color: 'var(--md-on-surface-variant)' }}>
                <div className="font-bold mb-1 flex items-center gap-1.5" style={{ color: 'var(--md-tertiary)' }}><AlertCircle size={12}/> 安全?��?</div>
                API ?�鑰?��??��??�本?�設定�?（�??��??��??�在?�用裝置上使?��?並避?�洩?��??�給他人??                如�??�慮，�???OpenRouter 後台定�?輪�?（Rotate）�??��?              </div>
              <Row label="OpenRouter API Key" hint="�?openrouter.ai ?��?，用??AI ?��??�能">
                <SecretInput k="openrouterKey" placeholder="sk-or-v1-??/>
              </Row>
              <Row label="API ?�??>
                <span className={cn('text-xs px-2 py-1 rounded-full font-bold')}
                  style={settings.openrouterKey
                    ? { background: 'rgba(82,196,26,0.15)', color: 'var(--color-down)', border: '1px solid rgba(82,196,26,0.3)' }
                    : { background: 'rgba(255,183,131,0.12)', color: 'var(--md-tertiary)', border: '1px solid rgba(255,183,131,0.3)' }}>
                  {settings.openrouterKey ? '??已設�? : '?��? ?�設定�?AI ?�能?��?�?}
                </span>
              </Row>
              <div className="mt-4 p-3 rounded-xl" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--md-outline)' }}>快速�?�?API Key�?/div>
                <div className="text-xs space-y-1" style={{ color: 'var(--md-on-surface-variant)' }}>
                  <div>1. ?��? <span className="font-mono" style={{ color: 'var(--md-primary)' }}>https://openrouter.ai</span> 注�?帳�?</div>
                  <div>2. 點�??�Keys?��??�Create Key??/div>
                  <div>3. 複製?�鑰貼到上方輸入�?/div>
                  <div>4. 點�??�儲存設定�?/div>
                </div>
              </div>
            </div>
          )}

          {/* ?�?� ?�地 AI ?�?� */}
          {active==='ollama' && (
            <div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(192,193,255,0.05)', border: '1px solid rgba(192,193,255,0.2)', color: 'var(--md-on-surface-variant)' }}>
                <div className="font-bold mb-1" style={{ color: 'var(--md-primary)' }}>?�� 什麼是 Ollama�?/div>
                Ollama ?�以?��??�電?��??�地?��? AI 模�?，�??��?費�?保護?��?，�??��?API Key??                ?�?��? <span className="font-mono" style={{ color: 'var(--md-primary)' }}>https://ollama.ai</span> 安�?後�??�使?��?              </div>
              <Row label="?�用?�地模�?" hint="使用 Ollama ?�代 OpenRouter">
                <Toggle k="useOllama"/>
              </Row>
              <Row label="Ollama 伺�??��??�" hint="?�設??http://localhost:11434">
                <TextInput k="ollamaBaseUrl" placeholder="http://localhost:11434"/>
              </Row>
              <Row label="????�??>
              <span className="text-xs px-2 py-1 rounded-full font-bold"
                  style={settings.useOllama
                    ? { background: 'rgba(82,196,26,0.15)', color: 'var(--color-down)', border: '1px solid rgba(82,196,26,0.3)' }
                    : { background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>
                  {settings.useOllama ? '??已�??? : '?��???}
                </span>
              </Row>
            </div>
          )}

          {/* ?�?� 風險?�管 ?�?� */}
          {active==='risk' && (
            <div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(255,77,79,0.05)', border: '1px solid rgba(255,77,79,0.2)', color: 'var(--md-on-surface-variant)' }}>
                <div className="font-bold mb-1" style={{ color: 'var(--color-up)' }}>?��? 風險管�?說�?</div>
                ?��??�數?�於 AI ?�薦?��?點�??��?大�?計�??��??��?風險?�制?�長?��??��??�鍵??                一?�建議�??��?風險 1-2%，�??��???5-10%??              </div>
              <Row label="?��??�大風?? hint="每�?交�??�多�?失本?��??��?比�?建議 1-2%�?>
                <NumInput k="maxRisk" min={0.1} max={10} unit="% / �?/>
              </Row>
              <Row label="?�設風報�? hint="?�利?��? ÷ ?��?距離（建�???2:1�?>
                <NumInput k="defaultRR" min={0.5} max={10} unit="??/>
              </Row>
              <Row label="ATR ?�數（�??��?" hint="?�實波�?幅度?�幾?��??��??��???>
                <NumInput k="atrMultiplier" min={0.5} max={5} unit="??ATR"/>
              </Row>
              <Row label="每日?�大�??��??? hint="觸發後�?止交?��?風控保護�?>
                <NumInput k="dailyDrawdown" min={1} max={20} unit="% / �?/>
              </Row>
            </div>
          )}

          {/* ?�?� 交�?設�? ?�?� */}
          {active==='trading' && (
            <div>
              <Row label="?�設委�??��?" hint="下單?��?設�??�數">
                <NumInput k="defaultOrderQty" min={1} max={10000} step="1" unit="??/>
              </Row>
              <Row label="?�設委�?類�?" hint="ROD (?�價?�日?��?) ??IOC (立即?�交?��??��?)">
                <select value={String(settings.defaultOrderType || 'ROD')} onChange={e => set('defaultOrderType', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="ROD">ROD</option>
                  <option value="IOC">IOC</option>
                </select>
              </Row>
              <Row label="?�設?�格類�?" hint="LMT (?�價) ??MKT (市價)">
                <select value={String(settings.defaultPriceType || 'LMT')} onChange={e => set('defaultPriceType', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="LMT">LMT</option>
                  <option value="MKT">MKT</option>
                </select>
              </Row>
              <Row label="滑價容�?�? hint="市價?��?許�??�大價?��?�?>
                <NumInput k="slippageTolerance" min={0} max={5} step="0.1" unit="%"/>
              </Row>
              <Row label="?�設?��?" hint="下單?��?設使?��??��?">
                <TextInput k="defaultBroker" placeholder="例�?：�?大、�???/>
              </Row>
            </div>
          )}

          {/* ?�?� 市場??AI 設�? ?�?� */}
          {active==='market-ai' && (
            <div>
              <Row label="?�設?�表?��?" hint="?�表?�設顯示?��??�週�?">
                <select value={String(settings.defaultChartTimeframe || '1D')} onChange={e => set('defaultChartTimeframe', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="1M">1 ?��?</option>
                  <option value="5M">5 ?��?</option>
                  <option value="1H">1 小�?</option>
                  <option value="1D">1 �?/option>
                </select>
              </Row>
              <Row label="顯示貨幣" hint="?��?組�??��??�顯示�?貨幣?��?">
                <select value={String(settings.displayCurrency || 'TWD')} onChange={e => set('displayCurrency', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="TWD">TWD</option>
                  <option value="USD">USD</option>
                </select>
              </Row>
              <Row label="?�設 AI 模�?" hint="AI ?��??��?設使?��?模�?">
                <select value={String(settings.defaultModel || MODELS[0].id)} onChange={e => set('defaultModel', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  {MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </Row>
              <Row label="AI 系統?�令" hint="?��? AI ?��??�風?��?行為">
                <textarea value={String(settings.systemInstruction || '')} onChange={e => set('systemInstruction', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }} w-full md:w-64 h-28 md:h-24"
                  placeholder="例�?：�??��??��?守�??�術�??�師..."/>
              </Row>
            </div>
          )}

          {/* ?�?� AI 行為 ?�?� */}
          {active==='ai' && (
            <div>
              <Row label="交�?積極程度" hint="影響 AI ?��??�買�???�頻??>
                <select value={settings.aggressiveness as string | undefined} onChange={e => set('aggressiveness', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="Conservative">保�??��?訊�?少�?準�?</option>
                  <option value="Balanced">?�衡?��??�設�?/option>
                  <option value="Aggressive">積極?��?訊�?多�?</option>
                </select>
              </Row>
              <Row label="?��?交�?模�?" hint="?��? ?�用�?AI ?�自?�執行�?託�?高風?��?">
                <div className="flex items-center gap-2">
                  <Toggle k="autoTrading"/>
                  {settings.autoTrading && <span className="text-xs font-bold" style={{ color: 'var(--color-up)' }}>注�?：已?�用?��?交�?</span>}
                </div>
              </Row>
            </div>
          )}

          {/* ?�?� ?�知設�? ?�?� */}
          {active==='notif' && (
            <div>
              <Row label="?�格突破警報" hint="?�到設�??��??�通知">
                <Toggle k="priceAlerts"/>
              </Row>
              <Row label="委�??�交?�知" hint="訂單?�交?��??��?�?>
                <Toggle k="orderFillAlerts"/>
              </Row>
              <Row label="風控觸發警報" hint="?�撤超�??�風?��?件觸?��??�知">
                <Toggle k="riskAlerts"/>
              </Row>
              <Row label="系統?�知權�?" hint="使用?�覽??Electron ?��??�知視�?">
                <div className="flex items-center gap-2">
                  <Toggle k="browserNotifications"/>
                  <button onClick={requestNotifPermission}
                    className="text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: 'var(--md-primary)', border: '1px solid rgba(192,193,255,0.2)' }}>
                    請�?權�?
                  </button>
                </div>
              </Row>
            </div>
          )}

          {/* ?�?� 顯示設�? ?�?� */}
          {active==='display' && (
            <div>
              <Row label="介面主�?" hint="?��?深色?�淺?�模�?>
                <select value={String(settings.theme || 'dark')} onChange={e => set('theme', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="dark">深色</option>
                  <option value="light">淺色</option>
                  <option value="system">系統?�設</option>
                </select>
              </Row>
              <Row label="語�?" hint="?��??�用程�?顯示語�?">
                <select value={String(settings.language || 'zh-TW')} onChange={e => set('language', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="zh-TW">繁�?中�?</option>
                  <option value="en-US">English</option>
                </select>
              </Row>
              <Row label="?��?欄�?設�??? hint="?�用程�??��??�側?��??��???>
                <select value={String(settings.sidebarDefaultState || 'expanded')} onChange={e => set('sidebarDefaultState', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="expanded">展�?</option>
                  <option value="collapsed">?��?</option>
                </select>
              </Row>
              <Row label="Pro 模�? (緊�?顯示)" hint="縮�?字�??��?距�??�大�??��?資�?密度，適?��?業交?�員">
                <Toggle k="compactMode"/>
              </Row>
              <Row label="?�用?�畫?��?" hint="?��??��??��??�能設�??��??�度">
                <Toggle k="animationsOn"/>
              </Row>
              <Row label="?��??�新?��?" hint="市場資�??�更?�頻?��?秒�?">
                <div className="flex items-center gap-2">
                  <select value={settings.autoRefreshInterval as string | undefined} onChange={e => set('autoRefreshInterval', e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                    <option value="10">10 �?/option>
                    <option value="20">20 �?/option>
                    <option value="30">30 秒�??�設�?/option>
                    <option value="60">60 �?/option>
                    <option value="120">2 ?��?</option>
                  </select>
                </div>
              </Row>
              <Row label="字�?大�?" hint="調整?��?字�?大�?">
                <select value={settings.fontSize as string | undefined} onChange={e => set('fontSize', e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}">
                  <option value="small">�?/option>
                  <option value="normal">標�?</option>
                  <option value="large">�?/option>
                </select>
              </Row>
            </div>
          )}

          {/* ?�?� 資�?管�? ?�?� */}
          {active==='data' && (
            <div>
              {dbStats && (
                <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                  <div className="text-sm font-bold mb-3" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-heading)' }}>?? 資�?庫�???/div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ['交�?記�?', dbStats.trades, '�?],
                      ['?�倉數??, dbStats.positions, '�?],
                      ['?�選??, dbStats.watchlist, '??],
                      ['?�格警報', dbStats.alerts, '�?],
                    ].map(([k,v,u]) => (
                      <div key={k as string} className="rounded-lg p-3" style={{ background: 'var(--md-surface-container-high)' }}>
                        <div className="text-xs" style={{ color: 'var(--md-outline)' }}>{k}</div>
                        <div className="text-xl font-bold" style={{ color: 'var(--md-on-surface)', fontFamily: 'var(--font-data)' }}>{v} <span className="text-xs" style={{ color: 'var(--md-outline)' }}>{u}</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs" style={{ color: 'var(--md-outline)' }}>
                    路徑：<span className="font-mono" style={{ color: 'var(--md-on-surface-variant)' }}>{dbStats.dataPath}</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--md-outline)' }}>引擎：{dbStats.engine}</div>
                </div>
              )}
              <Row label="?�出設�?" hint="將目?��?設�??�出??JSON 檔�?">
                <button onClick={exportSettings}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors"
                  style={{ background: 'rgba(192,193,255,0.12)', color: 'var(--md-primary)', border: '1px solid rgba(192,193,255,0.3)' }}>
                  <Download size={13}/> ?�出 JSON
                </button>
              </Row>
              <Row label="?�新資�?統�?">
                <button onClick={() => getDbStats().then(res => setDbStats(res as DbStats | null))}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors"
                  style={{ background: 'var(--md-surface-container-high)', color: 'var(--md-on-surface-variant)', border: '1px solid var(--md-outline-variant)' }}>
                  <RefreshCw size={13}/> ?�新?��?
                </button>
              </Row>
              <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(255,77,79,0.05)', border: '1px solid rgba(255,77,79,0.2)' }}>
                <div className="text-sm font-bold mb-1" style={{ color: 'var(--color-up)', fontFamily: 'var(--font-heading)' }}>?��? ?�險?�??/div>
                <div className="text-xs mb-3" style={{ color: 'var(--md-on-surface-variant)' }}>清除?��??�?��??��?此�?作無法復?��?/div>
                {!clearConfirm ? (
                  <button onClick={() => setClearConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors"
                    style={{ background: 'rgba(255,77,79,0.15)', color: 'var(--color-up)', border: '1px solid rgba(255,77,79,0.3)' }}>
                    <Trash2 size={13}/> 清除?�?�本機�???                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--color-up)' }}>確�?要�??��??��??��?</span>
                    <button onClick={clearData} className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                      style={{ background: 'var(--color-up)', color: '#fff' }}>確�?清除</button>
                    <button onClick={() => setClearConfirm(false)} className="px-3 py-1.5 rounded-xl text-xs transition-colors"
                      style={{ background: 'var(--md-surface-container)', color: 'var(--md-outline)', border: '1px solid var(--md-outline-variant)' }}>?��?</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ?�?� 快捷???�?� */}
          {active==='hotkeys' && (
            <div>
              <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: 'rgba(192,193,255,0.05)', border: '1px solid rgba(192,193,255,0.2)', color: 'var(--md-on-surface-variant)' }}>
                <div className="font-bold mb-1" style={{ color: 'var(--md-primary)' }}>?��? ?�盤快捷??/div>
                使用快捷?�可以快?��??��??��?不�?要�??�側?��??�快?�鍵?�任何輸?��?外都?�使?��?              </div>
              <div className="space-y-2">
                {HOTKEYS.map(k => (
                  <div key={k.key} className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)' }}>
                    <kbd className="min-w-[36px] text-center rounded-lg px-2 py-1.5 text-xs font-mono font-bold shadow"
                      style={{ background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface)' }}>
                      {k.key}
                    </kbd>
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: 'var(--md-on-surface)' }}>{k.action}</div>
                      {k.hint && <div className="text-xs" style={{ color: 'var(--md-outline)' }}>{k.hint}</div>}
                    </div>
                    <div className="w-2 h-2 rounded-full" style={{ background: 'var(--md-primary)', opacity: 0.6 }}/>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs rounded-xl p-3" style={{ color: 'var(--md-outline)', background: 'var(--md-surface-container)', border: '1px solid var(--md-outline-variant)' }}>
                ?�� 快捷?�在 App.tsx 中已實�???��，確�?Electron 視�??�於?��??�?�即?�使?��?              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}