import { Position, Trade, BacktestMetrics, BacktestTrade } from '../types';

/**
 * exportPdf.ts — Browser-native PDF export (no external library)
 *
 * Uses window.print() with a dedicated print stylesheet injected at runtime.
 * Works in every modern browser and Electron's BrowserWindow.
 *
 * Usage:
 *   exportPdf('portfolio-2026-03', '<html>…</html>');
 */

export interface PdfSection {
  title: string;
  /** Raw HTML string for the section content */
  html: string;
}

/**
 * Generate a print-ready HTML document and open the browser print dialog.
 * In Electron, this triggers the native print-to-PDF flow.
 */
export function exportPdf(filename: string, sections: PdfSection[], subtitle?: string): void {
  const content = sections.map(s => `
    <section class="section">
      <h2>${escapeHtml(s.title)}</h2>
      ${s.html}
    </section>
  `).join('<div class="page-break"></div>');

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(filename)}</title>
  <style>
    @page { size: A4; margin: 20mm 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11pt; color: #1a1a1a; background: white; }
    .header { border-bottom: 2px solid #34d399; padding-bottom: 8px; margin-bottom: 20px; }
    .header h1 { font-size: 18pt; font-weight: 900; color: #18181b; }
    .header .meta { font-size: 9pt; color: #71717a; margin-top: 4px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 13pt; font-weight: 700; color: #18181b; border-left: 3px solid #34d399; padding-left: 8px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th { background: #f4f4f5; color: #3f3f46; font-weight: 700; text-align: left; padding: 6px 8px; border-bottom: 1px solid #e4e4e7; }
    td { padding: 5px 8px; border-bottom: 1px solid #f4f4f5; color: #27272a; }
    tr:last-child td { border-bottom: none; }
    .pos { color: #16a34a; font-weight: 700; }
    .neg { color: #dc2626; font-weight: 700; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: 700; }
    .badge-green { background: #dcfce7; color: #16a34a; }
    .badge-red   { background: #fee2e2; color: #dc2626; }
    .badge-gray  { background: #f4f4f5; color: #71717a; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .metric { background: #f4f4f5; border-radius: 8px; padding: 10px; }
    .metric .label { font-size: 8pt; color: #71717a; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric .value { font-size: 16pt; font-weight: 900; margin-top: 2px; }
    .footer { margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 8px; font-size: 8pt; color: #a1a1aa; display: flex; justify-content: space-between; }
    .page-break { page-break-after: always; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>QUANTUM AI — LiquidIntelligence</h1>
    <div class="meta">
      ${subtitle ? escapeHtml(subtitle) + ' · ' : ''}
      產生時間：${new Date().toLocaleString('zh-TW')}
    </div>
  </div>
  ${content}
  <div class="footer">
    <span>${escapeHtml(filename)}</span>
    <span>© ${new Date().getFullYear()} QUANTUM AI · LiquidIntelligence v4.1.0</span>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('請允許彈出視窗以匯出 PDF'); return; }
  w.document.write(html);
  w.document.close();
  // Small delay to let fonts/styles load before print dialog
  setTimeout(() => {
    w.focus();
    w.print();
  }, 400);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Portfolio PDF builder ──────────────────────────────────────────────────────
export function buildPortfolioPdf(positions: Position[], trades: Trade[], summary: {
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  winRate: number;
}) {
  const summaryHtml = `
    <div class="metric-grid">
      <div class="metric">
        <div class="label">總市值</div>
        <div class="value">$${summary.totalValue.toLocaleString('en', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="metric">
        <div class="label">總損益</div>
        <div class="value ${summary.totalPnl >= 0 ? 'pos' : 'neg'}">${summary.totalPnl >= 0 ? '+' : ''}$${summary.totalPnl.toLocaleString('en', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="metric">
        <div class="label">報酬率</div>
        <div class="value ${summary.totalPnlPct >= 0 ? 'pos' : 'neg'}">${summary.totalPnlPct >= 0 ? '+' : ''}${summary.totalPnlPct.toFixed(2)}%</div>
      </div>
      <div class="metric">
        <div class="label">勝率</div>
        <div class="value">${summary.winRate.toFixed(1)}%</div>
      </div>
    </div>`;

  const posHtml = `
    <table>
      <thead><tr><th>代號</th><th>名稱</th><th>股數</th><th>均成本</th><th>現價</th><th>市值</th><th>損益</th><th>損益%</th></tr></thead>
      <tbody>
        ${positions.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.symbol)}</strong></td>
            <td>${escapeHtml(p.name ?? p.shortName ?? '')}</td>
            <td>${(p.shares ?? 0).toLocaleString()}</td>
            <td>${(p.avgCost ?? 0).toFixed(2)}</td>
            <td>${(p.currentPrice ?? 0).toFixed(2)}</td>
            <td>$${((p.marketValue ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
            <td class="${(p.pnl ?? 0) >= 0 ? 'pos' : 'neg'}">${(p.pnl ?? 0) >= 0 ? '+' : ''}$${((p.pnl ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
            <td><span class="badge ${(p.pnlPercent ?? 0) >= 0 ? 'badge-green' : 'badge-red'}">${(p.pnlPercent ?? 0) >= 0 ? '+' : ''}${((p.pnlPercent ?? 0)).toFixed(2)}%</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  const tradeHtml = trades.length === 0 ? '<p style="color:#71717a;font-size:10pt">暫無交易記錄</p>' : `
    <table>
      <thead><tr><th>日期</th><th>代號</th><th>方向</th><th>進場</th><th>出場</th><th>數量</th><th>損益</th></tr></thead>
      <tbody>
        ${trades.slice(0, 50).map((raw) => {
          const t = raw as Trade & Pick<BacktestTrade, 'time'|'symbol'|'ticker'|'action'|'entry'|'exit'|'qty'|'amount'|'type'>;
          return `
          <tr>
            <td>${escapeHtml(String(t.date ??  '').slice(0,10))}</td>
            <td><strong>${escapeHtml(t.symbol ?? t.ticker ?? '')}</strong></td>
            <td><span class="badge ${String(t.type??t.action??'').includes('Buy')||t.type==='BUY'?'badge-green':'badge-red'}">${escapeHtml(String(t.type??t.action??''))}</span></td>
            <td>${((t.entry ?? t.price ?? 0) as number).toFixed(2)}</td>
            <td>${((t.exit ?? 0) as number).toFixed(2)}</td>
            <td>${(t.qty ?? (t.amount as number | undefined) ?? 0).toLocaleString()}</td>
            <td class="${(t.pnl ?? 0) >= 0 ? 'pos' : 'neg'}">${(t.pnl ?? 0) >= 0 ? '+' : ''}$${((t.pnl ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  exportPdf(
    `portfolio-${new Date().toISOString().slice(0,10)}`,
    [
      { title: '投資組合概覽', html: summaryHtml },
      { title: '持倉明細', html: posHtml },
      { title: '交易記錄（最近50筆）', html: tradeHtml },
    ],
    '投資組合報告'
  );
}

// ── Backtest PDF builder ───────────────────────────────────────────────────────

export function buildBacktestPdf(symbol: string, strategy: string, metrics: Partial<BacktestMetrics>, trades: BacktestTrade[]) {

  const metricsHtml = `
    <div class="metric-grid">
      <div class="metric">
        <div class="label">總報酬率</div>
        <div class="value ${(metrics?.roi ?? 0) >= 0 ? 'pos' : 'neg'}">${(metrics?.roi ?? 0) >= 0 ? '+' : ''}${(metrics?.roi ?? 0).toFixed(2)}%</div>
      </div>
      <div class="metric">
        <div class="label">Sharpe Ratio</div>
        <div class="value">${(metrics?.sharpe ?? 0).toFixed(2)}</div>
      </div>
      <div class="metric">
        <div class="label">最大回撤</div>
        <div class="value neg">-${(metrics?.maxDrawdown ?? 0).toFixed(2)}%</div>
      </div>
      <div class="metric">
        <div class="label">勝率</div>
        <div class="value">${(metrics?.winRate ?? 0).toFixed(1)}%</div>
      </div>
    </div>
    <table style="max-width:400px">
      <tr><th>指標</th><th>數值</th></tr>
      <tr><td>總交易次數</td><td>${metrics?.totalTrades ?? 0}</td></tr>
      <tr><td>盈利因子</td><td>${(metrics?.profitFactor ?? 0).toFixed(2)}</td></tr>
    </table>`;

  const tradeHtml = `
    <table>
      <thead><tr><th>日期</th><th>方向</th><th>價格</th><th>數量</th><th>損益</th></tr></thead>
      <tbody>

        ${(trades ?? []).slice(0, 50).map((t: BacktestTrade) => `
          <tr>
            <td>${escapeHtml(String(t.date ?? '').slice(0, 10))}</td>
            <td><span class="badge ${t.type === 'BUY' ? 'badge-green' : 'badge-red'}">${escapeHtml(t.type ?? '')}</span></td>
            <td>${(t.price ?? 0).toFixed(2)}</td>
            <td>${(t.shares ?? 0).toLocaleString()}</td>
            <td class="${(t.pnl ?? 0) >= 0 ? 'pos' : 'neg'}">${(t.pnl ?? 0) >= 0 ? '+' : ''}$${((t.pnl ?? 0)).toLocaleString('en', { maximumFractionDigits: 0 })}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  exportPdf(
    `backtest-${symbol}-${new Date().toISOString().slice(0,10)}`,
    [
      { title: `回測摘要 — ${symbol} · ${strategy}`, html: metricsHtml },
      { title: '交易明細（最近50筆）', html: tradeHtml },
    ],
    `回測報告 · ${symbol}`
  );
}
