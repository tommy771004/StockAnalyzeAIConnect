import { useTranslation } from 'react-i18next';

import type { AgentConfig, AgentStatus } from './types';

export function PaperSessionPanel({
  status,
  config,
}: {
  status: AgentStatus;
  config?: AgentConfig;
}) {
  const { t } = useTranslation();
  return (
    <section className="border border-(--color-term-border) rounded-sm p-3 text-[10px] space-y-2">
      <div className="flex items-center justify-between">
        <strong className="tracking-widest">{t('paperSession.title', 'PAPER SESSION')}</strong>
        <span className="text-emerald-300">{t('paperSession.simulated', 'SIMULATED ONLY')}</span>
      </div>
      <dl className="grid grid-cols-2 gap-1">
        <dt className="text-(--color-term-muted)">STATUS</dt><dd>{status}</dd>
        <dt className="text-(--color-term-muted)">VERSION</dt><dd>{config?.strategyVersionId ?? 'legacy-unversioned'}</dd>
        <dt className="text-(--color-term-muted)">SYMBOLS</dt><dd>{config?.symbols.join(', ') || '—'}</dd>
      </dl>
      <p className="text-amber-300">
        {t('paperSession.liveDisabled', 'Live broker controls remain disabled until signed sandbox verification is complete.')}
      </p>
    </section>
  );
}
