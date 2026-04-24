/**
 * src/terminal/pages/Backtest.tsx
 *
 * Terminal shell adapter for the existing Material-Design backtest page.
 *
 * Rather than fork 895 lines of UI to match the terminal's monochrome
 * aesthetic, we reuse `src/components/BacktestPage` verbatim and render it
 * inside a terminal-friendly container. The full feature set (strategy
 * picker, multi-strategy comparison, equity curve, trade log, PDF export)
 * stays available unchanged. A visual reskin can happen separately if the
 * MD3 palette feels out of place next to the other terminal pages.
 */
import BacktestPage from '../../components/BacktestPage';

export function BacktestTerminalPage() {
  return (
    <div className="h-full overflow-auto bg-(--color-term-bg)">
      <BacktestPage />
    </div>
  );
}
