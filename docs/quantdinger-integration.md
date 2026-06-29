# QuantDinger Integration Record

Canonical upstream: <https://github.com/brokermr810/QuantDinger>

The original request referenced `brokermr810/quantdingerand`; the maintained upstream
repository is `brokermr810/QuantDinger`. Hermes adapts backend architecture and workflow
ideas. It does not copy the separately licensed QuantDinger Vue frontend.

## License boundary

- QuantDinger backend source is Apache License 2.0.
- QuantDinger-Vue uses the separate QuantDinger Frontend Source-Available License.
- Hermes UI components in this repository are original React/Tailwind implementations.
- No broker credentials, branded frontend assets, prebuilt Vue bundle, or commercial
  frontend code was imported.

Upstream license statements:

- <https://github.com/brokermr810/QuantDinger#license-and-commercial-terms>
- <https://github.com/brokermr810/QuantDinger-Vue>

## Capability mapping

| QuantDinger concept | Hermes implementation | Key files |
| --- | --- | --- |
| Indicator and Script strategy models | Restricted immutable Python runtimes with validation and deterministic backtests | `server/python/strategy_runtime/*`, `server/services/strategyRuntimeService.ts` |
| Cross-sectional ranking strategies | Multi-symbol IndicatorStrategy scoring, aligned-universe validation, top/bottom equal-weight portfolios, and daily/weekly/monthly next-open rebalancing | `server/python/strategy_runtime/cross_sectional.py`, `server/types/strategyRuntime.ts` |
| Signal on current data | Validated indicator versions execute through `/strategy/signal` on normalized 15m OHLCV before the paper risk pipeline | `server/python/science_skills_service.py`, `server/services/quantRuntimeClient.ts` |
| Stateful ScriptStrategy paper execution | JSON runtime state and bar cursors persist per user/version/symbol; duplicate bars HOLD, long gaps reset visibly, and long-only intents enter the same risk/order pipeline | `server/python/strategy_runtime/script_runtime.py`, `server/services/tradingSessionState.ts` |
| Idea → version → validate → backtest | User-owned immutable versions, source/data hashes, queued jobs, diagnostics, and result inspection | `server/api/strategies.ts`, `src/db/migrations/0002_strategy_runtime.sql` |
| Provider registry | Attributable providers with operation/market capabilities, timeout, rate limit, circuit breaker, cache, freshness, and health | `server/data/*`, `server/api/dataSources.ts` |
| AI research and agent tools | Evidence-first tool registry, concurrent quote/news/fundamental research, collision-free structured citations, prompt versions, memory/evidence separation | `server/ai/*`, `docs/ai-evidence.md` |
| Agent Gateway / MCP control | Hashed scoped tokens, allowlists, expiry, rate limit, idempotency, append-only audit, paper-only `T` tools, and a standard JSON-RPC stdio MCP bridge | `server/api/agentV1.ts`, `server/mcp/*`, `docs/mcp.md` |
| Multi-tenant trading sessions | One isolated state, RiskManager, paper broker, scheduler, locks, positions, logs, and event channel per user | `server/services/TradingSessionRegistry.ts`, `server/services/AutonomousTradingSession.ts` |
| Paper before live | Real adapter requests are downgraded/rejected; Agent tokens are invariantly paper-only | `server/api/autotradingSessions.ts`, `server/ai/defaultTools.ts` |
| Operator workspace | React version workspace, provider provenance, session status, token lifecycle, and audit trail | `src/components/AutoTrading/*`, `src/components/Settings/*` |

## Intentional differences

- Hermes keeps its React/Electron/Express/Drizzle architecture instead of adopting
  QuantDinger's Vue/Flask/Redis stack.
- Hermes targets its existing Taiwan/US market services and fee model.
- Real KGI, Sinopac, and Yuanta adapters remain disabled until independent signed
  sandbox verification. Upstream live-broker capability is not treated as authorization
  to enable local placeholders.
- Paper execution accepts immutable indicator and long-only ScriptStrategy versions.
  Short-capable scripts remain rejected because the simulated adapter has no naked-short
  inventory model.

## Data and AI sources

Hermes provider attribution is runtime data, not prose-only documentation. Each
fact-bearing envelope records provider ID/version, retrieval time, market time, delay,
cache state, attempts, and warnings. Current adapters include Yahoo-compatible market
bars/quotes, TWSE, TradingView, SEC EDGAR, FRED, news providers, and configured
smart-money/congress sources. Availability is deployment-dependent and visible through
`GET /api/data-sources/health`.

AI model access remains configurable through the existing model pipeline. Market facts
must originate from registered evidence tools; model output alone is not a market-data
source.

## Release verification status

As of 2026-06-29:

- The production Web, Electron, and PWA build passes with the Recharts-required
  `react-is@19.2.7` peer satisfying its declared React 19 range.
- Drizzle migration metadata includes migrations `0000` through `0005`, with explicit
  statement boundaries compatible with Neon HTTP prepared statements.
- `docs/quantdinger-schema.sql` contains the complete additive integration schema for
  operator-managed application.
- Graphify was refreshed after the final code changes; the generated node and edge
  counts are recorded in `graphify-out/GRAPH_REPORT.md`.
