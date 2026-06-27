# Hermes Strategy Runtime

Hermes supports immutable Python strategy versions and deterministic server-side
backtests through the existing science service. This capability adapts backend concepts
from QuantDinger under Apache License 2.0; it does not copy the separately licensed
QuantDinger Vue frontend.

## Runtime boundaries

Express is the authenticated control plane. It owns users, strategy versions, jobs,
market-data snapshots, hashes, and results. Python receives an immutable request and
returns a normalized result. Python never receives browser cookies, broker credentials,
or permission to place orders.

Two strategy forms are supported:

- `indicator`: implements `run(data, params)` and returns aligned two-way or four-way
  boolean signals.
- `script`: implements `on_init(ctx)` and `on_bar(ctx, bar)` and emits orders through
  the restricted context.

All strategies are drafts until validation succeeds. Backtests require a validated,
immutable strategy version.

## Indicator strategies

Two-way signals:

```python
def run(data, params):
    length = len(data["close"])
    buy = [False] * length
    sell = [False] * length
    if length >= 2 and data["close"][-1] > data["close"][-2]:
        buy[-1] = True
    return {"buy": buy, "sell": sell}
```

Four-way signals:

```python
def run(data, params):
    length = len(data["close"])
    return {
        "open_long": [False] * length,
        "close_long": [False] * length,
        "open_short": [False] * length,
        "close_short": [False] * length,
    }
```

Every signal array must have exactly the same length as the supplied OHLCV data. A
strategy must return exactly one signal form.

## Script strategies

```python
def on_init(ctx):
    ctx.state["bars"] = 0


def on_bar(ctx, bar):
    ctx.state["bars"] += 1
    if ctx.position_side is None and ctx.state["bars"] == 20:
        ctx.buy()
    elif ctx.position_side == "long" and bar.close < bar.open:
        ctx.close_position()
```

Available context:

- `ctx.state`
- `ctx.params`
- `ctx.cash`
- `ctx.equity`
- `ctx.position_side`
- `ctx.quantity`
- `ctx.buy(pct=None)`
- `ctx.sell(pct=None)`
- `ctx.close_position()`

Available bar fields:

- `timestamp`
- `open`
- `high`
- `low`
- `close`
- `volume`

## Validation and isolation

The validator rejects:

- imports;
- filesystem, process, socket, environment, dynamic-evaluation, and reflection names;
- hidden/dunder attribute access;
- async, class, lambda, unbounded `while`, exception, context-manager, and generator
  syntax;
- negative `shift`, which introduces look-ahead bias;
- missing runtime entry points;
- malformed or misaligned signal arrays.

The runtime exposes an allowlist of simple builtins plus `math` and `statistics`. Adding
capabilities requires a failing security/contract test first.

## Backtest semantics

- A signal observed on a bar executes at the next bar's open.
- Buy and sell fills apply directional slippage.
- Entry and exit fees are each charged once.
- `tradeDirection` is `long`, `short`, or `both`.
- `exitOwner=engine` enables fixed stop-loss, take-profit, and trailing-stop exits.
- `exitOwner=strategy` disables those engine exits to prevent duplicate ownership.
- Engine exits run before queued strategy commands.
- If stop-loss and profit-taking prices are both touched in one bar, the conservative
  stop-loss path wins.
- Open positions are closed at the last available close with `end_of_data`.
- No LLM call occurs during historical execution.

Results include immutable strategy/run identity, engine version, equity and drawdown,
trades, fees, metrics, assumptions, and warnings.

## REST workflow

All browser routes use the existing HttpOnly-cookie authentication.

Create a version:

```http
POST /api/strategies/7/versions
Content-Type: application/json

{
  "runtime": "indicator",
  "source": "def run(data, params):\n    n = len(data['close'])\n    return {'buy': [False] * n, 'sell': [False] * n}",
  "defaultParameters": {},
  "executionPolicy": {
    "initialCapital": 1000000,
    "feeRate": 0.001,
    "slippageBps": 5,
    "entryPct": 0.1,
    "tradeDirection": "long",
    "exitOwner": "engine",
    "stopLossPct": 0.05
  }
}
```

Validate and submit:

```http
POST /api/strategy-versions/{versionId}/validate

POST /api/strategy-versions/{versionId}/backtests
Content-Type: application/json

{
  "symbol": "2330.TW",
  "period1": "2025-01-01",
  "period2": "2026-01-01",
  "parameters": {},
  "execution": {
    "initialCapital": 1000000
  }
}
```

The submit route returns HTTP `202` with a queued job. Poll:

```http
GET /api/backtest-jobs/{jobId}
```

The AI `execute_backtest` tool calls this same service and requires
`strategyVersionId`; it no longer returns a placeholder result.

## Running the Python service

Windows isolated environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn science_skills_service:app --app-dir server/python --host 127.0.0.1 --port 8788
```

Express uses `SCIENCE_SERVICE_URL`, defaulting to `http://127.0.0.1:8788`.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s server/python/tests -v
npx vitest run
npm run lint
npm run build
```

The database migration is `src/db/migrations/0002_strategy_runtime.sql`. Apply it to the
target Postgres database before using version or job routes.

## Safety status

This phase enables deterministic backtesting only. It does not enable real-money
strategy execution or replace the simulated broker. Broker adapters remain subject to
independent sandbox verification and operator acknowledgment.
