import React from "react";
/**
 * Settings.tsx
 *
 * Fix: handleSave now calls setSetting() IPC 讓 settings persist across sessions
 * Fix: useEffect loads settings from IPC on mount (not just localStorage)
 * New: db stats display, keyboard shortcuts actually shown, better Chinese labels
 */

import { useState, useEffect } from "react";
import {
  Key,
  Shield,
  Zap,
  Save,
  Server,
  Bell,
  Palette,
  Keyboard,
  Database,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  Cpu,
  BarChart2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { getSetting, setSetting, getDbStats } from "../services/api";
import { motion } from "motion/react";
import { useSettings } from "../contexts/SettingsContext";
import {
  useSubscription,
  SubscriptionTier,
} from "../contexts/SubscriptionContext";
import { MODELS, FREE_MODEL } from "../constants";
import Decimal from "decimal.js";

const DEFAULT_SETTINGS = {
  openrouterKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  useOllama: false,
  maxRisk: "2.0",
  defaultRR: "2.5",
  atrMultiplier: "1.5",
  dailyDrawdown: "5.0",
  aggressiveness: "Balanced",
  autoTrading: true,
  priceAlerts: true,
  orderFillAlerts: true,
  riskAlerts: true,
  browserNotifications: false,
  compactMode: false,
  animationsOn: true,
  autoRefreshInterval: "30",
  fontSize: "normal",
};

type S = typeof DEFAULT_SETTINGS & Record<string, unknown>;

const SECTIONS = [
  { id: "api", icon: Key, label: "API 金鑰", desc: "設定 AI 服務憑證" },
  { id: "ollama", icon: Server, label: "本地 AI", desc: "Ollama 本地模型" },
  { id: "risk", icon: Shield, label: "風險控管", desc: "資金與風險參數設定" },
  { id: "trading", icon: Zap, label: "交易設定", desc: "委託與執行相關設定" },
  {
    id: "market-ai",
    icon: BarChart2,
    label: "市場與 AI",
    desc: "圖表與 AI 模型設定",
  },
  { id: "ai", icon: Cpu, label: "AI 行為", desc: "交易決策模式" },
  { id: "notif", icon: Bell, label: "通知設定", desc: "警報與推播" },
  { id: "display", icon: Palette, label: "顯示設定", desc: "介面外觀" },
  { id: "data", icon: Database, label: "資料管理", desc: "匯出與清除" },
  { id: "hotkeys", icon: Keyboard, label: "快捷鍵", desc: "鍵盤操作說明" },
];

const HOTKEYS = [
  { key: "M", action: "切換到市場總覽", hint: "Markets 頁面" },
  { key: "T", action: "切換到 Trading Core", hint: "快速查詢個股" },
  { key: "B", action: "切換到回測模組", hint: "回測策略回測" },
  { key: "S", action: "切換到情緒分析", hint: "Sentiment 分析" },
  { key: "X", action: "切換到智慧選股", hint: "XQ-style 選股工具" },
  { key: "P", action: "切換到投資組合", hint: "持倉總覽" },
  { key: "J", action: "切換到交易日誌", hint: "記錄交易" },
  { key: "R", action: "重新整理當前頁面", hint: "重新載入資料" },
  { key: "⌘K", action: "開啟股票搜尋", hint: "快速搜尋任何代碼" },
  { key: "Esc", action: "關閉彈窗 / 取消操作", hint: "" },
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
  const [settings, setSettings] = useState<S>({ ...DEFAULT_SETTINGS });
  const { updateSetting } = useSettings();
  const { tier } = useSubscription();
  const isFree = tier === SubscriptionTier.FREE;
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState("api");
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [saveErr, setSaveErr] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Load from IPC on mount ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const keys = Object.keys(DEFAULT_SETTINGS);
        const pairs = await Promise.all(
          keys.map(async (k) => {
            const v = await getSetting(k);
            return [k, v] as [string, unknown];
          }),
        );
        const loaded: Partial<S> = {};
        pairs.forEach(([k, v]) => {
          if (v !== null && v !== undefined) loaded[k] = v;
        });
        setSettings((prev) => ({ ...prev, ...loaded }));
      } catch (e) {
        console.warn("[Settings] loadFromIPC:", e);
        try {
          const raw = localStorage.getItem("llm_trader_settings");
          if (raw) setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
        } catch (le) {
          console.warn("[Settings] loadFromLocalStorage:", le);
        }
      } finally {
        setLoaded(true);
      }
    })();

    getDbStats()
      .then((res) => setDbStats(res as DbStats | null))
      .catch((e) => console.warn("[Settings] getDbStats:", e));
  }, []);

  const set = (key: string, val: unknown) => {
    setSettings((p) => ({ ...p, [key]: val }));
    updateSetting(key, val);
  };

  // ── Save to IPC ────────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      await Promise.all(
        (Object.entries(settings) as [keyof typeof settings, unknown][]).map(
          ([k, v]) => setSetting(k as string, v),
        ),
      );
      localStorage.setItem("llm_trader_settings", JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const exportSettings = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      }),
    );
    a.download = "liquid-settings.json";
    a.click();
  };

  const clearData = () => {
    localStorage.clear();
    setSettings({ ...DEFAULT_SETTINGS });
    setClearConfirm(false);
  };

  const requestNotifPermission = async () => {
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      set("browserNotifications", perm === "granted");
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const Row = ({
    label,
    hint,
    children,
  }: {
    label: string;
    hint?: string;
    children: React.ReactNode;
  }) => (
    <div
      className="flex items-start justify-between gap-4 py-3"
      style={{ borderBottom: "1px solid var(--md-outline-variant)" }}
    >
      <div>
        <div
          className="text-sm font-semibold"
          style={{ color: "var(--md-on-surface)" }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="text-xs mt-0.5"
            style={{ color: "var(--md-outline)" }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );

  const Toggle = ({ k }: { k: string }) => (
    <button
      type="button"
      onClick={() => set(k, !settings[k])}
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{
        background: settings[k]
          ? "var(--md-primary)"
          : "var(--md-surface-container-high)",
      }}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
          Boolean(settings[k]) && "translate-x-5",
        )}
      />
    </button>
  );

  const TextInput = ({
    k,
    placeholder,
    type = "text",
  }: {
    k: string;
    placeholder?: string;
    type?: string;
  }) => (
    <input
      type={type}
      value={(settings[k] as string | number | undefined) ?? ""}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 w-full md:w-64 transition-colors"
      style={{
        background: "var(--md-surface-container)",
        border: "1px solid var(--md-outline-variant)",
        color: "var(--md-on-surface)",
      }}
    />
  );

  const NumInput = ({
    k,
    min,
    max,
    step,
    unit,
  }: {
    k: string;
    min?: number;
    max?: number;
    step?: string;
    unit?: string;
  }) => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={(settings[k] as string | number | undefined) ?? ""}
        min={min}
        max={max}
        step={step ?? "0.1"}
        onChange={(e) => set(k, e.target.value)}
        className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 w-28 text-right font-mono transition-colors"
        style={{
          background: "var(--md-surface-container)",
          border: "1px solid var(--md-outline-variant)",
          color: "var(--md-on-surface)",
          fontFamily: "var(--font-data)",
        }}
      />
      {unit && (
        <span className="text-xs" style={{ color: "var(--md-outline)" }}>
          {unit}
        </span>
      )}
    </div>
  );

  const SecretInput = ({
    k,
    placeholder,
  }: {
    k: string;
    placeholder?: string;
  }) => (
    <div className="relative">
      <input
        type={showKey[k] ? "text" : "password"}
        value={(settings[k] as string | number | undefined) ?? ""}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder ?? "未設定"}
        className="rounded-xl px-3 py-2 pr-9 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 w-full md:w-64 font-mono transition-colors"
        style={{
          background: "var(--md-surface-container)",
          border: "1px solid var(--md-outline-variant)",
          color: "var(--md-on-surface)",
          fontFamily: "var(--font-data)",
        }}
      />
      <button
        type="button"
        onClick={() => setShowKey((p) => ({ ...p, [k]: !p[k] }))}
        className="absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
        style={{ color: "var(--md-outline)" }}
      >
        {showKey[k] ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );

  if (!loaded)
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--md-outline)" }}
        >
          <RefreshCw size={16} className="animate-spin" /> 載入設定中…
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
      <div
        className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-3 md:gap-2 px-1 md:px-0 -mx-1 md:mx-0 overflow-x-auto md:overflow-y-auto pb-3 md:pb-0 snap-x md:snap-none snap-mandatory mobile-hide-scrollbar scroll-smooth"
        style={{ borderBottom: "1px solid var(--md-outline-variant)" }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s.id)}
            className="shrink-0 snap-start flex items-center md:items-start gap-2.5 md:gap-3 px-4 md:px-4 py-2.5 md:py-3 rounded-2xl text-left transition whitespace-nowrap"
            style={
              active === s.id
                ? {
                    background: "rgba(192,193,255,0.12)",
                    border: "1px solid rgba(192,193,255,0.4)",
                    color: "var(--md-primary)",
                  }
                : {
                    background: "transparent",
                    border: "1px solid transparent",
                    color: "var(--md-outline)",
                  }
            }
          >
            <s.icon
              size={18}
              className="mt-0 md:mt-0.5 shrink-0"
              style={
                active === s.id
                  ? { color: "var(--md-primary)" }
                  : { color: "var(--md-outline)" }
              }
            />
            <div className="hidden md:block">
              <div className="text-sm font-black leading-tight uppercase tracking-widest">
                {s.label}
              </div>
              <div className="label-meta opacity-60 mt-1 uppercase tracking-widest">
                {s.desc}
              </div>
            </div>
            {/* 行動版標籤 */}
            <span className="md:hidden text-[13px] font-bold">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div>
            <h2
              className="text-2xl font-black uppercase tracking-tighter"
              style={{
                color: "var(--md-on-surface)",
                fontFamily: "var(--font-heading)",
              }}
            >
              {SECTIONS.find((s) => s.id === active)?.label}
            </h2>
            <p
              className="label-meta mt-1 uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              {SECTIONS.find((s) => s.id === active)?.desc}
            </p>
          </div>
          {active !== "hotkeys" && (
            <div className="flex items-center gap-3">
              {saveErr && (
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: "var(--md-error)" }}
                >
                  <AlertCircle size={11} />
                  {saveErr}
                </span>
              )}
              <button type="button" onClick={save}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition active:scale-95 disabled:opacity-50"
                style={{ background: 'var(--md-primary)', color: 'var(--md-on-primary)' }}
                disabled={saving}
              >
                {saving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : saved ? (
                  <CheckCircle size={14} />
                ) : (
                  <Save size={14} />
                )}
                {saving ? "儲存中…" : saved ? "已儲存 ✓" : "儲存設定"}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 glass-card rounded-[2rem] p-4 md:p-8">
          {/* ── API 金鑰 ── */}
          {active === "api" && (
            <div>
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: "rgba(173,198,255,0.05)",
                  border: "1px solid rgba(173,198,255,0.2)",
                  color: "var(--md-on-surface-variant)",
                }}
              >
                <div
                  className="font-bold mb-1 flex items-center gap-1.5"
                  style={{ color: "var(--md-secondary)" }}
                >
                  <Info size={12} /> 說明
                </div>
                OpenRouter 提供多種 AI 模型（Claude、GPT-4o、Gemini 等）的統一
                API。 注冊並綁定付費帳戶後可取得金鑰，設定後 TradingCore 與 AI
                分析功能才能使用。
              </div>
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: "rgba(255,183,131,0.05)",
                  border: "1px solid rgba(255,183,131,0.2)",
                  color: "var(--md-on-surface-variant)",
                }}
              >
                <div
                  className="font-bold mb-1 flex items-center gap-1.5"
                  style={{ color: "var(--md-tertiary)" }}
                >
                  <AlertCircle size={12} /> 安全提示
                </div>
                API
                金鑰儲存於本地設定檔（僅在您的裝置上使用），請避免洩露給他人。
                如有疑慮，可於 OpenRouter 後台定期輪替（Rotate）金鑰。
              </div>
              <Row
                label="OpenRouter API Key"
                hint="至 openrouter.ai 取得，用於 AI 分析功能"
              >
                <SecretInput k="openrouterKey" placeholder="sk-or-v1-…" />
              </Row>
              <Row label="API 狀態">
                <span
                  className={cn("text-xs px-2 py-1 rounded-full font-bold")}
                  style={
                    settings.openrouterKey
                      ? {
                          background: "rgba(82,196,26,0.15)",
                          color: "var(--color-down)",
                          border: "1px solid rgba(82,196,26,0.3)",
                        }
                      : {
                          background: "rgba(255,183,131,0.12)",
                          color: "var(--md-tertiary)",
                          border: "1px solid rgba(255,183,131,0.3)",
                        }
                  }
                >
                  {settings.openrouterKey
                    ? "✓ 已設定"
                    : "⚠ 尚未設定，AI 功能不可用"}
                </span>
              </Row>
              <div
                className="mt-4 p-3 rounded-xl"
                style={{
                  background: "var(--md-surface-container)",
                  border: "1px solid var(--md-outline-variant)",
                }}
              >
                <div
                  className="text-xs mb-2"
                  style={{ color: "var(--md-outline)" }}
                >
                  快速取得 API Key：
                </div>
                <div
                  className="text-xs space-y-1"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  <div>
                    1. 前往{" "}
                    <span
                      className="font-mono"
                      style={{ color: "var(--md-primary)" }}
                    >
                      https://openrouter.ai
                    </span>{" "}
                    註冊帳號
                  </div>
                  <div>2. 點選「Keys」→「Create Key」</div>
                  <div>3. 複製金鑰貼到上方輸入框</div>
                  <div>4. 點擊「儲存設定」</div>
                </div>
              </div>
            </div>
          )}

          {/* ── 本地 AI ── */}
          {active === "ollama" && (
            <div>
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: "rgba(192,193,255,0.05)",
                  border: "1px solid rgba(192,193,255,0.2)",
                  color: "var(--md-on-surface-variant)",
                }}
              >
                <div
                  className="font-bold mb-1"
                  style={{ color: "var(--md-primary)" }}
                >
                  💡 什麼是 Ollama？
                </div>
                Ollama 可在您的電腦本地執行 AI 模型，完全免費且保護隱私，無需
                API Key。 請先至{" "}
                <span
                  className="font-mono"
                  style={{ color: "var(--md-primary)" }}
                >
                  https://ollama.ai
                </span>{" "}
                安裝後再使用。
              </div>
              <Row label="啟用本地模型" hint="使用 Ollama 取代 OpenRouter">
                <Toggle k="useOllama" />
              </Row>
              <Row
                label="Ollama 伺服器位址"
                hint="預設為 http://localhost:11434"
              >
                <TextInput
                  k="ollamaBaseUrl"
                  placeholder="http://localhost:11434"
                />
              </Row>
              <Row label="連線狀態">
                <span
                  className="text-xs px-2 py-1 rounded-full font-bold"
                  style={
                    settings.useOllama
                      ? {
                          background: "rgba(82,196,26,0.15)",
                          color: "var(--color-down)",
                          border: "1px solid rgba(82,196,26,0.3)",
                        }
                      : {
                          background: "var(--md-surface-container)",
                          color: "var(--md-outline)",
                          border: "1px solid var(--md-outline-variant)",
                        }
                  }
                >
                  {settings.useOllama ? "✓ 已啟用" : "停用中"}
                </span>
              </Row>
            </div>
          )}

          {/* ── 風險控管 ── */}
          {active === "risk" && (
            <div>
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: "rgba(255,77,79,0.05)",
                  border: "1px solid rgba(255,77,79,0.2)",
                  color: "var(--md-on-surface-variant)",
                }}
              >
                <div
                  className="font-bold mb-1"
                  style={{ color: "var(--color-up)" }}
                >
                  ⚠️ 風險管理說明
                </div>
                以下參數用於 AI 推薦進場點與計算最大倉位，是風險控制的關鍵設定。
                一般建議單筆風險 1-2%，每日最大回撤 5-10%。
              </div>
              <Row
                label="單筆最大風險"
                hint="每筆交易最多損失本金的百分比，建議 1-2%"
              >
                <NumInput k="maxRisk" min={0.1} max={10} unit="% / 筆" />
              </Row>
              <Row
                label="預設風報比"
                hint="獲利距離 ÷ 停損距離（建議至少 2:1）"
              >
                <NumInput k="defaultRR" min={0.5} max={10} unit="倍" />
              </Row>
              <Row
                label="ATR 乘數（停損）"
                hint="真實波動幅度的幾倍作為停損距離"
              >
                <NumInput k="atrMultiplier" min={0.5} max={5} unit="× ATR" />
              </Row>
              <Row label="每日最大回撤上限" hint="觸發後停止交易，風控保護">
                <NumInput k="dailyDrawdown" min={1} max={20} unit="% / 日" />
              </Row>
            </div>
          )}

          {/* ── 交易設定 ── */}
          {active === "trading" && (
            <div>
              <Row label="預設委託數量" hint="下單時預設張數">
                <NumInput
                  k="defaultOrderQty"
                  min={1}
                  max={10000}
                  step="1"
                  unit="張"
                />
              </Row>
              <Row
                label="預設委託類型"
                hint="ROD（當日有效）或 IOC（立即成交否則取消）"
              >
                <select
                  value={String(settings.defaultOrderType || "ROD")}
                  onChange={(e) => set("defaultOrderType", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="ROD">ROD</option>
                  <option value="IOC">IOC</option>
                </select>
              </Row>
              <Row label="預設價格類型" hint="LMT（限價）或 MKT（市價）">
                <select
                  value={String(settings.defaultPriceType || "LMT")}
                  onChange={(e) => set("defaultPriceType", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="LMT">LMT</option>
                  <option value="MKT">MKT</option>
                </select>
              </Row>
              <Row label="滑價容忍度" hint="市價單允許的最大價格偏差">
                <NumInput
                  k="slippageTolerance"
                  min={0}
                  max={5}
                  step="0.1"
                  unit="%"
                />
              </Row>
              <Row label="預設券商" hint="下單時預設使用的券商">
                <TextInput k="defaultBroker" placeholder="例如：元大、富邦" />
              </Row>
            </div>
          )}

          {/* ── 市場與 AI 設定 ── */}
          {active === "market-ai" && (
            <div>
              <Row label="預設圖表週期" hint="圖表預設顯示的時間週期">
                <select
                  value={String(settings.defaultChartTimeframe || "1D")}
                  onChange={(e) => set("defaultChartTimeframe", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="1M">1 分鐘</option>
                  <option value="5M">5 分鐘</option>
                  <option value="1H">1 小時</option>
                  <option value="1D">1 日</option>
                </select>
              </Row>
              <Row label="顯示貨幣" hint="投資組合與損益的顯示貨幣單位">
                <select
                  value={String(settings.displayCurrency || "TWD")}
                  onChange={(e) => set("displayCurrency", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="TWD">TWD</option>
                  <option value="USD">USD</option>
                </select>
              </Row>
              <Row label="預設 AI 模型" hint="AI 分析預設使用的模型">
                {isFree ? (
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
                      style={{
                        background: "var(--md-surface-container)",
                        border: "1px solid var(--md-outline-variant)",
                        color: "var(--md-outline)",
                      }}
                    >
                      <span>免費模型：{FREE_MODEL}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{
                          background: "rgba(255,183,131,0.15)",
                          color: "var(--md-tertiary)",
                          border: "1px solid rgba(255,183,131,0.3)",
                        }}
                      >
                        FREE
                      </span>
                    </div>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--md-outline)" }}
                    >
                      升級為 Pro 或 Basic 方可自行選擇模型
                    </p>
                  </div>
                ) : (
                  <select
                    value={String(settings.defaultModel || MODELS[0].id)}
                    onChange={(e) => set("defaultModel", e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                    style={{
                      background: "var(--md-surface-container)",
                      border: "1px solid var(--md-outline-variant)",
                      color: "var(--md-on-surface)",
                    }}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
              </Row>
              <Row label="AI 系統指令" hint="客製 AI 分析的風格與行為">
                <textarea
                  value={String(settings.systemInstruction || "")}
                  onChange={(e) => set("systemInstruction", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 w-full md:w-64 h-28 md:h-24"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                  placeholder="例如：請以嚴謹的技術分析師角度…"
                />
              </Row>
            </div>
          )}

          {/* ── AI 行為 ── */}
          {active === "ai" && (
            <div>
              <Row label="交易積極程度" hint="影響 AI 推薦的買賣訊號頻率">
                <select
                  value={settings.aggressiveness as string | undefined}
                  onChange={(e) => set("aggressiveness", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="Conservative">保守（訊號少、精準）</option>
                  <option value="Balanced">平衡（預設）</option>
                  <option value="Aggressive">積極（訊號多）</option>
                </select>
              </Row>
              <Row
                label="自動交易模式"
                hint="⚠️ 啟用後 AI 將自動執行委託，高風險"
              >
                <div className="flex items-center gap-2">
                  <Toggle k="autoTrading" />
                  {settings.autoTrading && (
                    <span
                      className="text-xs font-bold"
                      style={{ color: "var(--color-up)" }}
                    >
                      注意：已啟用自動交易
                    </span>
                  )}
                </div>
              </Row>
            </div>
          )}

          {/* ── 通知設定 ── */}
          {active === "notif" && (
            <div>
              <Row label="價格突破警報" hint="到達設定價位時通知">
                <Toggle k="priceAlerts" />
              </Row>
              <Row label="委託成交通知" hint="訂單成交時即時提醒">
                <Toggle k="orderFillAlerts" />
              </Row>
              <Row label="風控觸發警報" hint="回撤超過風險條件觸發時通知">
                <Toggle k="riskAlerts" />
              </Row>
              <Row
                label="系統通知權限"
                hint="使用瀏覽器或 Electron 系統通知視窗"
              >
                <div className="flex items-center gap-2">
                  <Toggle k="browserNotifications" />
                  <button type="button" onClick={requestNotifPermission}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition active:scale-95"
                    style={{ background: 'var(--md-surface-container-high)', border: '1px solid var(--md-outline-variant)', color: 'var(--md-on-surface-variant)' }}>
                    請求權限
                  </button>
                </div>
              </Row>
            </div>
          )}

          {/* ── 顯示設定 ── */}
          {active === "display" && (
            <div>
              <Row label="介面主題" hint="切換深色或淺色模式">
                <select
                  value={String(settings.theme || "dark")}
                  onChange={(e) => set("theme", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="dark">深色</option>
                  <option value="light">淺色</option>
                  <option value="system">跟隨系統</option>
                </select>
              </Row>
              <Row label="語言" hint="設定應用程式顯示語言">
                <select
                  value={String(settings.language || "zh-TW")}
                  onChange={(e) => set("language", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="zh-TW">繁體中文</option>
                  <option value="en-US">English</option>
                </select>
              </Row>
              <Row label="側邊欄預設狀態" hint="應用程式啟動時側邊欄的狀態">
                <select
                  value={String(settings.sidebarDefaultState || "expanded")}
                  onChange={(e) => set("sidebarDefaultState", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="expanded">展開</option>
                  <option value="collapsed">收合</option>
                </select>
              </Row>
              <Row
                label="Pro 模式（緊湊顯示）"
                hint="縮小字距與邊距，提高資訊密度，適合專業交易員"
              >
                <Toggle k="compactMode" />
              </Row>
              <Row label="啟用動畫效果" hint="關閉可改善低效能設備的流暢度">
                <Toggle k="animationsOn" />
              </Row>
              <Row label="自動更新間隔" hint="市場資料的更新頻率（秒）">
                <div className="flex items-center gap-2">
                  <select
                    value={settings.autoRefreshInterval as string | undefined}
                    onChange={(e) => set("autoRefreshInterval", e.target.value)}
                    className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                    style={{
                      background: "var(--md-surface-container)",
                      border: "1px solid var(--md-outline-variant)",
                      color: "var(--md-on-surface)",
                    }}
                  >
                    <option value="10">10 秒</option>
                    <option value="20">20 秒</option>
                    <option value="30">30 秒（預設）</option>
                    <option value="60">60 秒</option>
                    <option value="120">2 分鐘</option>
                  </select>
                </div>
              </Row>
              <Row label="字體大小" hint="調整介面字體大小">
                <select
                  value={settings.fontSize as string | undefined}
                  onChange={(e) => set("fontSize", e.target.value)}
                  className="rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                    color: "var(--md-on-surface)",
                  }}
                >
                  <option value="small">小</option>
                  <option value="normal">標準</option>
                  <option value="large">大</option>
                </select>
              </Row>
            </div>
          )}

          {/* ── 資料管理 ── */}
          {active === "data" && (
            <div>
              {dbStats && (
                <div
                  className="rounded-xl p-4 mb-4"
                  style={{
                    background: "var(--md-surface-container)",
                    border: "1px solid var(--md-outline-variant)",
                  }}
                >
                  <div
                    className="text-sm font-bold mb-3"
                    style={{
                      color: "var(--md-on-surface)",
                      fontFamily: "var(--font-heading)",
                    }}
                  >
                    📊 資料庫統計
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ["交易記錄", dbStats.trades, "筆"],
                      ["持倉數量", dbStats.positions, "筆"],
                      ["自選股", dbStats.watchlist, "支"],
                      ["價格警報", dbStats.alerts, "筆"],
                    ].map(([k, v, u]) => (
                      <div
                        key={k as string}
                        className="rounded-lg p-3"
                        style={{
                          background: "var(--md-surface-container-high)",
                        }}
                      >
                        <div
                          className="text-xs"
                          style={{ color: "var(--md-outline)" }}
                        >
                          {k}
                        </div>
                        <div
                          className="text-xl font-bold"
                          style={{
                            color: "var(--md-on-surface)",
                            fontFamily: "var(--font-data)",
                          }}
                        >
                          {v}{" "}
                          <span
                            className="text-xs"
                            style={{ color: "var(--md-outline)" }}
                          >
                            {u}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-3 text-xs"
                    style={{ color: "var(--md-outline)" }}
                  >
                    路徑：
                    <span
                      className="font-mono"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {dbStats.dataPath}
                    </span>
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--md-outline)" }}
                  >
                    引擎：{dbStats.engine}
                  </div>
                </div>
              )}
              <Row label="匯出設定" hint="將目前設定匯出為 JSON 檔案">
                <button type="button" onClick={exportSettings} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition active:scale-95">
                  <Download size={13} /> 匯出 JSON
                </button>
              </Row>
              <Row label="重新整理資料統計">
                <button
                  type="button"
                  onClick={() =>
                    getDbStats().then((res) => setDbStats(res as DbStats | null))
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors"
                  style={{
                    background: "var(--md-surface-container-high)",
                    color: "var(--md-on-surface-variant)",
                    border: "1px solid var(--md-outline-variant)",
                  }}
                >
                  <RefreshCw size={13} className={saving ? 'animate-spin' : ''} /> 重新整理
                </button>
              </Row>
              <div
                className="mt-6 p-4 rounded-xl"
                style={{
                  background: "rgba(255,77,79,0.05)",
                  border: "1px solid rgba(255,77,79,0.2)",
                }}
              >
                <div
                  className="text-sm font-bold mb-1"
                  style={{
                    color: "var(--color-up)",
                    fontFamily: "var(--font-heading)",
                  }}
                >
                  🗑️ 危險區域
                </div>
                <div
                  className="text-xs mb-3"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  清除所有本地設定，此操作無法復原
                </div>
                {!clearConfirm ? (
                  <button
                    type="button"
                    onClick={() => setClearConfirm(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors"
                    style={{
                      background: "rgba(255,77,79,0.15)",
                      color: "var(--color-up)",
                      border: "1px solid rgba(255,77,79,0.3)",
                    }}
                  >
                    <Trash2 size={13} /> 清除所有本機資料
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-up)" }}
                    >
                      確定要清除所有資料嗎？
                    </span>
                    <button type="button" onClick={clearData} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest active:scale-95 transition">
                      確認清除 DELETE
                    </button>
                    <button
                      type="button"
                      onClick={() => setClearConfirm(false)}
                      className="px-3 py-1.5 rounded-xl text-xs transition-colors"
                      style={{
                        background: "var(--md-surface-container)",
                        color: "var(--md-outline)",
                        border: "1px solid var(--md-outline-variant)",
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 快捷鍵 ── */}
          {active === "hotkeys" && (
            <div>
              <div
                className="rounded-xl p-3 mb-4 text-xs"
                style={{
                  background: "rgba(192,193,255,0.05)",
                  border: "1px solid rgba(192,193,255,0.2)",
                  color: "var(--md-on-surface-variant)",
                }}
              >
                <div
                  className="font-bold mb-1"
                  style={{ color: "var(--md-primary)" }}
                >
                  ⌨️ 鍵盤快捷鍵
                </div>
                使用快捷鍵可以快速切換頁面，不需要點擊側邊欄。快速鍵在任何輸入框外都可使用。
              </div>
              <div className="space-y-2">
                {HOTKEYS.map((k) => (
                  <div
                    key={k.key}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: "var(--md-surface-container-high)",
                      border: "1px solid var(--md-outline-variant)",
                    }}
                  >
                    <kbd
                      className="min-w-[36px] text-center rounded-lg px-2 py-1.5 text-xs font-mono font-bold shadow"
                      style={{
                        background: "var(--md-surface-container)",
                        border: "1px solid var(--md-outline-variant)",
                        color: "var(--md-on-surface)",
                      }}
                    >
                      {k.key}
                    </kbd>
                    <div className="flex-1">
                      <div
                        className="text-sm font-semibold"
                        style={{ color: "var(--md-on-surface)" }}
                      >
                        {k.action}
                      </div>
                      {k.hint && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--md-outline)" }}
                        >
                          {k.hint}
                        </div>
                      )}
                    </div>
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: "var(--md-primary)", opacity: 0.6 }}
                    />
                  </div>
                ))}
              </div>
              <div
                className="mt-4 text-xs rounded-xl p-3"
                style={{
                  color: "var(--md-outline)",
                  background: "var(--md-surface-container)",
                  border: "1px solid var(--md-outline-variant)",
                }}
              >
                💡 快捷鍵在 App.tsx 中已實作完成，確保 Electron
                視窗處於焦點即可使用。
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
