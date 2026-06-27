# QuantDinger Phase 2 Data Provider Registry Implementation Plan

> **Execution:** Use `superpowers:executing-plans` and `superpowers:test-driven-development` task-by-task.

**Goal:** Route Hermes market, technical, news, fundamentals, institutional, congressional, and macro retrieval through one provenance-rich provider registry with cache, rate limiting, circuit breaking, fallback, and health diagnostics.

**Architecture:** Provider adapters remain thin wrappers around existing Hermes source clients. A framework-free registry owns provider selection and resilience; callers receive normalized envelopes instead of source-specific raw values. Express configures the registry once after `NativeYahooApi` is available, while tests inject deterministic fake providers.

**Tech Stack:** TypeScript 5.8, Zod 4, Express, Vitest, existing Yahoo/TWSE/TradingView/SEC/FRED services; no new dependencies.

---

## File Structure

- Create `server/data/types.ts` — request, result, provenance, freshness, and provider contracts.
- Create `server/data/cache.ts` — bounded TTL cache with operation-aware keys.
- Create `server/data/rateLimiter.ts` — per-provider fixed-window limiter.
- Create `server/data/circuitBreaker.ts` — closed/open/half-open state machine.
- Create `server/data/registry.ts` — provider selection, fallback, diagnostics, and envelope assembly.
- Create `server/data/providers.ts` — adapters for existing source clients.
- Create `server/data/configure.ts` — one-time default registry configuration and accessor.
- Create `server/api/dataSources.ts` — authenticated provider-health endpoint.
- Create tests under `server/data/__tests__/` and `server/api/__tests__/`.
- Modify `server/services/marketData.ts` and `server.ts` to consume the registry.
- Create `docs/data-providers.md`.

### Task 1: Define Normalized Data Contracts

**Files:**
- Create `server/data/types.ts`
- Create `server/data/__tests__/registry.test.ts`

- [ ] Write failing tests that require symbol normalization, bounded time-series limits,
  required retrieval timestamps, explicit delayed-data flags, and provider metadata.
- [ ] Run `npx vitest run server/data/__tests__/registry.test.ts` and verify RED.
- [ ] Implement Zod schemas and inferred types for:
  - operations: `quote`, `bars`, `technical`, `news`, `fundamentals`,
    `institutional`, `congress`, `macroSeries`, `economicCalendar`, `search`;
  - markets: `tw_stock`, `us_stock`, `crypto`, `forex`, `macro`, `global`;
  - normalized requests and provider payloads;
  - provenance, attempts, envelopes, capabilities, policies, and health.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit the contracts and tests.

### Task 2: Implement Resilience Primitives

**Files:**
- Create `server/data/cache.ts`
- Create `server/data/rateLimiter.ts`
- Create `server/data/circuitBreaker.ts`
- Create `server/data/__tests__/resilience.test.ts`

- [ ] Write failing deterministic tests using injected clocks for TTL expiry, bounded
  cache eviction, fixed-window rate reset, breaker open state, cooldown, and half-open
  recovery.
- [ ] Run `npx vitest run server/data/__tests__/resilience.test.ts` and verify RED.
- [ ] Implement the smallest framework-free primitives that satisfy the tests.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit the resilience primitives.

### Task 3: Build Provider Selection and Fallback

**Files:**
- Create `server/data/registry.ts`
- Extend `server/data/__tests__/registry.test.ts`

- [ ] Write failing tests for priority ordering, capability/market filtering, cache hits,
  rate-limited and open-breaker skips, timeout fallback, stale payload rejection,
  provenance, attempt history, and aggregate failure.
- [ ] Run the focused registry test and verify RED.
- [ ] Implement `DataProviderRegistry` with injected clock, provider-local policies,
  normalized cache keys, freshness validation, and sanitized diagnostics.
- [ ] Ensure missing or stale upstream data is never fabricated.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit the registry.

### Task 4: Adapt Existing Data Sources

**Files:**
- Create `server/data/providers.ts`
- Create `server/data/__tests__/providers.test.ts`

- [ ] Write failing adapter tests with injected fake clients and source-specific malformed
  or empty response failures.
- [ ] Run `npx vitest run server/data/__tests__/providers.test.ts` and verify RED.
- [ ] Implement thin adapters:
  - Yahoo: quote, bars, news, search;
  - TWSE/TPEX: realtime quote;
  - TradingView: technical and news;
  - SEC EDGAR: fundamentals;
  - smart-money: institutional activity;
  - Capitol Trades: congressional trades;
  - WantGoo/Cnyes: Taiwan news;
  - FRED: macro series.
- [ ] Declare exact capabilities, markets, priority, timeout, freshness, cache TTL,
  rate-limit, breaker policy, and adapter version.
- [ ] Run the focused test and verify GREEN.
- [ ] Commit the adapters.

### Task 5: Configure the Registry and Migrate Trading Callers

**Files:**
- Create `server/data/configure.ts`
- Modify `server/services/marketData.ts`
- Modify `server.ts`
- Extend `server/data/__tests__/providers.test.ts`

- [ ] Add failing tests proving the accessor rejects use before configuration,
  configuration is idempotent for the same instance, and production strategy bars use
  provenance-rich registry data.
- [ ] Implement one-time `configureDataRegistry(dependencies)` and `getDataRegistry()`.
- [ ] Configure the registry after `NativeYahooApi` is available and before
  `configureStrategyRuntimeService`.
- [ ] Route `getRecentNews`, `getDailyContext`, and the strategy runtime production
  `loadBars` through the registry while preserving public caller shapes.
- [ ] Preserve proactive stop-loss, signal fusion, and broker safety behavior unchanged.
- [ ] Run `npx vitest run server/data server/services/__tests__/backtestRegression.test.ts`.
- [ ] Commit caller migration.

### Task 6: Add Provider Health Diagnostics

**Files:**
- Create `server/api/dataSources.ts`
- Create `server/api/__tests__/dataSources.test.ts`
- Modify `server.ts`

- [ ] Write a failing HTTP/router test for authenticated
  `GET /api/data-sources/health`.
- [ ] Require provider ID/version, capabilities, breaker state, remaining rate budget,
  last success/failure timestamps, and cache metrics.
- [ ] Verify credentials, credential-bearing URLs, upstream bodies, raw error messages,
  and stacks are absent.
- [ ] Implement and mount the route using the existing auth middleware.
- [ ] Run the focused API test and `npm run lint`.
- [ ] Commit diagnostics.

### Task 7: Document and Verify Phase 2

**Files:**
- Create `docs/data-providers.md`
- Update `graphify-out/*` using Graphify

- [ ] Document source coverage, delay classification, credential requirements, fallback
  order, cache TTL, rate limits, health fields, stale-data rejection, and the rule that
  missing data is never fabricated.
- [ ] Run `npx vitest run`.
- [ ] Run `.\.venv\Scripts\python.exe -m unittest discover -s server/python/tests -v`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`; if the unchanged `react-is` peer gap remains, report it as an
  existing blocker without claiming build success.
- [ ] Run `python -m graphify update .` and confirm registry/provider nodes appear.
- [ ] Restore only generated artifacts changed by verification, review the diff, and
  commit documentation plus any final fixes.

## Plan Self-Review

- Spec coverage includes normalized provenance, freshness, cache, rate limiting,
  circuit breaking, fallback, current source adapters, trading/backtest consumers,
  diagnostics, documentation, and graph update.
- New commercial subscriptions and CCXT adoption remain outside this phase.
- The registry never converts absence, malformed responses, timeouts, or stale values
  into invented market data.
- All tasks have an explicit RED/GREEN or verification checkpoint and no unresolved
  implementation markers.
