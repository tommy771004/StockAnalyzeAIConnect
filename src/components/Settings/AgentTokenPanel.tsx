import React from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../../services/api';

export function AgentTokenPanel() {
  const { t } = useTranslation();
  const [tokens, setTokens] = React.useState<api.AgentTokenRecord[]>([]);
  const [name, setName] = React.useState('Paper Agent');
  const [instruments, setInstruments] = React.useState('AAPL');
  const [plaintext, setPlaintext] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');

  const reload = React.useCallback(() => {
    api.listAgentTokens().then(setTokens).catch((reason) => setError(String(reason)));
  }, []);

  React.useEffect(reload, [reload]);

  const create = async () => {
    setError('');
    const created = await api.createAgentToken({
      name,
      scopes: ['R', 'B', 'T'],
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      allowedMarkets: ['us_stock'],
      allowedInstruments: instruments.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
      rateLimitPerMinute: 60,
    });
    setPlaintext(created.plaintext);
    reload();
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-bold tracking-widest">{t('agentTokens.title', 'SCOPED AGENT TOKENS')}</h3>
        <p className="text-[10px] text-(--color-term-muted)">
          {t('agentTokens.paperOnly', 'Tokens are paper-only, revocable, expiring, rate-limited, and allowlisted.')}
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="bg-(--color-term-panel) border border-(--color-term-border) p-2 text-xs" />
        <input value={instruments} onChange={(event) => setInstruments(event.target.value)} placeholder="AAPL, MSFT" className="bg-(--color-term-panel) border border-(--color-term-border) p-2 text-xs" />
        <button onClick={() => void create()} className="border border-(--color-term-accent) px-3 text-xs text-(--color-term-accent)">
          {t('agentTokens.create', 'CREATE')}
        </button>
      </div>
      {plaintext && (
        <div role="alert" className="border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-bold">{t('agentTokens.once', 'Copy now — this secret is shown once.')}</p>
          <code className="block break-all py-2 text-xs">{plaintext}</code>
          <button onClick={() => setPlaintext(null)} className="text-xs underline">
            {t('agentTokens.dismiss', 'Dismiss and erase')}
          </button>
        </div>
      )}
      <div className="space-y-1">
        {tokens.map((token) => (
          <div key={token.id} className="flex flex-wrap items-center justify-between gap-2 border border-(--color-term-border) p-2 text-[10px]">
            <span>{token.name} · {token.prefix} · {token.scopes.join('/')} · {token.expiresAt}</span>
            <button
              onClick={() => void api.revokeAgentToken(token.id).then(reload)}
              className="text-rose-300"
            >
              {t('agentTokens.revoke', 'REVOKE')}
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
