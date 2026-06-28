# Multi-Tenant Paper Trading Sessions

## Ownership

`TradingSessionRegistry` owns at most one `AutonomousTradingSession` per authenticated
user. A session owns all mutable trading state:

- config/status/cooldown deadline;
- scheduler, tick lock, and persistence lock;
- RiskManager and kill switch;
- SimulatedAdapter cash, positions, PnL, and order counter;
- protected average-cost and peak-price maps;
- loss streak, equity history, recent prices, and logs;
- user-scoped event publishing.

No API route selects a process-global trading user.

## Recovery

`autotrading_configs` persists full config plus broker, risk, position, peak, price,
equity, log, sentiment, and cooldown state. Startup restores every row whose status is:

```sql
status IN ('running', 'cooldown')
```

Snapshots validate owner identity, status, numeric bounds, tuple structures, broker
market types, risk values, and cooldown timestamps before becoming active. A snapshot
whose `config.userId` differs from its owner is rejected.

An empty broker-position response never erases protected local average-cost state. This
preserves proactive stops during transient provider failures.

Migration: `src/db/migrations/0004_trading_session_snapshots.sql`.

## Execution order

Each tick:

1. acquires the user-owned tick lock;
2. reconciles paper positions without trusting an anomalous empty response;
3. checks kill switch and data freshness;
4. obtains either the selected immutable indicator-version signal or the grounded
   built-in signal fusion;
5. applies fixed stop, trailing stop, take profit, and quantum forced liquidation before
   ordinary confidence gating;
6. validates portfolio, sector, daily-loss, capacity, and budget risk;
7. executes through the per-session `OrderExecutor`;
8. records fills, PnL, loss streak, provenance, audit events, and a snapshot.

Paper fills and the legacy Node backtest share directional slippage and the Taiwan fee
calculator. The restricted Python runtime uses next-bar-open semantics documented in
`docs/strategy-runtime.md`.

## Realtime

Raw WebSocket subscriptions require the HttpOnly-cookie browser identity. The
`SessionEventHub` publishes only to that user's listeners. Ably tokens grant subscribe
capability only to:

```text
autotrading:user:{userId}
```

No global trading channel is issued.

## Kill switch

Browser and Agent Gateway kill actions resolve one authenticated user. Telegram
liquidation requires explicit `TELEGRAM_AUTOTRADING_USER_ID`; without it, the webhook
rejects the ambiguous global action.

## Broker boundary

The only executable adapter is the per-session simulated broker. API requests for live
mode or KGI/Sinopac/Yuanta connection return a denial. Enabling a real adapter requires
separate sandbox evidence and operator risk acknowledgment.
