import { Panel } from '../ui/Panel';
import { heatmapCells, topGainers, topLosers, watchlistRows } from '../mockData';
import { formatPct, toneClass } from '../ui/format';

export function MarketPage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      <div className="col-span-12 min-h-[320px] lg:col-span-8">
        <Panel title="GLOBAL SECTOR PERFORMANCE">
          <div className="grid grid-cols-4 gap-1 p-2">
            {heatmapCells.map((c) => (
              <div
                key={c.label}
                className={`flex flex-col items-start justify-between p-3 text-[12px] ${
                  c.changePct >= 0 ? 'bg-emerald-800/70' : 'bg-rose-800/70'
                }`}
              >
                <span className="font-semibold tracking-widest">{c.label}</span>
                <span className="self-end tabular-nums">{formatPct(c.changePct, 1)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-4">
        <Panel title="TOP GAINERS">
          <MoversList items={topGainers} />
        </Panel>
        <Panel title="TOP LOSERS">
          <MoversList items={topLosers} />
        </Panel>
      </div>
      <div className="col-span-12 min-h-[260px]">
        <Panel title="ALL SYMBOLS">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
              <tr className="border-b border-(--color-term-border)">
                <th className="px-4 py-2 text-left">SYMBOL</th>
                <th className="px-4 py-2 text-right">LAST</th>
                <th className="px-4 py-2 text-right">CHG%</th>
                <th className="px-4 py-2 text-right">VOLUME</th>
              </tr>
            </thead>
            <tbody>
              {watchlistRows.map((r) => (
                <tr key={r.symbol} className="border-b border-(--color-term-border)/60">
                  <td className="px-4 py-2 font-semibold tracking-wider">{r.symbol}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.last.toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${toneClass(r.changePct)}`}>
                    {formatPct(r.changePct)}
                  </td>
                  <td className="px-4 py-2 text-right text-(--color-term-muted)">{r.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function MoversList({ items }: { items: Array<{ symbol: string; changePct: number }> }) {
  return (
    <ul className="divide-y divide-(--color-term-border)/60">
      {items.map((m) => (
        <li key={m.symbol} className="flex items-center justify-between px-4 py-2 text-[12px]">
          <span className="font-semibold tracking-wider">{m.symbol}</span>
          <span className={`tabular-nums ${toneClass(m.changePct)}`}>
            {formatPct(m.changePct, 1)}
          </span>
        </li>
      ))}
    </ul>
  );
}
