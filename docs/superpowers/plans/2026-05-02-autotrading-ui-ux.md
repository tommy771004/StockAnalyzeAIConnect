# Auto-Trading UI/UX — Decision Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Decision Analysis Panel, trade Toast notifications, and row-highlight animations to the AutoTrading LIVE_VIEW, then restructure the layout into a three-column grid with mobile tab support.

**Architecture:** Five self-contained tasks — two new components (`TradeToast`, `DecisionAnalysisPanel`), two prop additions (`AssetMonitor`, `DecisionLog`), and one integration pass in `AutoTrading.tsx`. No backend changes. All data comes from the existing `useAutotradingWS` hook.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, existing `useAutotradingWS` WebSocket hook (`ws.orderEvents`, `ws.decisionFusions`, `ws.logs`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/AutoTrading/TradeToast.tsx` | Fixed-position toast queue; watches `OrderLifecycleEvent[]` for FILLED orders |
| Create | `src/components/AutoTrading/DecisionAnalysisPanel.tsx` | Three-section panel: confidence gauge, signal breakdown cards, decision timeline |
| Modify | `src/components/AutoTrading/AssetMonitor.tsx` | Accept optional `highlightedSymbols?: Set<string>` prop; flash matching rows |
| Modify | `src/components/AutoTrading/DecisionLog.tsx` | Accept optional `highlightedSymbols?: Set<string>` prop; flash matching log rows |
| Modify | `src/terminal/pages/AutoTrading.tsx` | Add state, highlight effect, import new components, restructure LIVE_VIEW to 3-column grid |

---

## Task 1 — TradeToast Component

**Files:**
- Create: `src/components/AutoTrading/TradeToast.tsx`

`OrderLifecycleEvent` is exported from `useAutotradingWS.ts`:
```typescript
interface OrderLifecycleEvent {
  orderId: number; status: string; symbol: string;
  side: string; qty: number; price: number; timestamp: string;
}
```

- [ ] **Step 1: Create `TradeToast.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import type { OrderLifecycleEvent } from './useAutotradingWS';

interface ToastItem {
  id: string;
  type: 'buy' | 'sell' | 'cancel';
  symbol: string;
  qty: number;
  price: number;
}

interface Props {
  events: OrderLifecycleEvent[];
}

function ProgressBar({ type }: { type: ToastItem['type'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.width = '100%';
    requestAnimationFrame(() => {
      el.style.transition = 'width 4s linear';
      el.style.width = '0%';
    });
  }, []);
  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-(--color-term-border) rounded-b overflow-hidden">
      <div
        ref={ref}
        className={cn(
          'h-full rounded-full',
          type === 'buy' ? 'bg-emerald-400' :
          type === 'sell' ? 'bg-rose-400' : 'bg-amber-400'
        )}
      />
    </div>
  );
}

export function TradeToast({ events }: Props) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef(new Set<number>());

  useEffect(() => {
    events.forEach(e => {
      if (seenRef.current.has(e.orderId)) return;
      if (e.status !== 'FILLED') return;
      seenRef.current.add(e.orderId);

      const item: ToastItem = {
        id: `${e.orderId}-${e.timestamp}`,
        type: e.side === 'BUY' ? 'buy' : e.side === 'SELL' ? 'sell' : 'cancel',
        symbol: e.symbol,
        qty: e.qty,
        price: e.price,
      };

      setToasts(prev => [...prev.slice(-2), item]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== item.id));
      }, 4200);
    });
  }, [events]);

  if (toasts.length === 0) return null;

  const label = (t: ToastItem) =>
    t.type === 'buy' ? '✓ 已買入' : t.type === 'sell' ? '✓ 已賣出' : '✗ 已取消';

  return (
    <div className="fixed z-50 flex flex-col gap-2 bottom-4 right-4 md:bottom-4 md:right-4 top-4 sm:top-auto">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'relative w-72 rounded border-l-4 bg-(--color-term-bg) p-3 shadow-xl text-sm',
            'animate-in slide-in-from-right-4 fade-in duration-200',
            toast.type === 'buy' && 'border-emerald-400',
            toast.type === 'sell' && 'border-rose-400',
            toast.type === 'cancel' && 'border-amber-400',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className={cn(
                'font-mono font-semibold text-[13px]',
                toast.type === 'buy' && 'text-emerald-400',
                toast.type === 'sell' && 'text-rose-400',
                toast.type === 'cancel' && 'text-amber-400',
              )}>
                {label(toast)}  {toast.symbol}
              </div>
              <div className="text-[11px] text-(--color-term-muted) mt-0.5 font-mono">
                {toast.qty.toLocaleString()} 股 @ ${toast.price.toLocaleString()}
                {' · '}總額 ${(toast.qty * toast.price).toLocaleString()}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-(--color-term-muted) hover:text-(--color-term-fg) shrink-0 leading-none"
            >
              ×
            </button>
          </div>
          <ProgressBar type={toast.type} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AutoTrading/TradeToast.tsx
git commit -m "feat(autotrading): add TradeToast component for FILLED order notifications"
```

---

## Task 2 — AssetMonitor Highlight Prop

**Files:**
- Modify: `src/components/AutoTrading/AssetMonitor.tsx:17-21` (Props interface)
- Modify: `src/components/AutoTrading/AssetMonitor.tsx:25` (destructure)
- Modify: `src/components/AutoTrading/AssetMonitor.tsx:135` (tr className)

- [ ] **Step 1: Add `highlightedSymbols` to Props interface**

In `AssetMonitor.tsx`, change lines 17–21:
```typescript
// Before
interface Props {
  positions: Position[];
  symbols: string[];
  decisionFusions: Record<string, DecisionFusion>;
}

// After
interface Props {
  positions: Position[];
  symbols: string[];
  decisionFusions: Record<string, DecisionFusion>;
  highlightedSymbols?: Set<string>;
}
```

- [ ] **Step 2: Destructure the new prop**

Change line 25:
```typescript
// Before
export function AssetMonitor({ positions, symbols, decisionFusions }: Props) {

// After
export function AssetMonitor({ positions, symbols, decisionFusions, highlightedSymbols }: Props) {
```

- [ ] **Step 3: Apply highlight class to the `<tr>`**

Change line 135:
```tsx
// Before
<tr key={symbol} className="border-b border-(--color-term-border)/50 hover:bg-white/3 transition-colors">

// After
<tr
  key={symbol}
  className={cn(
    'border-b border-(--color-term-border)/50 transition-colors duration-700',
    highlightedSymbols?.has(symbol) ? 'bg-cyan-500/15' : 'hover:bg-white/3'
  )}
>
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AutoTrading/AssetMonitor.tsx
git commit -m "feat(autotrading): add highlightedSymbols prop to AssetMonitor for flash animation"
```

---

## Task 3 — DecisionLog Highlight Prop

**Files:**
- Modify: `src/components/AutoTrading/DecisionLog.tsx:12-21` (Props interface)
- Modify: `src/components/AutoTrading/DecisionLog.tsx:32` (destructure)
- Modify: `src/components/AutoTrading/DecisionLog.tsx:66` (div className in logs.map)

- [ ] **Step 1: Add `highlightedSymbols` to Props interface**

In `DecisionLog.tsx`, change lines 12–21:
```typescript
// Before
interface Props {
  logs: AgentLog[];
  autoScroll?: boolean;
  quantumEnabled?: boolean;
  connectionInfo?: {
    connected: boolean;
    transport: 'none' | 'ably' | 'ws' | 'polling';
    reason?: string;
  };
}

// After
interface Props {
  logs: AgentLog[];
  autoScroll?: boolean;
  quantumEnabled?: boolean;
  highlightedSymbols?: Set<string>;
  connectionInfo?: {
    connected: boolean;
    transport: 'none' | 'ably' | 'ws' | 'polling';
    reason?: string;
  };
}
```

- [ ] **Step 2: Destructure the new prop**

Change line 32:
```typescript
// Before
export function DecisionLog({ logs, autoScroll = true, quantumEnabled = false, connectionInfo }: Props) {

// After
export function DecisionLog({ logs, autoScroll = true, quantumEnabled = false, highlightedSymbols, connectionInfo }: Props) {
```

- [ ] **Step 3: Apply highlight class in the logs.map row**

Change line 66:
```tsx
// Before
<div className="flex gap-2 leading-relaxed hover:bg-white/3 px-1 rounded">

// After
<div className={cn(
  'flex gap-2 leading-relaxed px-1 rounded transition-colors duration-700',
  log.symbol && highlightedSymbols?.has(log.symbol) ? 'bg-cyan-500/15' : 'hover:bg-white/3'
)}>
```

- [ ] **Step 4: Verify TypeScript**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AutoTrading/DecisionLog.tsx
git commit -m "feat(autotrading): add highlightedSymbols prop to DecisionLog for flash animation"
```

---

## Task 4 — DecisionAnalysisPanel Component

**Files:**
- Create: `src/components/AutoTrading/DecisionAnalysisPanel.tsx`

Key types used (already in `types.ts`):
- `DecisionFusion`: `{ symbol, action: 'BUY'|'SELL'|'HOLD', confidence, score, reason, components: DecisionFusionComponent[], timestamp }`
- `DecisionFusionComponent`: `{ source: 'ai'|'technical'|'macro'|'quantum'|'forecast', action: 'BUY'|'SELL'|'HOLD', confidence, weightedScore }`
- `AgentLog`: `{ id, timestamp, symbol, action?: 'BUY'|'SELL'|'HOLD'|'SYSTEM', confidence?, signalAttribution? }`
- `SignalComponentInfo`: `{ source, action, score, weight }` — used in `log.signalAttribution.components`

- [ ] **Step 1: Create `DecisionAnalysisPanel.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import type { AgentLog, DecisionFusion } from './types';

interface Props {
  decisionFusions: Record<string, DecisionFusion>;
  logs: AgentLog[];
  symbols: string[];
}

const SOURCE_LABELS: Record<string, string> = {
  technical: 'Technical',
  ai: 'AI / LLM',
  quantum: 'Quantum',
  macro: 'Macro',
  forecast: 'TimesFM',
};

export function DecisionAnalysisPanel({ decisionFusions, logs, symbols }: Props) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbols[0] ?? '');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Keep selectedSymbol valid when symbols list changes
  useEffect(() => {
    if (symbols.length > 0 && !symbols.includes(selectedSymbol)) {
      setSelectedSymbol(symbols[0]);
    }
  }, [symbols, selectedSymbol]);

  const fusion = decisionFusions[selectedSymbol];

  // Aggregate weighted scores by action for the gauge
  const { buyPct, sellPct, holdPct } = useMemo(() => {
    if (!fusion?.components?.length) return { buyPct: 0, sellPct: 0, holdPct: 0 };
    const total = fusion.components.reduce((sum, c) => sum + Math.abs(c.weightedScore), 0) || 1;
    const sum = (action: string) =>
      fusion.components
        .filter(c => c.action === action)
        .reduce((s, c) => s + c.weightedScore, 0);
    return {
      buyPct: Math.round((sum('BUY') / total) * 100),
      sellPct: Math.round((sum('SELL') / total) * 100),
      holdPct: Math.round((sum('HOLD') / total) * 100),
    };
  }, [fusion]);

  // Last 20 decision logs (with action) for selected symbol, newest first
  const decisionLogs = useMemo(() =>
    logs
      .filter(l => l.symbol === selectedSymbol && l.action && l.action !== 'SYSTEM')
      .slice(-20)
      .reverse(),
    [logs, selectedSymbol]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--color-term-border) shrink-0">
        <span className="text-[10px] font-bold tracking-[0.2em] text-violet-400 uppercase">
          Decision Analysis
        </span>
        {fusion && (
          <span className="text-[9px] text-(--color-term-muted) font-mono">
            {new Date(fusion.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
          </span>
        )}
      </div>

      {/* Symbol selector (only shown when > 1 symbol) */}
      {symbols.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-(--color-term-border) overflow-x-auto shrink-0">
          {symbols.map(sym => (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border shrink-0 transition-colors',
                selectedSymbol === sym
                  ? 'text-(--color-term-accent) border-(--color-term-accent) bg-(--color-term-accent)/10'
                  : 'text-(--color-term-muted) border-(--color-term-border) hover:text-(--color-term-text)'
              )}
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-4">

        {/* ── Section 1: Confidence Gauge ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Confidence
          </span>
          {!fusion ? (
            <div className="text-[11px] text-(--color-term-muted) py-2">等待訊號...</div>
          ) : (
            <div className="space-y-2">
              {/* Final verdict badge */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-(--color-term-muted)">最終裁定</span>
                <span className={cn(
                  'text-[11px] font-bold px-2 py-0.5 rounded font-mono',
                  fusion.action === 'BUY'  ? 'text-emerald-400 bg-emerald-500/10' :
                  fusion.action === 'SELL' ? 'text-rose-400 bg-rose-500/10' :
                                             'text-zinc-400 bg-zinc-800'
                )}>
                  {fusion.action}  {fusion.confidence}%
                </span>
              </div>
              {/* Progress bars */}
              {([
                { label: 'BUY',  pct: buyPct,  color: 'bg-emerald-400', text: 'text-emerald-400' },
                { label: 'HOLD', pct: holdPct, color: 'bg-zinc-400',    text: 'text-zinc-400'    },
                { label: 'SELL', pct: sellPct, color: 'bg-rose-400',    text: 'text-rose-400'    },
              ] as const).map(({ label, pct, color, text }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={cn('text-[10px] w-8 shrink-0 font-mono', text)}>{label}</span>
                  <div className="flex-1 h-1.5 bg-(--color-term-border) rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', color)}
                      style={{ width: `${Math.max(0, pct)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-(--color-term-muted) w-8 text-right shrink-0">
                    {pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Signal Breakdown ── */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Signal Breakdown
          </span>
          {!fusion?.components?.length ? (
            <div className="text-[11px] text-(--color-term-muted)">無訊號資料</div>
          ) : (
            <div className="space-y-1">
              {fusion.components.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between px-2 py-1.5 rounded border text-[10px] font-mono',
                    c.action === 'BUY'  ? 'border-emerald-500/30 bg-emerald-500/5' :
                    c.action === 'SELL' ? 'border-rose-500/30 bg-rose-500/5' :
                                         'border-(--color-term-border)'
                  )}
                >
                  <span className={cn(
                    'uppercase tracking-wider',
                    c.action === 'BUY'  ? 'text-emerald-400' :
                    c.action === 'SELL' ? 'text-rose-400' :
                                         'text-(--color-term-muted)'
                  )}>
                    {SOURCE_LABELS[c.source] ?? c.source}
                  </span>
                  <span className={cn(
                    c.action === 'BUY'  ? 'text-emerald-300' :
                    c.action === 'SELL' ? 'text-rose-300' :
                                         'text-(--color-term-muted)'
                  )}>
                    {c.action === 'BUY' ? '↑ BUY' : c.action === 'SELL' ? '↓ SELL' : '— HOLD'}
                  </span>
                  <span className="text-(--color-term-muted)">
                    w: {c.weightedScore.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 3: Decision Timeline (hidden on mobile) ── */}
        <div className="space-y-2 hidden md:block">
          <span className="text-[9px] font-bold tracking-widest text-(--color-term-muted) uppercase">
            Decision Timeline
          </span>
          {decisionLogs.length === 0 ? (
            <div className="text-[11px] text-(--color-term-muted)">尚無決策記錄</div>
          ) : (
            <div className="space-y-0.5">
              {decisionLogs.map(log => (
                <div key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(prev => prev === log.id ? null : log.id)}
                    className="w-full flex items-center gap-1.5 text-[10px] py-1 px-1.5 rounded hover:bg-white/5 text-left font-mono"
                  >
                    <span className="text-(--color-term-muted) shrink-0 w-16">
                      {new Date(log.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
                    </span>
                    <span className="text-(--color-term-accent) shrink-0">{log.symbol}</span>
                    <span className={cn(
                      'shrink-0 font-bold w-8',
                      log.action === 'BUY'  ? 'text-emerald-400' :
                      log.action === 'SELL' ? 'text-rose-400' :
                                             'text-zinc-400'
                    )}>
                      {log.action}
                    </span>
                    {/* 5-dot confidence indicator */}
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            i < Math.round((log.confidence ?? 0) / 20)
                              ? log.action === 'BUY'  ? 'bg-emerald-400'
                                : log.action === 'SELL' ? 'bg-rose-400'
                                : 'bg-zinc-400'
                              : 'bg-(--color-term-border)'
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-(--color-term-muted) w-8 text-right shrink-0">
                      {log.confidence ?? 0}%
                    </span>
                  </button>
                  {/* Expanded signal attribution */}
                  {expandedLogId === log.id && log.signalAttribution?.components && (
                    <div className="ml-3 pl-2 border-l border-(--color-term-border) space-y-0.5 pb-1">
                      {log.signalAttribution.components.map((c, i) => (
                        <div key={i} className="flex justify-between text-[9px] text-(--color-term-muted) font-mono">
                          <span>{SOURCE_LABELS[c.source] ?? c.source}</span>
                          <span>
                            {c.action}  score: {c.score.toFixed(2)}  w: {c.weight.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AutoTrading/DecisionAnalysisPanel.tsx
git commit -m "feat(autotrading): add DecisionAnalysisPanel with confidence gauge, signal breakdown, and decision timeline"
```

---

## Task 5 — AutoTrading.tsx Integration

**Files:**
- Modify: `src/terminal/pages/AutoTrading.tsx`

This task:
1. Adds imports for the two new components
2. Adds `cn` import (needed for mobile tabs)
3. Adds state: `liveViewMobileTab`, `highlightedSymbols`
4. Adds refs: `highlightTimersRef`, `prevOrderEventsLenRef`
5. Adds `useEffect` to detect new FILLED events → populate `highlightedSymbols`
6. Adds cleanup `useEffect` for timers on unmount
7. Mounts `<TradeToast>` in JSX
8. Replaces the LIVE_VIEW block (lines 149–176) with three-column grid + mobile tabs
9. Passes `highlightedSymbols` prop to `<AssetMonitor>` and `<DecisionLog>`

- [ ] **Step 1: Add imports**

Add after the existing import block (after line 21 `import '../../components/AutoTrading/autotrading.css';`):

```typescript
import { cn } from '../../lib/utils';
import { DecisionAnalysisPanel } from '../../components/AutoTrading/DecisionAnalysisPanel';
import { TradeToast } from '../../components/AutoTrading/TradeToast';
```

- [ ] **Step 2: Add state and refs inside `AutoTradingPage`**

Add after the existing state declarations (after line 46 `const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(false);`):

```typescript
const [liveViewMobileTab, setLiveViewMobileTab] = React.useState<'decision' | 'log' | 'position'>('log');
const [highlightedSymbols, setHighlightedSymbols] = React.useState<Set<string>>(new Set());
const highlightTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
const prevOrderEventsLenRef = React.useRef(0);
```

- [ ] **Step 3: Add highlight detection effect**

Add after the existing `useEffect` for `sidebarWidth` (after line 55):

```typescript
// Detect new FILLED orders → flash matching rows for 1.5 s
React.useEffect(() => {
  const events = ws.orderEvents;
  if (events.length <= prevOrderEventsLenRef.current) {
    prevOrderEventsLenRef.current = events.length;
    return;
  }
  const newEvents = events.slice(prevOrderEventsLenRef.current);
  prevOrderEventsLenRef.current = events.length;

  const filledSymbols = newEvents
    .filter(e => e.status === 'FILLED')
    .map(e => e.symbol);

  if (filledSymbols.length === 0) return;

  setHighlightedSymbols(prev => new Set([...prev, ...filledSymbols]));

  filledSymbols.forEach(sym => {
    const existing = highlightTimersRef.current.get(sym);
    if (existing) clearTimeout(existing);
    highlightTimersRef.current.set(sym, setTimeout(() => {
      setHighlightedSymbols(prev => { const n = new Set(prev); n.delete(sym); return n; });
      highlightTimersRef.current.delete(sym);
    }, 1500));
  });
}, [ws.orderEvents]);

// Clear all highlight timers on unmount
React.useEffect(() => {
  const timers = highlightTimersRef.current;
  return () => { timers.forEach(clearTimeout); };
}, []);
```

- [ ] **Step 4: Mount `<TradeToast>` in JSX**

In the return statement, add `<TradeToast events={ws.orderEvents} />` as the first child inside the outermost `<div className="autotrading-pane ...">` (line 88):

```tsx
// Before (line 88-89):
return (
  <div className="autotrading-pane h-full flex flex-col gap-2 overflow-hidden">
    {/* Top Bar */}

// After:
return (
  <div className="autotrading-pane h-full flex flex-col gap-2 overflow-hidden">
    <TradeToast events={ws.orderEvents} />
    {/* Top Bar */}
```

- [ ] **Step 5: Replace the LIVE_VIEW block**

Replace lines 149–176 (the entire `{mainTab === 'LIVE_VIEW' && ( ... )}` block):

```tsx
{mainTab === 'LIVE_VIEW' && (
  <>
    {/* Mobile tab switcher — hidden on md+ */}
    <div className="flex md:hidden shrink-0 border-b border-(--color-term-border)">
      {(['decision', 'log', 'position'] as const).map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => setLiveViewMobileTab(tab)}
          className={cn(
            'flex-1 py-2 text-[10px] uppercase tracking-widest transition-colors',
            liveViewMobileTab === tab
              ? 'text-(--color-term-accent) border-b border-(--color-term-accent)'
              : 'text-(--color-term-muted) hover:text-(--color-term-text)'
          )}
        >
          {tab === 'decision' ? '決策' : tab === 'log' ? '日誌' : '部位'}
        </button>
      ))}
    </div>

    {/* Three-column grid (desktop) / single column (mobile) */}
    <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr_280px] gap-2">

      {/* Left: Decision Analysis Panel */}
      <div className={cn(
        'border border-(--color-term-border) rounded-sm overflow-hidden flex flex-col',
        liveViewMobileTab !== 'decision' ? 'hidden md:flex' : 'flex'
      )}>
        <DecisionAnalysisPanel
          decisionFusions={ws.decisionFusions}
          logs={ws.logs}
          symbols={currentSymbols}
        />
      </div>

      {/* Center: Decision Log */}
      <div className={cn(
        'border border-(--color-term-border) rounded-sm min-h-0 overflow-hidden',
        liveViewMobileTab !== 'log' ? 'hidden md:block' : 'block'
      )}>
        <DecisionLog
          logs={ws.logs}
          highlightedSymbols={highlightedSymbols}
          connectionInfo={{
            connected: ws.connected,
            transport: ws.transport,
            reason: ws.offlineReason,
          }}
        />
      </div>

      {/* Right: Asset Monitor + Order Book */}
      <div className={cn(
        'flex flex-col gap-2',
        liveViewMobileTab !== 'position' ? 'hidden md:flex' : 'flex'
      )}>
        <div className="flex-1 border border-(--color-term-border) rounded-sm overflow-hidden">
          <AssetMonitor
            positions={ws.positions}
            symbols={currentSymbols}
            decisionFusions={ws.decisionFusions}
            highlightedSymbols={highlightedSymbols}
          />
        </div>
        <div className="h-52 shrink-0 border border-(--color-term-border) rounded-sm overflow-hidden">
          <OrderBookPanel events={ws.orderEvents} />
        </div>
      </div>

    </div>
  </>
)}
```

- [ ] **Step 6: Verify TypeScript**

```powershell
npm run lint
```

Expected: no errors.

- [ ] **Step 7: Start dev server and visually verify**

```powershell
npm run dev
```

Open `http://localhost:5173` (or Electron). Navigate to Auto-Trading → LIVE_VIEW.

**Desktop checklist:**
- [ ] Three columns visible: Decision Analysis (left ~320px) | DecisionLog (center flex) | AssetMonitor+OrderBook (right ~280px)
- [ ] Decision Analysis shows "等待訊號..." when no WS data; populates with gauge + cards when agent runs
- [ ] Symbol selector tabs appear when `currentSymbols.length > 1`
- [ ] Decision Timeline hidden until `md` breakpoint

**Mobile checklist (resize browser to < 768px):**
- [ ] Three tab buttons appear: 決策 | 日誌 | 部位
- [ ] Default selected tab is 日誌 (showing DecisionLog)
- [ ] Switching tabs shows correct panel; no horizontal scroll

**Toast checklist (requires a FILLED order event):**
- [ ] Toast appears bottom-right on desktop, top-right on mobile
- [ ] Progress bar shrinks over 4 seconds then toast disappears
- [ ] × button dismisses immediately

**Highlight checklist:**
- [ ] On FILLED event: matching AssetMonitor row flashes cyan tint
- [ ] Matching DecisionLog rows flash cyan tint
- [ ] Both fade back to normal after ~1.5 s

- [ ] **Step 8: Commit**

```bash
git add src/terminal/pages/AutoTrading.tsx
git commit -m "feat(autotrading): restructure LIVE_VIEW to 3-column grid with DecisionAnalysisPanel, TradeToast, and highlight animations"
```

---

## Self-Review

**Spec coverage check:**
- ✅ LIVE_VIEW three-column grid → Task 5 Step 5
- ✅ Left column: DecisionAnalysisPanel → Task 4
- ✅ Center: DecisionLog (preserved) → Task 5 Step 5
- ✅ Right: AssetMonitor + OrderBook (preserved) → Task 5 Step 5
- ✅ Confidence gauge → Task 4 (`buyPct/sellPct/holdPct` bars)
- ✅ Signal breakdown cards → Task 4 (components loop)
- ✅ Decision timeline (expandable) → Task 4 (`decisionLogs` list)
- ✅ Toast + progress bar → Task 1
- ✅ AssetMonitor highlight → Task 2
- ✅ DecisionLog highlight → Task 3
- ✅ Mobile tab switcher → Task 5 Step 5
- ✅ Timeline hidden on mobile → Task 4 (`hidden md:block`)
- ✅ Toast top on mobile, bottom-right on desktop → Task 1 (fixed positioning)
- ✅ No backend changes → confirmed, all data from `useAutotradingWS`

**Type consistency check:**
- `highlightedSymbols: Set<string>` — defined in Task 5, consumed in Task 2 and 3 ✅
- `OrderLifecycleEvent` — imported from `./useAutotradingWS` in Task 1 ✅
- `DecisionFusion`, `AgentLog` — imported from `./types` in Task 4 ✅
- `DecisionFusionComponent.weightedScore` — correct field name (not `score`) ✅
- `SignalComponentInfo.score` and `.weight` — correct for expanded timeline ✅
