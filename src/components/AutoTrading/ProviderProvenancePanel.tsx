import React from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../../services/api';

export function ProviderProvenancePanel() {
  const { t } = useTranslation();
  const [health, setHealth] = React.useState<Awaited<ReturnType<typeof api.getDataSourceHealth>> | null>(null);

  React.useEffect(() => {
    api.getDataSourceHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <section className="space-y-2" aria-label={t('providerProvenance.title', 'Provider provenance')}>
      <h2 className="text-xs font-bold tracking-widest text-(--color-term-accent)">
        {t('providerProvenance.title', 'DATA PROVIDER PROVENANCE')}
      </h2>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {health?.providers.map((provider) => (
          <article key={provider.id} className="border border-(--color-term-border) bg-black/30 p-2 text-[10px]">
            <div className="flex justify-between gap-2">
              <strong>{provider.id}@{provider.version}</strong>
              <span>{provider.breaker}</span>
            </div>
            <p className="text-(--color-term-muted)">{provider.markets.join(', ')} · {provider.operations.join(', ')}</p>
            <p>{t('providerProvenance.lastSuccess', 'last success')}: {provider.lastSuccessAt ?? '—'}</p>
            <p>{t('providerProvenance.rateRemaining', 'rate remaining')}: {provider.rateRemaining}</p>
          </article>
        ))}
      </div>
      {health && (
        <p className="text-[10px] text-(--color-term-muted)">
          CACHE {health.cache.entries} · HIT {health.cache.hits} · MISS {health.cache.misses} · EVICT {health.cache.evictions}
        </p>
      )}
    </section>
  );
}
