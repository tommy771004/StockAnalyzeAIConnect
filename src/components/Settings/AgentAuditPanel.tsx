import React from 'react';
import { useTranslation } from 'react-i18next';

import * as api from '../../services/api';

export function AgentAuditPanel() {
  const { t } = useTranslation();
  const [events, setEvents] = React.useState<Awaited<ReturnType<typeof api.listAgentAuditEvents>>>([]);

  React.useEffect(() => {
    api.listAgentAuditEvents(50).then(setEvents).catch(() => setEvents([]));
  }, []);

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold tracking-widest">{t('agentAudit.title', 'AGENT AUDIT TRAIL')}</h3>
      <div className="max-h-72 overflow-auto border border-(--color-term-border)">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-(--color-term-panel)">
            <tr>
              <th className="p-2">TIME</th><th>TOOL/ROUTE</th><th>RISK</th><th>STATUS</th><th>RESOURCE</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-(--color-term-border)">
                <td className="p-2 whitespace-nowrap">{event.createdAt}</td>
                <td>{String(event.metadata.toolName ?? event.route)}</td>
                <td>{event.riskClass}</td>
                <td>{event.status}</td>
                <td>{event.resourceIds.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
