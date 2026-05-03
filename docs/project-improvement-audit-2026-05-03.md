# Project Improvement Audit (2026-05-03)

## Scope
- Hard-coded values
- Fake/placeholder interactions
- Feature gaps worth adding

## Fixed in this pass

1. BacktestPanel fake action -> real copy action
- File: `src/components/BacktestPanel.tsx`
- Before: `VIEW SOURCE` button only wrote generated code to DevTools (`console.log`).
- After: button now copies generated strategy code to clipboard and gives UI state feedback (`COPIED` / `COPY FAILED`) plus log entry.

2. Broker "Coming Soon" options no longer act clickable
- File: `src/components/AutoTrading/BrokerSettings.tsx`
- Before: unavailable broker cards could still be clicked, creating an impression that setup is usable.
- After: stub broker cards are disabled and visually marked `cursor-not-allowed`.

3. Removed hard-coded ECPay secrets from source code
- File: `server/api/ecpay.ts`
- Before: source included default Merchant/Hash keys and localhost callback base URL fallback.
- After: credentials are env-only, missing config now fails explicitly, and callback base URL resolves from request host/proxy when env is absent.

## Hard-coded findings (remaining)

### P0 Security / Deployment Risk
1. Multiple service URLs and provider endpoints duplicated across layers
- `server/api/agent.ts` (OpenRouter endpoint)
- `server/utils/llmPipeline.ts` (OpenRouter endpoint)
- `src/services/aiService.ts` (OpenRouter endpoint + models endpoint)
- Risk: drift between frontend/server settings, harder key rotation/provider switch.
- Suggestion: centralize endpoint + model source in one shared config module.

### P1 Product Behavior Coupling
2. Backtest default trading assumptions are hard-coded in UI flow
- `src/components/BacktestPanel.tsx` (`initialCapital`, `commissionRate`, `minimumCommission`, `slippageRate`, `taxRate`)
- Risk: results differ by market/account but cannot be tuned per user profile.

3. Plan pricing is coupled to fixed multiplier expressions
- `server/api/ecpay.ts` (`priceNtd: 199 * 32`, etc.)
- Risk: exchange-rate/business rule change requires code deploy.
- Suggestion: persist plan price table in DB/admin config.

4. Local bridge defaults are hard-coded
- `server/services/brokers/SinopacAdapter.ts` (`http://127.0.0.1:18080`)
- `server/services/brokers/KGIAdapter.ts` (`http://127.0.0.1:18080`)
- Risk: production/local mixed behavior; implicit infra assumptions.

5. UI default symbols are hard-coded in several places
- `src/terminal/hooks/useDashboardData.ts`
- `src/terminal/pages/Screener.tsx`
- `server/services/autotradingDefaults.ts`
- Risk: inconsistent onboarding/watchlist between modules.

## Fake/placeholder interaction findings (remaining)

1. Silent mock fallback can make users think data is live
- `src/terminal/hooks/useDashboardData.ts`
- Behavior: catches failures and silently keeps UI populated.
- Risk: “looks working” but actually stale/non-live data.
- Suggestion: add mandatory `Mock Data` badge + timestamp + retry CTA.

2. Broker coverage and labels mismatch
- `src/components/AutoTrading/types.ts`: `BROKER_OPTIONS` availability mix does not fully match adapter readiness and naming keys in `BrokerSettings`.
- Risk: capability confusion.

## Feature gaps to add (recommended)

### Priority A (user trust)
1. Live-data integrity indicator
- Add global status chip: `LIVE / DELAYED / MOCK` with last refresh time and source.

2. Config health dashboard
- Add `/api/system/health-config` endpoint to validate required env keys (OpenRouter, ECPay, bridge URLs).

### Priority B (trading execution)
3. Broker capability matrix and gating
- Expose per-broker capabilities from backend (`canConnect`, `canPlaceOrder`, `requiresBridge`) and drive UI from real status.

4. Yuanta integration path completion
- `server/services/brokers/YuantaAdapter.ts` is still stub-style behavior; either hide from roadmap-facing UI or implement bridge parity with Sinopac/KGI.

### Priority C (maintainability)
5. Shared runtime config package
- Consolidate all provider URLs, default symbols, and tuning constants into one typed config layer used by both frontend/server.

6. Payment plan management
- Move plan definitions from code to DB/admin panel and support effective-date/versioned pricing.
