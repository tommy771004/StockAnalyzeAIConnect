import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BellRing, ExternalLink, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Panel } from './Panel';
import { cn } from '../../lib/utils';
import { SMART_MONEY_MANAGER_SEARCH_FILTER_KEY, SMART_MONEY_UI_PREFERENCES_SETTING_KEY } from '../constants/storage';
import * as api from '../../services/api';

interface SmartMoneyUIPreferences {
  managerSearchVerifiedOnly?: boolean;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function createDefaultDraft(): api.SmartMoneySettingsPayload {
  return {
    enabled: false,
    trackedManagerIds: [],
    customManagers: [],
    useWatchlistForInsiderSymbols: true,
    insiderSymbols: [],
    autoAddInsiderSignalsToWatchlist: false,
    minInsiderBuyUsd: 100000,
  };
}

function loadVerifiedOnlyPreference(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(SMART_MONEY_MANAGER_SEARCH_FILTER_KEY) === '1';
  } catch {
    return false;
  }
}

export function SmartMoneyAlertSettingsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<api.SmartMoneySettingsPayload>(createDefaultDraft());
  const [managerDraft, setManagerDraft] = useState({ name: '', cik: '' });
  const [managerSearchQuery, setManagerSearchQuery] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(() => loadVerifiedOnlyPreference());
  const [symbolDraft, setSymbolDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const deferredManagerSearchQuery = useDeferredValue(managerSearchQuery.trim());

  const { data, isLoading, error } = useQuery({
    queryKey: ['smart-money-config'],
    queryFn: api.getSmartMoneyConfig,
  });

  const managerSearch = useQuery({
    queryKey: ['smart-money-manager-search', deferredManagerSearchQuery],
    queryFn: () => api.searchSmartMoneyManagers(deferredManagerSearchQuery),
    enabled: deferredManagerSearchQuery.length >= 2,
    staleTime: 10 * 60 * 1000,
  });

  const uiPreferencesQuery = useQuery({
    queryKey: ['smart-money-ui-preferences'],
    queryFn: async () => {
      const value = await api.getSetting<SmartMoneyUIPreferences | null>(SMART_MONEY_UI_PREFERENCES_SETTING_KEY);
      return value && typeof value === 'object' ? value : null;
    },
  });

  useEffect(() => {
    if (!data?.settings) return;
    setDraft(data.settings);
  }, [data?.settings]);

  useEffect(() => {
    const remoteValue = uiPreferencesQuery.data?.managerSearchVerifiedOnly;
    if (typeof remoteValue !== 'boolean') return;
    setVerifiedOnly(remoteValue);
  }, [uiPreferencesQuery.data?.managerSearchVerifiedOnly]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SMART_MONEY_MANAGER_SEARCH_FILTER_KEY, verifiedOnly ? '1' : '0');
    } catch {
      // Ignore localStorage write failures.
    }
  }, [verifiedOnly]);

  const watchlistSymbols = useMemo(
    () => new Set((data?.watchlistSymbols ?? []).map((symbol) => symbol.toUpperCase())),
    [data?.watchlistSymbols],
  );

  const saveMutation = useMutation({
    mutationFn: () => api.updateSmartMoneyConfig(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smart-money-config'] });
      setToast({ type: 'success', text: t('smartMoney.saved', 'Smart Money 設定已儲存') });
    },
    onError: (reason: Error) => {
      setToast({ type: 'error', text: reason.message });
    },
  });

  const scanMutation = useMutation({
    mutationFn: api.scanSmartMoneySignals,
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ['smart-money-config'] });
      setToast({
        type: 'success',
        text: payload.newEvents.length > 0
          ? t('smartMoney.scanFound', '掃描完成，找到 {{count}} 筆新訊號', { count: payload.newEvents.length })
          : t('smartMoney.scanNoResults', '掃描完成，暫無新訊號'),
      });
    },
    onError: (reason: Error) => {
      setToast({ type: 'error', text: reason.message });
    },
  });

  const addWatchlistMutation = useMutation({
    mutationFn: (payload: { symbol: string; name?: string | null }) => api.addWatchlistItem(payload.symbol, payload.name ?? undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['smart-money-config'] });
      setToast({ type: 'success', text: t('smartMoney.watchlistAdded', '已加入 Watchlist') });
    },
    onError: (reason: Error) => {
      setToast({ type: 'error', text: reason.message });
    },
  });

  const saveUiPreferencesMutation = useMutation({
    mutationFn: async (nextValue: boolean) => {
      const nextPreferences: SmartMoneyUIPreferences = { managerSearchVerifiedOnly: nextValue };
      await api.setSetting(SMART_MONEY_UI_PREFERENCES_SETTING_KEY, nextPreferences);
      return nextPreferences;
    },
    onSuccess: (nextPreferences) => {
      queryClient.setQueryData(['smart-money-ui-preferences'], nextPreferences);
    },
    onError: () => {
      setToast({ type: 'error', text: t('smartMoney.preferenceSaveFailed', '已套用篩選，但雲端偏好儲存失敗') });
    },
  });

  function toggleManager(managerId: string): void {
    setDraft((current) => {
      const active = current.trackedManagerIds.includes(managerId);
      return {
        ...current,
        trackedManagerIds: active
          ? current.trackedManagerIds.filter((id) => id !== managerId)
          : [...current.trackedManagerIds, managerId],
      };
    });
  }

  function trackManager(manager: api.SmartMoneyManager): void {
    setDraft((current) => {
      const existingBuiltIn = (data?.availableManagers ?? []).find((item) => item.cik === manager.cik);
      const existingCustom = current.customManagers.find((item) => item.cik === manager.cik || item.id === manager.id);
      const targetId = existingBuiltIn?.id ?? existingCustom?.id ?? manager.id;

      return {
        ...current,
        customManagers: existingBuiltIn || existingCustom
          ? current.customManagers
          : [...current.customManagers, manager],
        trackedManagerIds: current.trackedManagerIds.includes(targetId)
          ? current.trackedManagerIds
          : [...current.trackedManagerIds, targetId],
      };
    });
    setFormError('');
  }

  function addCustomManager(): void {
    const name = managerDraft.name.trim();
    const cik = managerDraft.cik.replace(/\D/g, '');
    if (!name || !cik) {
      setFormError(t('smartMoney.managerRequired', '請輸入基金名稱與 CIK'));
      return;
    }

    const id = slugify(`${name}-${cik}`);
    if (!id) {
      setFormError(t('smartMoney.managerInvalid', '無法建立自訂基金代號'));
      return;
    }

    trackManager({ id, name, cik: String(Number(cik)) });

    setManagerDraft({ name: '', cik: '' });
    setFormError('');
  }

  function removeCustomManager(managerId: string): void {
    setDraft((current) => ({
      ...current,
      customManagers: current.customManagers.filter((manager) => manager.id !== managerId),
      trackedManagerIds: current.trackedManagerIds.filter((id) => id !== managerId),
    }));
  }

  function addInsiderSymbol(): void {
    const symbol = symbolDraft.trim().toUpperCase();
    if (!symbol) return;
    if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) {
      setFormError(t('smartMoney.usOnly', '內部人交易目前只支援美股代號'));
      return;
    }

    setDraft((current) => ({
      ...current,
      insiderSymbols: current.insiderSymbols.includes(symbol)
        ? current.insiderSymbols
        : [...current.insiderSymbols, symbol],
    }));
    setSymbolDraft('');
    setFormError('');
  }

  function removeInsiderSymbol(symbol: string): void {
    setDraft((current) => ({
      ...current,
      insiderSymbols: current.insiderSymbols.filter((item) => item !== symbol),
    }));
  }

  const availableManagers = useMemo(() => {
    const merged = [...(data?.availableManagers ?? []), ...draft.customManagers];
    const deduped = new Map<string, api.SmartMoneyManager>();
    for (const manager of merged) {
      deduped.set(manager.id, manager);
    }
    return Array.from(deduped.values());
  }, [data?.availableManagers, draft.customManagers]);

  const visibleManagerSearchResults = useMemo(() => {
    const results = managerSearch.data?.results ?? [];
    return verifiedOnly
      ? results.filter((result) => result.verificationStatus === 'verified')
      : results;
  }, [managerSearch.data?.results, verifiedOnly]);

  function updateVerifiedOnly(nextValue: boolean): void {
    setVerifiedOnly(nextValue);
    saveUiPreferencesMutation.mutate(nextValue);
  }

  return (
    <Panel
      title={t('smartMoney.panelTitle', 'Smart Money 提醒')}
      icon={<BellRing className="h-4 w-4" aria-hidden="true" />}
      className="h-full"
      bodyClassName="overflow-auto"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending || isLoading}
            aria-label={t('smartMoney.scanNow', 'Scan Smart Money now')}
            title={t('smartMoney.scanNow', 'Scan Smart Money now')}
            className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-(--color-term-border) text-(--color-term-muted) hover:text-(--color-term-text) disabled:opacity-40"
          >
            {scanMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            aria-label={t('smartMoney.saveSettings', 'Save Smart Money settings')}
            title={t('smartMoney.saveSettings', 'Save Smart Money settings')}
            className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Save className="h-3 w-3" aria-hidden="true" />}
          </button>
        </div>
      }
    >
      {isLoading && !data && (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-(--color-term-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading', '載入中...')}
        </div>
      )}

      {error && (
        <div className="p-4 text-[12px] text-rose-400">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && (
        <div className="flex flex-col gap-4 p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="flex items-start gap-3 rounded border border-(--color-term-border) bg-(--color-term-surface) p-3 text-[12px]">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-(--color-term-text)">{t('smartMoney.enable', '啟用 Smart Money 監控')}</div>
                <div className="mt-1 text-[11px] text-(--color-term-muted)">{t('smartMoney.enableHelp', '背景排程會定期檢查 13F 新建倉與內部人大額買入')}</div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded border border-(--color-term-border) bg-(--color-term-surface) p-3 text-[12px]">
              <input
                type="checkbox"
                checked={draft.useWatchlistForInsiderSymbols}
                onChange={(event) => setDraft((current) => ({ ...current, useWatchlistForInsiderSymbols: event.target.checked }))}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-(--color-term-text)">{t('smartMoney.useWatchlist', '用 Watchlist 監控 insider buy')}</div>
                <div className="mt-1 text-[11px] text-(--color-term-muted)">
                  {t('smartMoney.useWatchlistHelp', '目前 Watchlist 共有 {{count}} 檔會納入掃描', { count: data?.watchlistSymbols.length ?? 0 })}
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded border border-(--color-term-border) bg-(--color-term-surface) p-3 text-[12px]">
              <input
                type="checkbox"
                checked={draft.autoAddInsiderSignalsToWatchlist}
                onChange={(event) => setDraft((current) => ({ ...current, autoAddInsiderSignalsToWatchlist: event.target.checked }))}
                className="mt-0.5"
              />
              <div>
                <div className="font-semibold text-(--color-term-text)">{t('smartMoney.autoAdd', '內部人大額買入時自動加入 Watchlist')}</div>
                <div className="mt-1 text-[11px] text-(--color-term-muted)">{t('smartMoney.autoAddHelp', '13F 原始 SEC 資料未穩定提供 ticker，因此自動加 Watchlist 目前只套用 insider 訊號')}</div>
              </div>
            </label>

            <div className="rounded border border-(--color-term-border) bg-(--color-term-surface) p-3">
              <label htmlFor="smart-money-min-buy" className="block text-[10px] uppercase text-(--color-term-muted)">{t('smartMoney.minBuy', '大額 insider buy 門檻')}</label>
              <input
                id="smart-money-min-buy"
                type="number"
                min="1000"
                step="1000"
                value={draft.minInsiderBuyUsd}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  minInsiderBuyUsd: Number(event.target.value) > 0 ? Number(event.target.value) : current.minInsiderBuyUsd,
                }))}
                className="mt-2 w-full rounded border border-(--color-term-border) bg-(--color-term-panel) px-3 py-2 text-sm text-(--color-term-text) outline-none"
              />
            </div>
          </div>

          <section className="rounded border border-(--color-term-border)">
            <div className="border-b border-(--color-term-border) px-4 py-3">
              <div className="text-[11px] font-bold tracking-widest text-(--color-term-muted) uppercase">{t('smartMoney.managers', '13F 追蹤機構')}</div>
              <div className="mt-1 text-[11px] text-(--color-term-muted)">{t('smartMoney.managersHelp', '勾選你要主動提醒的新建倉機構；也可手動加入自訂基金 CIK')}</div>
            </div>

            <div className="border-b border-(--color-term-border) px-4 py-3">
              <div className="text-[10px] font-bold tracking-widest text-(--color-term-muted) uppercase">{t('smartMoney.lookup', 'SEC 基金搜尋 / CIK 查找')}</div>
              <div className="mt-1 text-[11px] text-(--color-term-muted)">{t('smartMoney.lookupHelp', '輸入基金名稱，直接用 SEC 搜尋結果帶回 CIK，再一鍵加入追蹤')}</div>
              <input
                aria-label={t('smartMoney.lookup', 'SEC 基金搜尋 / CIK 查找')}
                type="text"
                value={managerSearchQuery}
                onChange={(event) => setManagerSearchQuery(event.target.value)}
                placeholder={t('smartMoney.lookupPlaceholder', '例如 Berkshire Hathaway、Bridgewater')}
                className="mt-3 w-full rounded border border-(--color-term-border) bg-(--color-term-panel) px-3 py-2 text-sm text-(--color-term-text) outline-none"
              />
              <label className="mt-3 inline-flex items-center gap-2 text-[11px] text-(--color-term-muted)">
                <input
                  type="checkbox"
                  checked={verifiedOnly}
                  onChange={(event) => updateVerifiedOnly(event.target.checked)}
                  className="rounded"
                />
                {t('smartMoney.lookupVerifiedOnly', '只顯示已驗證 13F manager')}
              </label>

              {deferredManagerSearchQuery.length >= 2 && (
                <div className="mt-3 rounded border border-(--color-term-border)">
                  {managerSearch.isLoading && (
                    <div className="flex items-center gap-2 px-3 py-3 text-[11px] text-(--color-term-muted)">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('smartMoney.lookupLoading', '正在查找 SEC CIK...')}
                    </div>
                  )}

                  {managerSearch.error && (
                    <div className="px-3 py-3 text-[11px] text-rose-400">{(managerSearch.error as Error).message}</div>
                  )}

                  {!managerSearch.isLoading && !managerSearch.error && visibleManagerSearchResults.length === 0 && (
                    <div className="px-3 py-3 text-[11px] text-(--color-term-muted)">
                      {verifiedOnly && (managerSearch.data?.results.length ?? 0) > 0
                        ? t('smartMoney.lookupVerifiedEmpty', '這個關鍵字有搜尋結果，但目前沒有已驗證 13F 的 manager')
                        : t('smartMoney.lookupEmpty', '這個關鍵字暫時沒有可用的 SEC manager 結果')}
                    </div>
                  )}

                  {!managerSearch.isLoading && !managerSearch.error && visibleManagerSearchResults.length > 0 && (
                    <ul className="divide-y divide-(--color-term-border)/50">
                      {visibleManagerSearchResults.map((result) => {
                        const knownManager = availableManagers.find((item) => item.cik === result.cik);
                        const trackedId = knownManager?.id ?? result.id;
                        const isTracked = draft.trackedManagerIds.includes(trackedId);

                        return (
                          <li key={`${result.cik}-${result.id}`} className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-semibold text-(--color-term-text)">{knownManager?.name ?? result.name}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-(--color-term-muted)">
                                <span>CIK {result.cik}</span>
                                {result.form ? <span>· {result.form}</span> : null}
                                <span className={cn(
                                  'rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest',
                                  result.verificationStatus === 'verified'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : result.verificationStatus === 'not_found'
                                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                      : 'border-(--color-term-border) bg-(--color-term-surface) text-(--color-term-muted)',
                                )}>
                                  {result.verificationStatus === 'verified'
                                    ? t('smartMoney.verifiedBadge', '13F-HR 已驗證')
                                    : result.verificationStatus === 'not_found'
                                      ? t('smartMoney.notFoundBadge', '未找到近期 13F-HR')
                                      : t('smartMoney.unavailableBadge', '13F 驗證暫不可用')}
                                </span>
                                {result.last13FFilingDate ? <span>· {result.last13FFilingDate}</span> : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => trackManager({ id: result.id, name: result.name, cik: result.cik })}
                              className={cn(
                                'focus-ring rounded border px-2 py-1 text-[10px] font-bold transition-colors',
                                isTracked
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
                              )}
                            >
                              {isTracked ? t('smartMoney.tracked', '已追蹤') : t('smartMoney.addTrack', '加入追蹤')}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 px-4 py-3">
              {availableManagers.map((manager) => {
                const active = draft.trackedManagerIds.includes(manager.id);
                const isCustom = draft.customManagers.some((item) => item.id === manager.id);
                return (
                  <div key={manager.id} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleManager(manager.id)}
                      className={cn(
                        'rounded border px-2 py-1 text-[11px] transition-colors',
                        active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-(--color-term-border) text-(--color-term-muted)',
                      )}
                    >
                      {manager.name}
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => removeCustomManager(manager.id)}
                        className="text-rose-400 hover:text-rose-300"
                        aria-label={t('smartMoney.removeManager', '移除自訂基金')}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 border-t border-(--color-term-border) px-4 py-3 sm:grid-cols-[1fr_160px_auto]">
              <input
                aria-label={t('smartMoney.managerName', '自訂基金名稱')}
                type="text"
                value={managerDraft.name}
                onChange={(event) => setManagerDraft((current) => ({ ...current, name: event.target.value }))}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomManager(); } }}
                placeholder={t('smartMoney.managerName', '自訂基金名稱，例如 Duquesne Family Office')}
                className="rounded border border-(--color-term-border) bg-(--color-term-panel) px-3 py-2 text-sm text-(--color-term-text) outline-none"
              />
              <input
                aria-label={t('smartMoney.managerCik', 'CIK')}
                type="text"
                value={managerDraft.cik}
                onChange={(event) => setManagerDraft((current) => ({ ...current, cik: event.target.value }))}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustomManager(); } }}
                placeholder={t('smartMoney.managerCik', 'CIK')}
                className="rounded border border-(--color-term-border) bg-(--color-term-panel) px-3 py-2 text-sm text-(--color-term-text) outline-none"
              />
              <button
                type="button"
                onClick={addCustomManager}
                className="focus-ring rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20"
              >
                <Plus className="mr-1 inline h-3 w-3" />
                {t('common.add', '新增')}
              </button>
            </div>
          </section>

          <section className="rounded border border-(--color-term-border)">
            <div className="border-b border-(--color-term-border) px-4 py-3">
              <div className="text-[11px] font-bold tracking-widest text-(--color-term-muted) uppercase">{t('smartMoney.symbols', '額外 Insider 監控代號')}</div>
              <div className="mt-1 text-[11px] text-(--color-term-muted)">{t('smartMoney.symbolsHelp', '除了 Watchlist，也可手動加入想特別監控的大額 insider buy 美股代號')}</div>
            </div>

            <div className="flex flex-wrap gap-2 px-4 py-3">
              {draft.insiderSymbols.length === 0 && (
                <span className="text-[11px] text-(--color-term-muted)">{t('smartMoney.symbolsEmpty', '目前沒有額外代號')}</span>
              )}
              {draft.insiderSymbols.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => removeInsiderSymbol(symbol)}
                  className="rounded border border-(--color-term-border) px-2 py-1 text-[11px] text-(--color-term-text) hover:border-rose-500/30 hover:text-rose-400"
                >
                  {symbol} <Trash2 className="ml-1 inline h-3 w-3" />
                </button>
              ))}
            </div>

            <div className="grid gap-2 border-t border-(--color-term-border) px-4 py-3 sm:grid-cols-[1fr_auto]">
              <input
                aria-label={t('smartMoney.symbolInput', '額外 Insider 監控代號')}
                type="text"
                value={symbolDraft}
                onChange={(event) => setSymbolDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addInsiderSymbol(); } }}
                placeholder={t('smartMoney.symbolInput', '例如 AAPL, MSFT, NVDA')}
                className="rounded border border-(--color-term-border) bg-(--color-term-panel) px-3 py-2 text-sm text-(--color-term-text) outline-none"
              />
              <button
                type="button"
                onClick={addInsiderSymbol}
                className="focus-ring rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/20"
              >
                <Plus className="mr-1 inline h-3 w-3" />
                {t('common.add', '新增')}
              </button>
            </div>
          </section>

          <div className="rounded border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200">
            {t('smartMoney.note', '13F 原始 SEC 資料通常只有 issuer / CUSIP，沒有穩定 ticker。這版會把 13F 新建倉寫進 Alerts 事件流並推送通知；真正自動加入 Watchlist 目前只對 insider buy 啟用。')}
          </div>

          {formError && (
            <div className="flex items-center gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
              <AlertTriangle className="h-3 w-3" />
              {formError}
            </div>
          )}

          {toast && (
            <div className={cn(
              'rounded border px-3 py-2 text-[11px]',
              toast.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300',
            )}>
              {toast.text}
            </div>
          )}

          <section className="rounded border border-(--color-term-border)">
            <div className="flex items-center justify-between border-b border-(--color-term-border) px-4 py-3">
              <div>
                <div className="text-[11px] font-bold tracking-widest text-(--color-term-muted) uppercase">{t('smartMoney.events', '最近 Smart Money 事件')}</div>
                <div className="mt-1 text-[11px] text-(--color-term-muted)">
                  {data?.lastScanAt
                    ? t('smartMoney.lastScan', '最近掃描：{{time}}', { time: new Date(data.lastScanAt).toLocaleString() })
                    : t('smartMoney.neverScanned', '尚未掃描')}
                </div>
              </div>
            </div>

            <ul className="divide-y divide-(--color-term-border)/50">
              {(data?.recentEvents ?? []).length === 0 && (
                <li className="px-4 py-6 text-center text-[12px] text-(--color-term-muted)">{t('smartMoney.eventsEmpty', '目前沒有 Smart Money 事件')}</li>
              )}

              {(data?.recentEvents ?? []).map((event) => {
                const hasSymbol = !!event.symbol;
                const symbolInWatchlist = hasSymbol ? watchlistSymbols.has(event.symbol!) : false;

                return (
                  <li key={event.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <span className={cn(
                      'rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-widest',
                      event.type === '13f_new_position'
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                    )}>
                      {event.type === '13f_new_position' ? '13F' : 'INSIDER'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-(--color-term-text)">{event.title}</div>
                      <div className="mt-1 text-[11px] text-(--color-term-muted)">{event.summary}</div>
                      <div className="mt-1 text-[10px] text-(--color-term-muted)">
                        {new Date(event.eventDate).toLocaleDateString()}
                        {event.symbol ? ` · ${event.symbol}` : ''}
                        {event.autoAddedToWatchlist ? ` · ${t('smartMoney.autoAddedBadge', '已自動加入 Watchlist')}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasSymbol && !symbolInWatchlist && !event.autoAddedToWatchlist && (
                        <button
                          type="button"
                          onClick={() => addWatchlistMutation.mutate({ symbol: event.symbol!, name: event.issuer })}
                          disabled={addWatchlistMutation.isPending}
                          className="focus-ring rounded border border-(--color-term-border) px-2 py-1 text-[10px] text-(--color-term-muted) hover:text-(--color-term-text) disabled:opacity-40"
                        >
                          + Watchlist
                        </button>
                      )}
                      {hasSymbol && (symbolInWatchlist || event.autoAddedToWatchlist) && (
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                          {t('smartMoney.inWatchlist', 'Watchlist 中')}
                        </span>
                      )}
                      <a
                        href={event.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--color-term-muted) hover:text-(--color-term-accent)"
                        aria-label={t('smartMoney.openSource', '開啟來源')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </Panel>
  );
}
