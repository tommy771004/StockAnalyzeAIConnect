# Data Provider Registry

Hermes routes trading and research data through `server/data/registry.ts`. Every successful
response includes provider identity, adapter version, retrieval time, market-data time,
delay classification, cache status, and the ordered provider attempts made for that
request.

The registry never invents a quote, bar, filing, news item, flow value, or macro
observation. Empty, malformed, timed-out, rate-limited, circuit-open, and stale responses
are failures. The registry either falls back to another declared provider or returns a
`DataResolutionError`.

## Current sources

| Provider ID | Operations | Markets | Delay policy | Credentials |
| --- | --- | --- | --- | --- |
| `twse` | quote | Taiwan stocks | Exchange timestamp; off-session values may be delayed | None |
| `yahoo` | quote, bars, news, search | Taiwan/US stocks, crypto, FX, global | Quotes treated as current; bars/news explicitly delayed | Yahoo crumb/cookie obtained at runtime |
| `tradingview` | technical, news, economic calendar | Stocks, crypto, FX, global | Technical timestamp is retrieval time; news/calendar delayed | Optional Vercel bypass secret for hosted scraper |
| `sec-edgar` | fundamentals | US stocks | Filing data delayed by reporting cycle | None; SEC requires the configured User-Agent |
| `sec-smart-money` | institutional | US stocks | Form 4 and 13F filing delay | None |
| `congress` | congressional trades | US stocks | Delayed; STOCK Act reports may arrive up to 45 days after trade | Optional `QUIVER_API_KEY`; public House dataset fallback |
| `cnyes` | news | Taiwan/global | Publication timestamp | None |
| `wantgoo` | news | Taiwan/global | Publication timestamp | None |
| `wantgoo-chip` | institutional | Taiwan stocks | Scraped or exchange daily flow; missing optional chip fields may be zero | None |
| `fred` | macro series | Macro | Observation/release date | Optional `FRED_API_KEY` |

## Selection and fallback

Providers declare exact operations and markets. Lower numeric priority runs first.
Unsupported providers are not called. For the same normalized request the registry:

1. returns a non-expired cache entry when available;
2. skips open circuits and exhausted rate budgets;
3. enforces the provider timeout;
4. validates the normalized payload and market timestamp;
5. rejects stale data using the provider/operation freshness policy;
6. records a sanitized attempt and falls back when necessary.

Historical bar freshness is measured against the requested `end` time, not wall-clock
time. This permits reproducible historical backtests while still rejecting a gap between
the requested endpoint and the last returned bar.

Current primary fallback paths include:

- Taiwan quote: TWSE/TPEX, then Yahoo.
- Technical context: TradingView, then a registry quote used by the caller.
- Symbol news: Yahoo, then TradingView. Category-only Taiwan news can use Cnyes and
  WantGoo.
- Strategy bars: Yahoo through the same registry and provenance rules.
- Congressional trades: Quiver when configured, then the public House-derived dataset
  inside the existing source client.

## Resilience defaults

Each adapter declares timeout, cache TTL, maximum data age, fixed-window request budget,
failure threshold, and circuit cooldown. Cache keys include operation, market, normalized
symbol, and sorted parameters. A successful half-open probe closes a circuit; a failed
probe opens it again.

Policies are intentionally source-specific. For example, quote freshness is measured in
minutes, while SEC/FRED/congressional data is valid over its reporting cadence. Adapter
policies live in `server/data/providers.ts`.

## Health diagnostics

Authenticated clients may call:

```text
GET /api/data-sources/health
```

The response contains provider ID/version, operations, markets, breaker state, remaining
rate budget, last success/failure timestamps, and aggregate cache metrics. The response
schema strips unknown fields and never includes API keys, credential-bearing URLs,
upstream response bodies, raw errors, or stacks.

## Trading safety

- Agent news, daily context, Taiwan institutional flow, and strategy backtest bars use the
  registry.
- Taiwan institutional flow no longer uses random synthetic numbers. Unavailable data is
  reported as unavailable.
- The proactive stop-loss, signal fusion weights, cooldown recovery, hedge direction, and
  simulated-only broker behavior are unchanged.
- Provider availability does not authorize real broker execution.
