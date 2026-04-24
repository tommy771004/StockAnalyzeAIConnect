import { Panel } from '../ui/Panel';
import { Sparkline } from '../ui/Sparkline';
import { formatPct, toneClass } from '../ui/format';

const cryptos = [
  { symbol: 'BTC/USD', name: 'Bitcoin', price: 51450.12, changePct: 1.2 },
  { symbol: 'ETH/USD', name: 'Ethereum', price: 3145.5, changePct: -0.4 },
  { symbol: 'SOL/USD', name: 'Solana', price: 152.88, changePct: 3.1 },
  { symbol: 'AVAX/USD', name: 'Avalanche', price: 38.42, changePct: -1.1 },
  { symbol: 'DOGE/USD', name: 'Dogecoin', price: 0.162, changePct: 5.2 },
];

const spark = (seed: number) =>
  Array.from({ length: 40 }, (_, i) => Math.sin((i + seed) / 3) * 5 + Math.cos(i / 2) * 2 + 10);

export function CryptoPage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-3">
      <div className="col-span-12 min-h-[300px]">
        <Panel title="CRYPTO MARKETS">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] tracking-widest text-(--color-term-muted)">
              <tr className="border-b border-(--color-term-border)">
                <th className="px-4 py-2 text-left">PAIR</th>
                <th className="px-4 py-2 text-left">NAME</th>
                <th className="px-4 py-2 text-right">PRICE (USD)</th>
                <th className="px-4 py-2 text-right">24H CHG</th>
                <th className="px-4 py-2 text-right">TREND</th>
              </tr>
            </thead>
            <tbody>
              {cryptos.map((c, i) => (
                <tr key={c.symbol} className="border-b border-(--color-term-border)/60">
                  <td className="px-4 py-2 font-semibold tracking-wider">{c.symbol}</td>
                  <td className="px-4 py-2 text-(--color-term-muted)">{c.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.price.toLocaleString('en-US', {
                      minimumFractionDigits: c.price < 1 ? 4 : 2,
                    })}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${toneClass(c.changePct)}`}>
                    {formatPct(c.changePct, 2)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="ml-auto h-8 w-28">
                      <Sparkline
                        data={spark(i * 3)}
                        stroke={c.changePct >= 0 ? '#22d3ee' : '#f87171'}
                        fill="rgba(255,255,255,0.04)"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
