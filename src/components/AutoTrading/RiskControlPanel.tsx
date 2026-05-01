/**
 * src/components/AutoTrading/RiskControlPanel.tsx
 * 風控設定面板 + Kill Switch
 *
 * 重構重點（2026-04）：
 *  - 預算/虧損上限不再寫死，初始值改從 riskStats 載入；無資料時為 0 並提示尚未載入
 *  - 新增「單筆部位上限 / 最大部位佔比 / 個股停損 %」
 *  - 儲存後顯示成功/失敗 toast，並把欄位驗證錯誤即時顯示在輸入框下方
 *  - 解除 Kill Switch 改為呼叫 /api/autotrading/kill-switch/release
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Lock, Unlock, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';
import type { RiskStats } from './types';

interface Props {
  riskStats: RiskStats | null;
  onKillSwitch: () => void;
  onUpdateConfig: (cfg: {
    budgetLimitTWD?: number;
    maxDailyLossTWD?: number;
    maxSinglePositionTWD?: number;
    maxPositionPct?: number;
    stopLossPct?: number;
  }) => Promise<unknown> | void;
}

interface FormErrors {
  budget?: string;
  daily?: string;
  single?: string;
  positionPct?: string;
  stopLoss?: string;
}

export function RiskControlPanel({ riskStats, onKillSwitch, onUpdateConfig }: Props) {
  const { t } = useTranslation();
  const [budgetLimit, setBudgetLimit] = useState<number>(riskStats?.config.budgetLimitTWD ?? 0);
  const [dailyLoss, setDailyLoss] = useState<number>(riskStats?.config.maxDailyLossTWD ?? 0);
  const [singlePosition, setSinglePosition] = useState<number>(riskStats?.config.maxSinglePositionTWD ?? 0);
  const [positionPct, setPositionPct] = useState<number>((riskStats?.config.maxPositionPct ?? 0) * 100);
  const [stopLossPct, setStopLossPct] = useState<number>((riskStats?.config.stopLossPct ?? 0) * 100);
  const [killConfirm, setKillConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const isKillActive = riskStats?.killSwitchActive ?? false;

  // 第一次拿到 riskStats 後同步本地表單
  useEffect(() => {
    if (!riskStats) return;
    setBudgetLimit(riskStats.config.budgetLimitTWD);
    setDailyLoss(riskStats.config.maxDailyLossTWD);
    setSinglePosition(riskStats.config.maxSinglePositionTWD);
    setPositionPct(riskStats.config.maxPositionPct * 100);
    setStopLossPct(riskStats.config.stopLossPct * 100);
  }, [riskStats]);

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!(budgetLimit > 0)) e.budget = t('autotrading.risk.invalidValue');
    if (!(dailyLoss > 0)) e.daily = t('autotrading.risk.invalidValue');
    else if (dailyLoss > budgetLimit) e.daily = t('autotrading.risk.tooLarge');
    if (!(singlePosition > 0)) e.single = t('autotrading.risk.invalidValue');
    else if (singlePosition > budgetLimit) e.single = t('autotrading.risk.tooLarge');
    if (!(positionPct > 0 && positionPct <= 100)) e.positionPct = t('autotrading.risk.range0_100');
    if (!(stopLossPct > 0 && stopLossPct <= 50)) e.stopLoss = t('autotrading.risk.range0_50');
    return e;
  }

  async function handleSave() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setToast({ type: 'error', msg: t('common.error') });
      return;
    }
    try {
      await onUpdateConfig({
        budgetLimitTWD: budgetLimit,
        maxDailyLossTWD: dailyLoss,
        maxSinglePositionTWD: singlePosition,
        maxPositionPct: positionPct / 100,
        stopLossPct: stopLossPct / 100,
      });
      setToast({ type: 'success', msg: t('autotrading.risk.saveSuccess') });
    } catch (err) {
      setToast({ type: 'error', msg: (err as Error).message ?? t('autotrading.risk.saveError') });
    }
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  async function handleReleaseKill() {
    try {
      await api.releaseKillSwitch();
      setToast({ type: 'success', msg: t('autotrading.risk.releaseKill') });
    } catch (e) {
      setToast({ type: 'error', msg: (e as Error).message });
    }
  }

  return (
    <div className={cn(
      'border rounded-sm p-3 space-y-3',
      isKillActive ? 'border-rose-500/50 bg-rose-950/20' : 'border-(--color-term-border)'
    )}>
      <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase flex items-center gap-2 text-rose-400">
        <AlertTriangle className="h-3 w-3" />
        {t('autotrading.risk.title')}
        {isKillActive && (
          <span className="ml-auto text-[9px] bg-rose-500/20 border border-rose-500/30 text-rose-300 px-1.5 py-0.5 rounded animate-pulse">
            {t('autotrading.risk.killActive')}
          </span>
        )}
      </h3>

      <NumberField
        label={t('autotrading.risk.totalBudget')}
        unit="TWD"
        value={budgetLimit}
        onChange={setBudgetLimit}
        error={errors.budget}
      />
      <NumberField
        label={t('autotrading.risk.maxDailyLoss')}
        unit="TWD"
        value={dailyLoss}
        onChange={setDailyLoss}
        error={errors.daily}
      />
      <NumberField
        label={t('autotrading.risk.maxSinglePosition')}
        unit="TWD"
        value={singlePosition}
        onChange={setSinglePosition}
        error={errors.single}
      />
      <NumberField
        label={t('autotrading.risk.maxPositionPct')}
        unit="%"
        value={positionPct}
        onChange={setPositionPct}
        error={errors.positionPct}
        step={0.5}
      />
      <NumberField
        label={t('autotrading.risk.stopLossPct')}
        unit="%"
        value={stopLossPct}
        onChange={setStopLossPct}
        error={errors.stopLoss}
        step={0.5}
      />

      <button
        type="button"
        onClick={handleSave}
        className="focus-ring w-full py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 motion-safe:transition-colors"
      >
        {t('autotrading.risk.saveParams')}
      </button>

      {/* Daily loss progress */}
      {riskStats && riskStats.dailyLoss > 0 && (
        <div>
          <div className="flex justify-between text-[9px] text-(--color-term-muted) mb-1">
            <span>{t('autotrading.risk.todayLoss')}</span>
            <span>{((riskStats.dailyLoss / riskStats.config.maxDailyLossTWD) * 100).toFixed(1)}%</span>
          </div>
          <div className="h-1 bg-(--color-term-border) rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (riskStats.dailyLoss / riskStats.config.maxDailyLossTWD) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Loss Streak Badge */}
      {riskStats && (
        <div className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded">
           <span className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">{t('autotrading.risk.lossStreak')}</span>
           <span className={cn(
             "text-[12px] font-bold font-mono",
             riskStats.lossStreakCount > 0 ? "text-amber-400" : "text-emerald-400"
           )}>
             {riskStats.lossStreakCount}
           </span>
        </div>
      )}

      {riskStats?.monteCarlo && (
        <div className="p-2 bg-white/5 border border-white/5 rounded space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-(--color-term-muted) uppercase tracking-widest">Monte Carlo</span>
            <span className={cn(
              'text-[10px] font-mono font-bold',
              riskStats.monteCarlo.ruinProbability >= 0.1
                ? 'text-rose-400'
                : riskStats.monteCarlo.ruinProbability >= 0.03
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            )}>
              Ruin {(riskStats.monteCarlo.ruinProbability * 100).toFixed(2)}%
            </span>
          </div>
          <div className="text-[9px] text-(--color-term-muted) flex items-center justify-between">
            <span>Paths / Horizon</span>
            <span className="font-mono">{riskStats.monteCarlo.paths} / {riskStats.monteCarlo.horizonSteps}</span>
          </div>
          <div className="text-[9px] text-(--color-term-muted) flex items-center justify-between">
            <span>VaR 95%</span>
            <span className="font-mono">{riskStats.monteCarlo.valueAtRisk95Pct.toFixed(2)}%</span>
          </div>
          <div className="text-[9px] text-(--color-term-muted) flex items-center justify-between">
            <span>Expected Max DD</span>
            <span className="font-mono">{riskStats.monteCarlo.expectedMaxDrawdownPct.toFixed(2)}%</span>
          </div>
        </div>
      )}

      {/* Kill Switch */}
      {!killConfirm ? (
        <button
          type="button"
          onClick={() => isKillActive ? handleReleaseKill() : setKillConfirm(true)}
          className={cn(
            'focus-ring w-full py-2.5 rounded text-sm font-bold uppercase tracking-widest border motion-safe:transition-all flex items-center justify-center gap-2',
            isKillActive
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
          )}
        >
          {isKillActive ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          {isKillActive ? t('autotrading.risk.releaseKill') : t('autotrading.risk.killSwitch')}
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-rose-300 text-center">{t('autotrading.risk.killConfirmDesc')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKillConfirm(false)}
              className="focus-ring flex-1 py-2 rounded text-xs font-bold bg-(--color-term-surface) text-(--color-term-muted) border border-(--color-term-border) hover:bg-(--color-term-panel) motion-safe:transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { setKillConfirm(false); onKillSwitch(); }}
              className="focus-ring flex-1 py-2 rounded text-xs font-bold bg-rose-500 text-white border-rose-500 hover:bg-rose-600 motion-safe:transition-colors"
            >
              {t('common.confirm')}
            </button>
          </div>
        </div>
      )}

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

interface NumberFieldProps {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  error?: string;
  step?: number;
}
function NumberField({ label, unit, value, onChange, error, step }: NumberFieldProps) {
  return (
    <div>
      <label className="text-[9px] text-(--color-term-muted) uppercase tracking-widest block mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-(--color-term-muted) shrink-0 w-7">{unit}</span>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          onChange={e => onChange(Number(e.target.value))}
          className={cn(
            'flex-1 bg-(--color-term-surface) border rounded px-2 py-1 text-[11px] font-mono text-right text-(--color-term-text) focus:outline-none focus:border-(--color-term-accent)',
            error ? 'border-rose-500/50' : 'border-(--color-term-border)'
          )}
        />
      </div>
      {error && <div className="text-[9px] text-rose-300 mt-1">{error}</div>}
    </div>
  );
}
