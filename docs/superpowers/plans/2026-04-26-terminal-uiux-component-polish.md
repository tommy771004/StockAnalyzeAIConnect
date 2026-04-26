# Terminal UI/UX Component Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish shared UI primitives (Button, Skeleton, Spinner) and a color-role token system, then sweep all components in `src/terminal/` and `src/components/AutoTrading/` to eliminate button-style inconsistencies, add missing loading states, and standardize hover/focus behavior.

**Architecture:** A `src/components/ui/` primitive layer is created first; existing components are updated to consume it. CSS color-role tokens and a `.focus-ring` utility are added to `src/styles.css` so all interactive elements share a single focus appearance without per-component duplication.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4 (`@import "tailwindcss"`), Vitest, `cn()` from `src/lib/utils.ts`, `motion/react` (existing), lucide-react icons

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/styles.css` | Modify | Color-role CSS tokens + `.focus-ring` utility |
| `src/components/ui/Button.tsx` | Create | Canonical button primitive |
| `src/components/ui/Skeleton.tsx` | Create | Animated placeholder for async content |
| `src/components/ui/Spinner.tsx` | Create | Inline/panel-level spinner |
| `src/components/ui/index.ts` | Create | Barrel export |
| `src/components/ui/__tests__/Button.test.ts` | Create | Pure logic tests for buildButtonClasses |
| `src/terminal/ui/Panel.tsx` | Modify | Add focus-ring to collapse toggle |
| `src/terminal/shell/TopNav.tsx` | Modify | Add focus-ring + consistent hover to nav tabs and icon buttons |
| `src/terminal/shell/Sidebar.tsx` | Modify | Add focus-ring + consistent hover to nav items and close button |
| `src/components/AutoTrading/OptimizationPanel.tsx` | Modify | Replace inline buttons with Button primitive |
| `src/components/AutoTrading/PerformanceDashboard.tsx` | Modify | Add focus-ring to period toggles; add Skeleton for loading state |
| `src/components/AutoTrading/AgentControlPanel.tsx` | Modify | Replace start/stop/tab buttons with Button primitive or focus-ring |
| `src/components/AutoTrading/BacktestPanel.tsx` | Modify | Replace inline buttons with Button primitive |
| `src/components/AutoTrading/StrategyTab.tsx` | Modify | Replace inline buttons; add Skeleton for loading |
| `src/components/AutoTrading/MonitorTab.tsx` | Modify | Replace inline buttons; add focus-ring |
| `src/components/AutoTrading/RiskControlPanel.tsx` | Modify | Replace inline buttons |
| `src/components/AutoTrading/BrokerSettings.tsx` | Modify | Replace inline buttons |
| `src/terminal/pages/Dashboard.tsx` | Modify | Replace any inline buttons; add Skeleton to async cards |

---

## Task 1: CSS Foundation

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Open and read the current end of src/styles.css**

Run: `tail -20 src/styles.css`
Confirm the file ends after the view-transitions section (no existing `.focus-ring`).

- [ ] **Step 2: Append color-role tokens and focus-ring utility**

Add to the end of `src/styles.css`:

```css
/* ── Color Role Tokens ─────────────────────────────────────────────── */
/* These tokens map semantic roles to palette colors.                  */
/* Use these instead of raw Tailwind color classes for role-based UI.  */
@layer base {
  :root {
    --color-action:       theme(colors.cyan.400);
    --color-constructive: theme(colors.emerald.400);
    --color-destructive:  theme(colors.rose.400);
    --color-caution:      theme(colors.amber.400);
    --color-feature:      theme(colors.violet.400);
  }
}

/* ── Focus Ring Utility ────────────────────────────────────────────── */
/* Single consistent focus indicator for all interactive elements.     */
@layer utilities {
  .focus-ring:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgb(6 182 212), 0 0 0 3px #000;
  }
}
```

- [ ] **Step 3: Verify TypeScript and Tailwind build**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat(ui): add color-role tokens and focus-ring utility to styles.css"
```

---

## Task 2: Button Primitive

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/__tests__/Button.test.ts`

- [ ] **Step 1: Create src/components/ui/Button.tsx**

```tsx
import React from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'constructive' | 'ghost' | 'danger' | 'feature';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:      'bg-cyan-600 text-white hover:bg-cyan-500',
  constructive: 'bg-emerald-600 text-white hover:bg-emerald-500',
  ghost:        'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70',
  danger:       'bg-rose-600/20 text-rose-400 hover:bg-rose-600/30',
  feature:      'bg-violet-600 text-white hover:bg-violet-500',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'py-1 px-3 text-[9px]',
  md: 'py-1.5 px-4 text-[10px]',
  lg: 'py-2 px-5 text-[11px]',
};

export function buildButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  loading: boolean,
  disabled: boolean,
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded font-bold uppercase tracking-wider',
    'motion-safe:transition-[background-color,color,opacity]',
    'focus-ring',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    (loading || disabled) && 'opacity-40 cursor-not-allowed pointer-events-none',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={loading || !!disabled}
      aria-busy={loading || undefined}
      className={buildButtonClasses(variant, size, loading, !!disabled, className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create src/components/ui/__tests__/Button.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { buildButtonClasses } from '../Button';

describe('buildButtonClasses', () => {
  it('includes primary background for primary variant', () => {
    const cls = buildButtonClasses('primary', 'md', false, false);
    expect(cls).toContain('bg-cyan-600');
    expect(cls).toContain('text-white');
  });

  it('includes constructive background for constructive variant', () => {
    const cls = buildButtonClasses('constructive', 'md', false, false);
    expect(cls).toContain('bg-emerald-600');
  });

  it('includes ghost classes for ghost variant', () => {
    const cls = buildButtonClasses('ghost', 'md', false, false);
    expect(cls).toContain('bg-white/5');
    expect(cls).toContain('text-white/50');
  });

  it('includes danger classes for danger variant', () => {
    const cls = buildButtonClasses('danger', 'md', false, false);
    expect(cls).toContain('text-rose-400');
  });

  it('includes feature (violet) classes for feature variant', () => {
    const cls = buildButtonClasses('feature', 'md', false, false);
    expect(cls).toContain('bg-violet-600');
  });

  it('adds disabled classes when loading=true', () => {
    const cls = buildButtonClasses('primary', 'md', true, false);
    expect(cls).toContain('opacity-40');
    expect(cls).toContain('cursor-not-allowed');
  });

  it('adds disabled classes when disabled=true', () => {
    const cls = buildButtonClasses('primary', 'md', false, true);
    expect(cls).toContain('opacity-40');
  });

  it('applies sm size classes', () => {
    const cls = buildButtonClasses('primary', 'sm', false, false);
    expect(cls).toContain('text-[9px]');
    expect(cls).toContain('py-1');
    expect(cls).toContain('px-3');
  });

  it('applies lg size classes', () => {
    const cls = buildButtonClasses('primary', 'lg', false, false);
    expect(cls).toContain('text-[11px]');
    expect(cls).toContain('py-2');
    expect(cls).toContain('px-5');
  });

  it('merges custom className', () => {
    const cls = buildButtonClasses('primary', 'md', false, false, 'w-full');
    expect(cls).toContain('w-full');
  });

  it('includes focus-ring class', () => {
    const cls = buildButtonClasses('primary', 'md', false, false);
    expect(cls).toContain('focus-ring');
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL (Spinner not yet created)**

Run: `npx vitest run src/components/ui/__tests__/Button.test.ts`
Expected: compile error because `Spinner` is not found yet. This is correct — proceed to Task 3.

- [ ] **Step 4: Commit the unfinished Button (will be completed after Spinner exists)**

```bash
git add src/components/ui/Button.tsx src/components/ui/__tests__/Button.test.ts
git commit -m "feat(ui): add Button primitive and tests (depends on Spinner)"
```

---

## Task 3: Skeleton, Spinner, Barrel Export

**Files:**
- Create: `src/components/ui/Spinner.tsx`
- Create: `src/components/ui/Skeleton.tsx`
- Create: `src/components/ui/index.ts`

- [ ] **Step 1: Create src/components/ui/Spinner.tsx**

```tsx
import React from 'react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block rounded-full border-2 border-white/20 border-t-cyan-500 animate-spin',
        size === 'sm' ? 'h-3 w-3' : 'h-5 w-5',
        className,
      )}
    />
  );
}
```

- [ ] **Step 2: Create src/components/ui/Skeleton.tsx**

```tsx
import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn('animate-pulse rounded bg-white/5', className)}
    />
  );
}
```

- [ ] **Step 3: Create src/components/ui/index.ts**

```ts
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Skeleton } from './Skeleton';
export { Spinner } from './Spinner';
```

- [ ] **Step 4: Run Button tests — all should pass now**

Run: `npx vitest run src/components/ui/__tests__/Button.test.ts`
Expected: 11 tests PASS

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Spinner.tsx src/components/ui/Skeleton.tsx src/components/ui/index.ts
git commit -m "feat(ui): add Spinner, Skeleton primitives and barrel export"
```

---

## Task 4: Panel.tsx — Focus Ring on Collapse Toggle

**Files:**
- Modify: `src/terminal/ui/Panel.tsx`

The collapse toggle `<button>` at line 88–96 is missing keyboard focus feedback. Add `focus-ring` class.

- [ ] **Step 1: Read the current file**

Read `src/terminal/ui/Panel.tsx` lines 85–100.

- [ ] **Step 2: Add focus-ring to the collapse toggle button**

Find this block (around line 88):
```tsx
<button
  type="button"
  onClick={() => setIsOpen((v) => !v)}
  aria-expanded={isOpen}
  className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors hover:text-(--color-term-text)"
>
```

Replace with:
```tsx
<button
  type="button"
  onClick={() => setIsOpen((v) => !v)}
  aria-expanded={isOpen}
  className="flex min-w-0 flex-1 items-center gap-2 text-left motion-safe:transition-colors hover:text-(--color-term-text) focus-ring rounded"
>
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/terminal/ui/Panel.tsx
git commit -m "fix(ui): add focus-ring to Panel collapse toggle"
```

---

## Task 5: Sidebar.tsx + TopNav.tsx — Hover and Focus States

**Files:**
- Modify: `src/terminal/shell/Sidebar.tsx`
- Modify: `src/terminal/shell/TopNav.tsx`

- [ ] **Step 1: Read both files completely**

Read `src/terminal/shell/Sidebar.tsx` and `src/terminal/shell/TopNav.tsx` in full.

- [ ] **Step 2: Update Sidebar.tsx**

In Sidebar.tsx, find the close button (around line 61–68):
```tsx
<button
  type="button"
  onClick={onClose}
  className="text-(--color-term-muted) hover:text-(--color-term-text)"
  aria-label={t('common.close')}
>
```
Replace className with:
```tsx
className="text-(--color-term-muted) hover:text-(--color-term-text) hover:bg-white/5 p-1 rounded motion-safe:transition-colors focus-ring"
```

Find the nav item buttons (the `NAV_ITEMS.map` block). Each item button currently looks like:
```tsx
<button
  key={it.id}
  type="button"
  title={label}
  ...
  className={cn(
    ...
  )}
>
```
Add `focus-ring` to the `cn(...)` call inside the className. The exact className depends on the full file — add `'focus-ring'` as one of the `cn()` arguments.

- [ ] **Step 3: Read the rest of Sidebar.tsx nav button className**

Read `src/terminal/shell/Sidebar.tsx` lines 75–120 to see the full nav button className and the bottom section buttons (logout, help). Add `focus-ring` to each interactive element's className.

- [ ] **Step 4: Update TopNav.tsx tab buttons**

Read `src/terminal/shell/TopNav.tsx` lines 80–180 to locate the tab buttons and icon buttons (language toggle, AI toggle, Bell, CircleUserRound, Menu).

For each tab button find the className and add `focus-ring`. The tab buttons use `aria-current` or a conditional `isActive` class. Example pattern — add `focus-ring` to the `cn()` call:

```tsx
className={cn(
  'focus-ring',     // ← add this
  'px-3 py-1 text-[10px] font-bold tracking-widest uppercase ...',
  isActive ? 'border-b-2 border-cyan-400 text-white' : 'text-(--color-term-muted) hover:text-white',
)}
```

For icon buttons (Bell, CircleUserRound, language toggle, AI toggle, Menu), wrap each with:
```tsx
className={cn('p-1.5 rounded text-(--color-term-muted) hover:text-white hover:bg-white/5 motion-safe:transition-colors focus-ring', existingClasses)}
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/terminal/shell/Sidebar.tsx src/terminal/shell/TopNav.tsx
git commit -m "fix(shell): add consistent hover/focus states to Sidebar and TopNav"
```

---

## Task 6: OptimizationPanel.tsx — Button Primitive Adoption

**Files:**
- Modify: `src/components/AutoTrading/OptimizationPanel.tsx`

Current inline buttons in this file:
1. **Scan button** — violet, `bg-violet-600 text-white hover:bg-violet-500` → `variant="feature"`
2. **Apply button** — emerald, `bg-emerald-600 hover:bg-emerald-500 text-white` → `variant="constructive"`
3. **Dismiss button** — ghost, `bg-white/5 hover:bg-white/10 text-white/50` → `variant="ghost"` with icon only

- [ ] **Step 1: Read the current file**

Read `src/components/AutoTrading/OptimizationPanel.tsx` in full.

- [ ] **Step 2: Add Button import**

At the top of the file, add:
```tsx
import { Button } from '../ui';
```

- [ ] **Step 3: Replace the Scan button (lines ~50–62)**

Find:
```tsx
<button
  onClick={startScan}
  disabled={scanning}
  aria-busy={scanning}
  className={cn(
    "px-4 py-1.5 rounded text-[10px] font-bold motion-safe:transition-[background-color,color] flex items-center gap-2",
    scanning ? "bg-white/5 text-white/20" : "bg-violet-600 text-white hover:bg-violet-500"
  )}
>
  <RefreshCw className={cn('h-3 w-3', scanning && 'animate-spin')} aria-hidden="true" />
  {scanning ? t('autotrading.optimizer.scanning', 'SCANNING...') : t('autotrading.optimizer.scanForEvolution', 'SCAN FOR EVOLUTION')}
</button>
```

Replace with:
```tsx
<Button
  variant="feature"
  size="md"
  loading={scanning}
  onClick={startScan}
  disabled={scanning}
  aria-busy={scanning}
  leftIcon={<RefreshCw className="h-3 w-3" aria-hidden="true" />}
>
  {scanning ? t('autotrading.optimizer.scanning', 'SCANNING...') : t('autotrading.optimizer.scanForEvolution', 'SCAN FOR EVOLUTION')}
</Button>
```

- [ ] **Step 4: Replace the Apply button (lines ~112–117)**

Find:
```tsx
<button
  onClick={() => onApply(proposal.betterParams)}
  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-2 rounded flex items-center justify-center gap-2"
>
  <Check className="h-3 w-3" /> {t('autotrading.optimizer.applyNow', '立即套用進化參數')}
</button>
```

Replace with:
```tsx
<Button
  variant="constructive"
  size="md"
  className="flex-1"
  onClick={() => onApply(proposal.betterParams)}
  leftIcon={<Check className="h-3 w-3" />}
>
  {t('autotrading.optimizer.applyNow', '立即套用進化參數')}
</Button>
```

- [ ] **Step 5: Replace the Dismiss button (lines ~118–124)**

Find:
```tsx
<button
  onClick={() => setProposal(null)}
  aria-label={t('common.dismiss', '關閉')}
  className="px-4 bg-white/5 hover:bg-white/10 text-white/50 text-[10px] py-2 rounded"
>
  <X className="h-3 w-3" aria-hidden="true" />
</button>
```

Replace with:
```tsx
<Button
  variant="ghost"
  size="md"
  onClick={() => setProposal(null)}
  aria-label={t('common.dismiss', '關閉')}
  className="px-4"
>
  <X className="h-3 w-3" aria-hidden="true" />
</Button>
```

- [ ] **Step 6: Remove RefreshCw from imports if no longer used directly in JSX**

Check if `RefreshCw` is still referenced outside the Button's leftIcon. If not, remove it from the lucide-react import line.

- [ ] **Step 7: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/components/AutoTrading/OptimizationPanel.tsx
git commit -m "fix(autotrading): adopt Button primitive in OptimizationPanel"
```

---

## Task 7: PerformanceDashboard.tsx — Focus Ring + Skeleton Loading

**Files:**
- Modify: `src/components/AutoTrading/PerformanceDashboard.tsx`

The period filter buttons use `aria-pressed` — they are toggle buttons, not action buttons. Do NOT replace with `<Button>`. Instead, add `focus-ring` to their className. The Refresh button is an icon button — add `focus-ring`. Add `<Skeleton>` for the loading state.

- [ ] **Step 1: Read the current file**

Read `src/components/AutoTrading/PerformanceDashboard.tsx` in full.

- [ ] **Step 2: Add Skeleton import**

```tsx
import { Skeleton } from '../ui';
```

- [ ] **Step 3: Add focus-ring to period filter buttons (lines ~83–97)**

Find the period filter buttons inside the `PERIODS.map`:
```tsx
className={cn(
  'text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest border',
  period === p.key
    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
    : 'border-(--color-term-border) text-(--color-term-muted) hover:text-white'
)}
```

Add `'focus-ring'` to the cn() call:
```tsx
className={cn(
  'focus-ring',
  'text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest border',
  period === p.key
    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-200'
    : 'border-(--color-term-border) text-(--color-term-muted) hover:text-white'
)}
```

- [ ] **Step 4: Add focus-ring to the Refresh icon button (lines ~99–105)**

Find:
```tsx
className="ml-1 p-1 rounded text-(--color-term-muted) hover:text-white"
```

Replace with:
```tsx
className="ml-1 p-1 rounded text-(--color-term-muted) hover:text-white hover:bg-white/5 motion-safe:transition-colors focus-ring"
```

- [ ] **Step 5: Replace the loading text with Skeleton rows**

Find (around line 114–116):
```tsx
{!data && !error && (
  <div className="p-6 text-center text-[10px] text-(--color-term-muted)">{loading ? t('autotrading.performance.computing', '計算中…') : t('autotrading.performance.noData', '尚無數據')}</div>
)}
```

Replace with:
```tsx
{!data && !error && (
  loading ? (
    <div className="space-y-3 p-2" role="status" aria-label={t('autotrading.performance.computing', '計算中…')}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  ) : (
    <div className="p-6 text-center text-[10px] text-(--color-term-muted)">{t('autotrading.performance.noData', '尚無數據')}</div>
  )
)}
```

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/AutoTrading/PerformanceDashboard.tsx
git commit -m "fix(autotrading): add focus-ring and Skeleton loading to PerformanceDashboard"
```

---

## Task 8: AgentControlPanel.tsx — Tab Buttons Focus Ring

**Files:**
- Modify: `src/components/AutoTrading/AgentControlPanel.tsx`

- [ ] **Step 1: Read the full file**

Read `src/components/AutoTrading/AgentControlPanel.tsx` in full (it's ~200 lines).

- [ ] **Step 2: Add focus-ring to all tab buttons**

Locate the tab navigation buttons (the `activeTab === 'xxx'` pattern). Each tab button has a className with conditional active/inactive styles. Add `'focus-ring'` as the first entry in each `cn()` call:

Pattern before:
```tsx
className={cn(
  'px-3 py-2 text-[9px] font-bold ...',
  activeTab === 'monitor' ? 'text-cyan-400 border-b-2 border-cyan-500' : 'text-(--color-term-muted) hover:text-white',
)}
```

Pattern after:
```tsx
className={cn(
  'focus-ring',
  'px-3 py-2 text-[9px] font-bold ...',
  activeTab === 'monitor' ? 'text-cyan-400 border-b-2 border-cyan-500' : 'text-(--color-term-muted) hover:text-white',
)}
```

Apply this to every tab button found in the file.

- [ ] **Step 3: Add Button import and replace Start/Stop action buttons if present**

If the file contains `<button` elements for start/stop actions (not tab navigation), import `Button` from `'../ui'` and replace them:
- Start button → `<Button variant="primary" size="md">`  
- Stop button → `<Button variant="danger" size="md">`

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/AutoTrading/AgentControlPanel.tsx
git commit -m "fix(autotrading): add focus-ring and Button primitive to AgentControlPanel"
```

---

## Task 9: Remaining AutoTrading Components — Button and Focus Ring Sweep

**Files:**
- Modify: `src/components/AutoTrading/BacktestPanel.tsx`
- Modify: `src/components/AutoTrading/StrategyTab.tsx`
- Modify: `src/components/AutoTrading/MonitorTab.tsx`
- Modify: `src/components/AutoTrading/RiskControlPanel.tsx`
- Modify: `src/components/AutoTrading/BrokerSettings.tsx`

For each file, follow this pattern:

- [ ] **Step 1: Find all inline button elements**

Run for each file:
```bash
grep -n "<button" src/components/AutoTrading/BacktestPanel.tsx
grep -n "<button" src/components/AutoTrading/StrategyTab.tsx
grep -n "<button" src/components/AutoTrading/MonitorTab.tsx
grep -n "<button" src/components/AutoTrading/RiskControlPanel.tsx
grep -n "<button" src/components/AutoTrading/BrokerSettings.tsx
```

- [ ] **Step 2: For each file — read it, apply changes, check types**

For each file that has `<button` elements:

1. Read the full file
2. Add `import { Button } from '../ui';` (or `import { Button, Skeleton } from '../ui';` if loading states are needed)
3. Map button styles to variants:
   - Green/emerald CTA → `variant="constructive"`
   - Cyan/blue CTA → `variant="primary"`
   - White/muted ghost → `variant="ghost"`
   - Red/rose destructive → `variant="danger"`
   - Violet/AI feature → `variant="feature"`
   - Tab/toggle buttons (with `aria-pressed` or active state) → keep as `<button>`, add `focus-ring` class only
4. Replace matching `<button>` elements with `<Button variant="..." size="sm|md|lg">`
5. Run `npx tsc --noEmit` after each file change

- [ ] **Step 3: Commit all five files together**

```bash
git add src/components/AutoTrading/BacktestPanel.tsx \
        src/components/AutoTrading/StrategyTab.tsx \
        src/components/AutoTrading/MonitorTab.tsx \
        src/components/AutoTrading/RiskControlPanel.tsx \
        src/components/AutoTrading/BrokerSettings.tsx
git commit -m "fix(autotrading): adopt Button primitive across remaining AutoTrading components"
```

---

## Task 10: Terminal Pages — Button and Skeleton Sweep

**Files:**
- Modify: `src/terminal/pages/Dashboard.tsx`
- Modify other page files as needed (Screener, Portfolio, Alerts, Settings, etc.)

- [ ] **Step 1: Find all inline button elements in terminal pages**

Run:
```bash
grep -rn "<button" src/terminal/pages/
```

Note which files have button elements and how many.

- [ ] **Step 2: For each file with buttons — apply same mapping as Task 9**

Read each file, import `Button` from `'../../components/ui'`, replace inline `<button>` elements using the variant mapping:
- Action/CTA buttons → `primary`, `constructive`, `ghost`, or `danger`
- Toggle/tab buttons → keep `<button>`, add `focus-ring` class

- [ ] **Step 3: Find loading states that need Skeleton**

Run:
```bash
grep -rn "loading\|isLoading\|fetching" src/terminal/pages/
```

For any component that conditionally renders `null` or a spinner text while loading, wrap the pending content in `<Skeleton>` rows matching the expected content shape. Import `Skeleton` from `'../../components/ui'`.

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/terminal/pages/
git commit -m "fix(pages): adopt Button primitive and Skeleton loading in terminal pages"
```

---

## Task 11: Final TypeScript and Test Validation

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass including the 11 Button tests

- [ ] **Step 3: Verify no raw `<button` with inline color classes remain in scope**

Run:
```bash
grep -rn "bg-emerald-600\|bg-cyan-600\|bg-violet-600\|bg-rose-600" src/components/AutoTrading/ src/terminal/
```

For each result, check if it's inside a `<button` element. If it is, it should be replaced with `<Button variant="...">`. If it's in a non-button context (div, span), it's intentional — leave it.

- [ ] **Step 4: Final commit if any cleanup was done**

```bash
git add -A
git commit -m "fix(ui): final cleanup — remove remaining raw button color classes"
```
