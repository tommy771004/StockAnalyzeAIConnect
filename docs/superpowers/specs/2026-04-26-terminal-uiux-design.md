# Terminal UI/UX Design Improvement Spec
**Date:** 2026-04-26  
**Scope:** `src/terminal/` + `src/components/AutoTrading/`  
**Goal:** Strengthen consistency and fix rough edges while preserving the existing dark terminal aesthetic.

---

## Problem Statement

Four concrete pain points across the codebase:

- **C) Button styles** — primary/secondary/ghost buttons styled ad-hoc per component; no shared primitive
- **D) Loading states** — spinners and skeleton loaders missing or inconsistently applied
- **E) Hover/focus states** — interactive elements lack clear hover feedback or accessible focus rings
- **F) Color usage** — cyan, violet, amber, emerald used without a defined role hierarchy

---

## Approach: Shared UI Primitives

Create canonical `Button`, `Skeleton`, and `Spinner` primitives. Establish color-role CSS tokens and a `focus-ring` utility. Sweep all components to use these — fix inconsistencies at the source rather than by convention.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/ui/Button.tsx` | Canonical button with 4 variants, 3 sizes, built-in loading/disabled/focus states |
| `src/components/ui/Skeleton.tsx` | Animated placeholder for async content |
| `src/components/ui/Spinner.tsx` | Inline (`sm`) and panel-level (`md`) spinner |
| `src/components/ui/index.ts` | Barrel export |

### Modified Files

| File | Change |
|------|--------|
| `src/index.css` | Add color-role CSS custom properties + `.focus-ring` utility class |
| `src/terminal/ui/Panel.tsx` | Adopt Button primitive; add Skeleton for loading state |
| `src/terminal/shell/TopNav.tsx` | Nav items get hover/focus states via `focus-ring` |
| `src/terminal/shell/Sidebar.tsx` | Nav items get hover/focus states via `focus-ring` |
| `src/terminal/pages/Dashboard.tsx` + other pages | Replace inline button markup with `<Button>` |
| `src/components/AutoTrading/*.tsx` | Replace inline buttons; add `<Skeleton>` to async sections |

---

## Color Hierarchy Rules

All color usage must follow this role table. No exceptions, no mixing roles.

| Role | Token | Tailwind color | Usage |
|------|-------|---------------|-------|
| Primary action | `--color-action` | `cyan-400/500` | Main CTAs, active nav, key data values |
| Constructive | `--color-constructive` | `emerald-400/500` | Positive PnL, buy signals, success states |
| Destructive | `--color-destructive` | `rose-400/500` | Negative PnL, sell signals, error states |
| Warning / Quantum | `--color-caution` | `amber-400/500` | Quantum gates, fallback banners, caution |
| Feature / AI | `--color-feature` | `violet-400/500` | Optimizer and AI/LLM features only |
| Muted text | `--color-term-muted` | (existing) | Labels, secondary info, captions |
| Body text | `--color-term-text` | (existing) | Primary readable text |
| Border | `--color-term-border` | (existing) | All panel/card borders |

CSS additions to `src/index.css`:

```css
@layer base {
  :root {
    --color-action: theme(colors.cyan.400);
    --color-constructive: theme(colors.emerald.400);
    --color-destructive: theme(colors.rose.400);
    --color-caution: theme(colors.amber.400);
    --color-feature: theme(colors.violet.400);
  }
}

@layer utilities {
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2
           focus-visible:ring-cyan-500 focus-visible:ring-offset-1
           focus-visible:ring-offset-black;
  }
}
```

---

## Button Primitive

**Variants:**

| Variant | Background | Text | Hover |
|---------|-----------|------|-------|
| `primary` | `bg-cyan-600` | `text-white` | `hover:bg-cyan-500` |
| `constructive` | `bg-emerald-600` | `text-white` | `hover:bg-emerald-500` |
| `ghost` | `bg-white/5` | `text-white/50` | `hover:bg-white/10 hover:text-white/70` |
| `danger` | `bg-rose-600/20` | `text-rose-400` | `hover:bg-rose-600/30` |

**Sizes:**

| Size | Padding | Font |
|------|---------|------|
| `sm` | `py-1 px-3` | `text-[9px]` |
| `md` (default) | `py-1.5 px-4` | `text-[10px]` |
| `lg` | `py-2 px-5` | `text-[11px]` |

**States:**
- `disabled` → `opacity-40 cursor-not-allowed` (pointer-events-none)
- `loading` → left slot shows `<Spinner size="sm" />`, button is disabled
- `focus-visible` → `.focus-ring` class (ring-2 ring-cyan-500)
- All transitions: `motion-safe:transition-[background-color,color,opacity]`

**API:**
```tsx
<Button variant="primary" size="md" loading={false} disabled={false}>
  Label
</Button>
```

---

## Skeleton Primitive

Rectangular animated placeholder. Size controlled entirely by `className`.

```tsx
<Skeleton className="h-4 w-32" />          // inline text
<Skeleton className="h-20 w-full" />        // card/chart
<Skeleton className="h-3 w-3 rounded-full" /> // avatar/icon
```

Style: `animate-pulse bg-white/5 rounded` — matches terminal surface color.

---

## Spinner Primitive

Two sizes, no variant complexity.

| Size | Dimensions | Use |
|------|-----------|-----|
| `sm` | 12×12px | Inside Button loading state |
| `md` | 20×20px | Panel-level loading center |

Style: `animate-spin border-2 border-white/20 border-t-white/80 rounded-full` — consistent with existing `RefreshCw animate-spin` pattern.

---

## Hover/Focus State Rules

| Element | Hover | Focus-visible |
|---------|-------|--------------|
| Button (all variants) | color shift per variant | `.focus-ring` |
| Nav item / tab | `text-white bg-white/5` | `.focus-ring` |
| Icon button | `text-white bg-white/10` | `.focus-ring` |
| Panel collapse toggle | `bg-white/5` | `.focus-ring` |
| Input / select | `border-white/20` | `border-cyan-500 ring-1 ring-cyan-500/30` |

All interactive elements receive `focus-ring` class — no per-component duplication.

---

## Sweep Order

To minimize regressions, apply changes in this order:

1. `src/index.css` — CSS tokens + `.focus-ring` utility
2. `src/components/ui/` — Button, Skeleton, Spinner, index.ts
3. `src/terminal/ui/Panel.tsx`
4. `src/terminal/shell/TopNav.tsx`, `Sidebar.tsx`
5. `src/components/AutoTrading/` — all files (replace inline buttons, add Skeleton)
6. `src/terminal/pages/` — remaining page-level components

---

## Out of Scope

- No new pages or routes
- No logic, API, or state changes
- No changes to `src/terminal/shell/TickerTape.tsx` (animation logic, unrelated to visual polish)
- No changes to `--color-term-*` existing variable names (backwards compatible)
- No changes outside `src/terminal/` and `src/components/AutoTrading/`
