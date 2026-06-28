import React from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../../services/api';

export function StrategyVersionWorkspace({ defaultSymbol = '2330.TW' }: { defaultSymbol?: string }) {
  const { t } = useTranslation();
  const [strategies, setStrategies] = React.useState<api.Strategy[]>([]);
  const [strategyId, setStrategyId] = React.useState<number | null>(null);
  const [versions, setVersions] = React.useState<api.StrategyVersionRecord[]>([]);
  const [selectedId, setSelectedId] = React.useState('');
  const [runtime, setRuntime] = React.useState<'indicator' | 'script'>('indicator');
  const [source, setSource] = React.useState('');
  const [symbol, setSymbol] = React.useState(defaultSymbol);
  const [job, setJob] = React.useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = React.useState('');

  const reloadVersions = React.useCallback(async (id: number) => {
    const rows = await api.getStrategyVersions(id);
    setVersions(rows);
    setSelectedId((current) => current || rows[0]?.id || '');
  }, []);

  React.useEffect(() => {
    api.getStrategies().then((rows) => {
      setStrategies(rows);
      const first = rows[0]?.id ?? null;
      setStrategyId(first);
      if (first) void reloadVersions(first);
    }).catch((error) => setMessage(String(error)));
  }, [reloadVersions]);

  const createVersion = async () => {
    if (!strategyId || !source.trim()) return;
    const created = await api.createStrategyVersion(strategyId, {
      runtime,
      source,
      provenance: 'human',
    });
    setSelectedId(created.id);
    setSource('');
    await reloadVersions(strategyId);
  };

  const validate = async () => {
    if (!selectedId) return;
    const result = await api.validateStrategyVersion(selectedId);
    setMessage(result.valid
      ? `${t('strategyWorkspace.valid', 'VALID')} · ${result.engineVersion}`
      : result.diagnostics.map((item) => item.message).join(' · '));
    if (strategyId) await reloadVersions(strategyId);
  };

  const launchBacktest = async () => {
    if (!selectedId || !symbol.trim()) return;
    const queued = await api.startStrategyBacktest(selectedId, symbol.trim().toUpperCase());
    setJob(queued as unknown as Record<string, unknown>);
  };

  const refreshJob = async () => {
    const id = typeof job?.id === 'string' ? job.id : '';
    if (id) setJob(await api.getStrategyBacktestJob(id));
  };

  const selected = versions.find((version) => version.id === selectedId);

  return (
    <section className="space-y-3" aria-label={t('strategyWorkspace.title', 'Strategy Versions')}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-bold tracking-widest text-(--color-term-accent)">
          {t('strategyWorkspace.title', 'IMMUTABLE STRATEGY WORKSPACE')}
        </h2>
        <select
          value={strategyId ?? ''}
          onChange={(event) => {
            const id = Number(event.target.value);
            setStrategyId(id);
            setSelectedId('');
            void reloadVersions(id);
          }}
          className="bg-(--color-term-panel) border border-(--color-term-border) px-2 py-1 text-xs"
        >
          {strategies.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
          ))}
        </select>
        <select
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className="min-w-56 bg-(--color-term-panel) border border-(--color-term-border) px-2 py-1 text-xs"
        >
          <option value="">{t('strategyWorkspace.selectVersion', 'Select version')}</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.version} · {version.runtime} · {version.validationStatus}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div className="grid gap-2 md:grid-cols-4 text-[10px] text-(--color-term-muted)">
          <span>HASH {selected.sourceHash.slice(0, 12)}</span>
          <span>RUNTIME {selected.runtime}</span>
          <span>PROVENANCE {selected.provenance}</span>
          <span>VALIDATION {selected.validationStatus}</span>
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-[130px_1fr_auto]">
        <select
          value={runtime}
          onChange={(event) => setRuntime(event.target.value as 'indicator' | 'script')}
          className="bg-(--color-term-panel) border border-(--color-term-border) px-2 py-1 text-xs"
        >
          <option value="indicator">indicator</option>
          <option value="script">script</option>
        </select>
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder={t('strategyWorkspace.sourcePlaceholder', 'Python strategy source')}
          className="min-h-24 bg-black/40 border border-(--color-term-border) p-2 font-mono text-xs"
        />
        <button onClick={() => void createVersion()} className="px-3 py-2 border border-(--color-term-accent) text-(--color-term-accent) text-xs">
          {t('strategyWorkspace.createVersion', 'CREATE VERSION')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void validate()} disabled={!selectedId} className="px-3 py-1 border border-(--color-term-border) text-xs disabled:opacity-40">
          {t('strategyWorkspace.validate', 'VALIDATE')}
        </button>
        <input value={symbol} onChange={(event) => setSymbol(event.target.value)} className="bg-(--color-term-panel) border border-(--color-term-border) px-2 py-1 text-xs" />
        <button onClick={() => void launchBacktest()} disabled={!selectedId} className="px-3 py-1 border border-(--color-term-border) text-xs disabled:opacity-40">
          {t('strategyWorkspace.backtest', 'QUEUE BACKTEST')}
        </button>
        <button onClick={() => void refreshJob()} disabled={!job} className="px-3 py-1 border border-(--color-term-border) text-xs disabled:opacity-40">
          {t('strategyWorkspace.refresh', 'REFRESH RESULT')}
        </button>
      </div>
      {message && <p className="text-xs text-amber-300">{message}</p>}
      {job && <pre className="max-h-52 overflow-auto bg-black/40 p-2 text-[10px]">{JSON.stringify(job, null, 2)}</pre>}
    </section>
  );
}
