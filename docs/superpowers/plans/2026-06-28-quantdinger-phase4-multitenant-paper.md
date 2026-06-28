# QuantDinger Phase 4 Multi-Tenant Paper Operation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Replace the process-level auto-trading singleton with isolated user sessions,
persist paper broker/risk state, route every order through the shared safety pipeline,
and expose strategy versions, provenance, sessions, and audit in the Hermes React UI.

**Architecture:** `TradingSessionRegistry` owns one `AutonomousTradingSession` per user.
Each session owns config, scheduler, locks, risk manager, paper broker, executor,
positions, peaks, loss streak, logs, and event sink. Existing REST contracts become
user-scoped façades over the registry; active `running` and `cooldown` sessions restore
independently. Live adapters remain unavailable.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres, React, React Router, i18next,
Vitest, existing broker/risk/order services; no new dependencies.

---

## File Structure

- Create `server/services/tradingSessionState.ts` — isolated mutable session state and
  snapshot contracts.
- Create `server/services/AutonomousTradingSession.ts` — per-user scheduler and trading
  engine.
- Create `server/services/TradingSessionRegistry.ts` — lifecycle, lookup, recovery, and
  event routing.
- Modify `server/services/autonomousAgent.ts` — retain a thin compatibility façade only.
- Modify `server/services/RiskManager.ts` — export constructible isolated manager.
- Modify `server/services/brokers/SimulatedAdapter.ts` — snapshot/restore paper state.
- Modify `server/repositories/autotradingConfigRepo.ts` and DB schema/migration — persist
  broker and risk/session snapshots.
- Modify `server.ts`, commander/optimizer services, and realtime setup — require user
  context for every auto-trading call.
- Create UI components for strategy versions, provider provenance, agent tokens/audit,
  and per-user paper session status.

### Task 1: Lock Session Isolation Contracts

**Files:**
- Create `server/services/tradingSessionState.ts`
- Create `server/services/__tests__/tradingSessionState.test.ts`
- Modify `server/services/RiskManager.ts`
- Modify `server/services/brokers/SimulatedAdapter.ts`

- [ ] Write failing tests that two states have independent config, status, `posTrack`,
  `peakPriceTrack`, loss streak, logs, risk kill switch, broker cash, positions, orders,
  and scheduler locks.
- [ ] Add snapshot round-trip tests:

```ts
const restored = TradingSessionState.restore(snapshot, dependencies);
expect(restored.userId).toBe('user-a');
expect(restored.posTrack.get('AAPL')).toEqual({ qty: 10, avgCost: 100 });
expect(await restored.paperBroker.getPositions()).toEqual(expectedPositions);
```

- [ ] Run `npx vitest run server/services/__tests__/tradingSessionState.test.ts` and
  verify RED.
- [ ] Export the `RiskManager` class and add `SimulatedAdapter.exportState()` /
  `restoreState()` with validated finite non-negative cash, PnL, positions, and order
  counter.
- [ ] Implement `TradingSessionState` with no module-level mutable trading state.
- [ ] Run GREEN, lint, and commit.

### Task 2: Extract One Autonomous Trading Session

**Files:**
- Create `server/services/AutonomousTradingSession.ts`
- Create `server/services/__tests__/autonomousTradingSession.test.ts`
- Modify `server/services/autonomousAgent.ts`
- Modify `server/services/orderExecutor.ts`

- [ ] Write failing fake-clock/fake-broker tests for start, stop, cooldown, tick lock,
  proactive stop-loss before ordinary signals, persistence, log scoping, and empty-broker
  reconciliation protection.
- [ ] Move `agentTick`, cooldown, account broadcast, position/peak updates, executor,
  kill switch, broker selection, and state synchronization behind instance methods.
- [ ] Keep analysis helpers stateless or pass the session config explicitly.
- [ ] Make real mode downgrade to the per-session simulated adapter; do not construct
  KGI/Sinopac/Yuanta sessions.
- [ ] Replace exported singleton functions with a temporary façade accepting `userId`
  and delegating to a registry supplied in Task 3.
- [ ] Run focused behavior/regression tests and commit.

### Task 3: Add Registry and Multi-Session Recovery

**Files:**
- Create `server/services/TradingSessionRegistry.ts`
- Create `server/services/__tests__/tradingSessionRegistry.test.ts`
- Modify `server/repositories/autotradingConfigRepo.ts`
- Modify `src/db/schema.ts`
- Create `src/db/migrations/0004_trading_session_snapshots.sql`

- [ ] Write failing tests proving two users can run/tick/stop concurrently without
  changing each other's state or paper positions.
- [ ] Test `running` and `cooldown` recovery for every active config, including restored
  average cost, loss streak, risk daily state, paper cash/positions, and cooldown timer.
- [ ] Add a `broker_state` JSONB snapshot and explicit snapshot validation. Preserve the
  existing query:

```sql
WHERE status IN ('running', 'cooldown')
```

- [ ] Implement registry `get`, `require`, `start`, `stop`, `update`, `kill`,
  `deactivateKill`, `resetBreaker`, `restoreAll`, and `disposeAll`.
- [ ] Run GREEN, lint, migration checks, and commit.

### Task 4: Make REST and Realtime User-Scoped

**Files:**
- Modify `server.ts`
- Create `server/api/__tests__/autotradingSessions.test.ts`
- Create `server/services/sessionEventHub.ts`
- Modify `server/services/commanderService.ts`
- Modify `server/services/optimizerService.ts`

- [ ] Write HTTP tests with two authenticated user IDs for status/config/start/stop/logs,
  broker status, balance, positions, kill switch, and reset. Assert no response contains
  the other user's symbols, logs, positions, or risk state.
- [ ] Replace every no-argument singleton call with `registry.require(req.userId)`.
- [ ] Require user context in commander and optimizer calls.
- [ ] Route WebSocket/Ably events through `SessionEventHub.publish(userId, event)` and
  authorize subscriptions with the HttpOnly-cookie user identity.
- [ ] Ensure Telegram kill-switch callbacks resolve an explicit configured user; reject
  ambiguous global liquidation.
- [ ] Run HTTP, realtime, lint, and regression tests; commit.

### Task 5: Prove Shared Risk and Order Parity

**Files:**
- Create `server/services/__tests__/paperBacktestParity.test.ts`
- Modify `server/services/orderExecutor.ts`
- Modify `server/services/backtestEngine.ts` only where parity tests expose a real
  assumption mismatch.

- [ ] Replay identical bars and execution assumptions through deterministic backtest and
  paper session paths.
- [ ] Assert normalized intents, next-bar timing, fees, slippage, sizing, stops, and fills
  match within documented rounding.
- [ ] Add hostile tests for duplicate order IDs, stale data, sector/position caps,
  daily-loss kill switch, broker `UNKNOWN`, and empty reconciliation.
- [ ] Verify every intent carries user, strategy version, decision/evidence, and data
  provenance before `OrderExecutor`.
- [ ] Commit only the smallest parity fixes proven by failing tests.

### Task 6: Connect Agent `T` Scope to Paper Sessions

**Files:**
- Modify `server/ai/defaultTools.ts`
- Modify `server/api/agentV1.ts`
- Extend Agent Gateway tests

- [ ] Add failing tests for `start_paper_strategy`, `stop_paper_strategy`,
  `inspect_paper_session`, and paper order inspection.
- [ ] Require `T`, idempotency, strategy ownership/validation, allowlists, and
  `paperOnly=true`.
- [ ] Route tools through `TradingSessionRegistry`; do not call legacy singleton exports.
- [ ] Audit session/run IDs and all denials.
- [ ] Run gateway/session tests and commit.

### Task 7: Add Strategy Version and Provenance UI

**Files:**
- Create `src/components/AutoTrading/StrategyVersionWorkspace.tsx`
- Create `src/components/AutoTrading/ProviderProvenancePanel.tsx`
- Modify `src/terminal/pages/AutoTrading.tsx`
- Modify `public/locales/zh/translation.json`
- Modify `public/locales/en/translation.json`
- Create component tests

- [ ] Write failing component tests for runtime selection, immutable version creation,
  validation diagnostics, async backtest launch/status, result inspection, and provider
  evidence.
- [ ] Use existing authenticated strategy/data-source APIs; never store tokens in
  `localStorage`.
- [ ] Display source hash, runtime, provenance, validation state, engine version,
  data/provider timestamps, delayed/cache state, assumptions, and warnings.
- [ ] Add responsive terminal styling and translations; preserve existing navigation.
- [ ] Run component tests, lint, and frontend smoke verification; commit.

### Task 8: Add Session, Agent Token, and Audit UI

**Files:**
- Create `src/components/AutoTrading/PaperSessionPanel.tsx`
- Create `src/components/Settings/AgentTokenPanel.tsx`
- Create `src/components/Settings/AgentAuditPanel.tsx`
- Modify `src/terminal/pages/Settings.tsx`
- Extend locales and component tests

- [ ] Test per-user status/config/log rendering and explicit simulated broker badge.
- [ ] Test token plaintext appears only in the create confirmation and is absent after
  dismissal/reload.
- [ ] Test revoke, scopes, expiry, allowlists, audit status/risk/tool versions, and
  redacted metadata.
- [ ] Keep live controls disabled with a risk notice.
- [ ] Run tests, lint, and browser verification; commit.

### Task 9: Document and Verify Phase 4

**Files:**
- Create `docs/trading-sessions.md`
- Modify `docs/agent-gateway.md`
- Update `graphify-out/*`

- [ ] Document session ownership, recovery, paper snapshots, realtime authorization,
  kill-switch scope, broker restrictions, parity assumptions, and operator recovery.
- [ ] Run all Vitest/Python tests, lint, production build, and migration verification.
- [ ] Run a two-user end-to-end paper flow:

```text
create version -> validate -> backtest -> start paper session -> observe decision/fill/
audit -> stop, while a second user runs independently
```

- [ ] Run `python -m graphify update .`, restore generated artifacts, review the complete
  diff, and commit.

## Plan Self-Review

- Every mutable singleton listed in `autonomousAgent.ts` moves into a user-owned state or
  a process-safe immutable cache.
- `RiskManager`, `SimulatedAdapter`, `OrderExecutor`, timers, locks, positions, logs, and
  event sinks are per session.
- `running` and `cooldown` recovery remains mandatory.
- Empty broker positions cannot erase protected local cost/position state.
- Stop-loss remains before ordinary execution; hedge direction behavior is unchanged.
- KGI, Sinopac, and Yuanta remain disabled for real execution.
- Browser auth, external agent auth, and realtime subscriptions remain separate and
  user-scoped.
