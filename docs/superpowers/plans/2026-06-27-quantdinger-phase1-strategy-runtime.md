# QuantDinger Phase 1 Strategy Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned strategy contracts, deterministic Python validation/execution, and persisted asynchronous backtests while preserving existing Hermes trading behavior.

**Architecture:** Express remains the authenticated control plane and Postgres remains canonical state. A new TypeScript client submits immutable strategy-validation and backtest requests to focused modules inside the existing Python FastAPI science service; Python never owns users, orders, or broker credentials.

**Tech Stack:** TypeScript 5.8, Express, Zod 4, Drizzle/Postgres, Vitest, Python 3.12, FastAPI, Pydantic 2, Polars, standard-library `ast` and `unittest`.

---

## File Structure

- Create `server/types/strategyRuntime.ts` — shared TypeScript request/result schemas.
- Create `server/services/quantRuntimeClient.ts` — bounded HTTP client for Python runtime.
- Create `server/python/strategy_runtime/contracts.py` — Pydantic runtime contracts.
- Create `server/python/strategy_runtime/validator.py` — AST and contract validation.
- Create `server/python/strategy_runtime/indicator_runtime.py` — vectorized signal execution.
- Create `server/python/strategy_runtime/script_runtime.py` — restricted event runtime.
- Create `server/python/strategy_runtime/backtest.py` — deterministic shared execution model.
- Create `server/python/strategy_runtime/__init__.py` — package exports.
- Create `server/python/tests/test_strategy_runtime.py` — Python contract and behavior tests.
- Modify `server/python/science_skills_service.py` — expose validation and backtest endpoints.
- Modify `server/utils/scienceService.ts` — export typed strategy-runtime calls.
- Modify `src/db/schema.ts` — add immutable versions and persisted backtest jobs.
- Create `src/db/migrations/0002_strategy_runtime.sql` — additive schema migration.
- Create `server/repositories/strategyRuntimeRepo.ts` — user-scoped persistence.
- Create `server/services/strategyRuntimeService.ts` — orchestration and job lifecycle.
- Create `server/api/strategies.ts` — authenticated strategy/version/backtest routes.
- Modify `server.ts` — mount the new router.
- Modify `server/api/agent.ts` — replace the placeholder backtest tool.
- Create `server/services/__tests__/strategyRuntimeContracts.test.ts` — schema tests.
- Create `server/services/__tests__/quantRuntimeClient.test.ts` — client boundary tests.
- Create `server/services/__tests__/strategyRuntimeService.test.ts` — ownership/job tests.
- Create `server/services/__tests__/backtestRegression.test.ts` — existing behavior locks.

### Task 1: Lock Existing Signal and Risk Behavior

**Files:**
- Create: `server/services/__tests__/backtestRegression.test.ts`
- Test: `server/services/backtestEngine.ts`
- Test: `server/services/signalFusionService.ts`

- [ ] **Step 1: Write failing regression tests**

```ts
import { describe, expect, it } from 'vitest';
import { runAdvancedBacktest } from '../backtestEngine.js';
import { fuseSignals } from '../signalFusionService.js';

describe('existing trading behavior', () => {
  it('ignores zero-weight observations', () => {
    const result = fuseSignals({
      symbol: '2330.TW',
      minConfidence: 0,
      quantumEnabled: true,
      observations: [
        { source: 'ai', action: 'BUY', confidence: 90, weight: 1 },
        { source: 'technical', action: 'SELL', confidence: 100, weight: 0 },
      ],
    });
    expect(result.action).toBe('BUY');
    expect(result.components).toHaveLength(1);
  });

  it('applies engine stop loss before a later recovery', async () => {
    const quotes = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      70, 75, 80].map((close, index) => ({
        close,
        volume: 1_000_000,
        date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      }));
    const result = await runAdvancedBacktest('TEST', quotes, {
      strategies: ['RSI_REVERSION'],
      params: {
        RSI_REVERSION: { period: 2, oversold: 101, overbought: 200, weight: 1 },
        AI_LLM: { weight: 0, confidenceThreshold: 0 },
        stopLossPct: 5,
        takeProfitPct: 100,
      },
      _ablation_aiEnabled: false,
      _ablation_quantumEnabled: false,
    });
    expect(result.trades.some((trade) => trade.pnlPct <= -5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the regression test**

Run: `npx vitest run server/services/__tests__/backtestRegression.test.ts`

Expected: the zero-weight test passes; adjust only the deterministic fixture if the stop-loss test does not create an entry. Do not change production behavior in this task.

- [ ] **Step 3: Commit the behavior lock**

```text
Preserve trading invariants before adding strategy runtimes

Constraint: Existing proactive stop-loss and zero-weight semantics must survive the integration
Confidence: high
Scope-risk: narrow
Tested: npx vitest run server/services/__tests__/backtestRegression.test.ts
```

### Task 2: Define Cross-Language Strategy Contracts

**Files:**
- Create: `server/types/strategyRuntime.ts`
- Create: `server/services/__tests__/strategyRuntimeContracts.test.ts`

- [ ] **Step 1: Write failing TypeScript schema tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  StrategyBacktestRequestSchema,
  StrategyValidationRequestSchema,
} from '../../types/strategyRuntime.js';

describe('strategy runtime contracts', () => {
  it('requires immutable strategy identity', () => {
    const parsed = StrategyValidationRequestSchema.safeParse({
      strategyVersionId: 'version-1',
      runtime: 'indicator',
      source: 'def run(data, params):\\n    return {\"buy\": [], \"sell\": []}',
      sourceHash: 'a'.repeat(64),
      parameters: {},
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects backtests without OHLCV bars', () => {
    const parsed = StrategyBacktestRequestSchema.safeParse({
      runId: 'run-1',
      strategyVersionId: 'version-1',
      runtime: 'script',
      source: 'def on_init(ctx): pass\\ndef on_bar(ctx, bar): pass',
      sourceHash: 'b'.repeat(64),
      parameters: {},
      bars: [],
      execution: { initialCapital: 1_000_000 },
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the schema tests and verify failure**

Run: `npx vitest run server/services/__tests__/strategyRuntimeContracts.test.ts`

Expected: FAIL because `server/types/strategyRuntime.ts` does not exist.

- [ ] **Step 3: Implement the complete TypeScript contracts**

```ts
import { z } from 'zod';

export const StrategyRuntimeSchema = z.enum(['indicator', 'script']);
export type StrategyRuntime = z.infer<typeof StrategyRuntimeSchema>;

export const BarSchema = z.object({
  timestamp: z.string().min(1),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite().positive(),
  volume: z.number().finite().nonnegative(),
});

export const ExecutionPolicySchema = z.object({
  initialCapital: z.number().positive().default(1_000_000),
  feeRate: z.number().min(0).max(0.1).default(0.001),
  slippageBps: z.number().min(0).max(1_000).default(5),
  entryPct: z.number().positive().max(1).default(0.1),
  stopLossPct: z.number().positive().max(1).optional(),
  takeProfitPct: z.number().positive().max(10).optional(),
  trailingStopPct: z.number().positive().max(1).optional(),
  tradeDirection: z.enum(['long', 'short', 'both']).default('long'),
  exitOwner: z.enum(['engine', 'strategy']).default('engine'),
});

const StrategySourceSchema = z.object({
  strategyVersionId: z.string().min(1),
  runtime: StrategyRuntimeSchema,
  source: z.string().min(1).max(100_000),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export const StrategyValidationRequestSchema = StrategySourceSchema;
export const StrategyBacktestRequestSchema = StrategySourceSchema.extend({
  runId: z.string().min(1),
  symbol: z.string().min(1),
  bars: z.array(BarSchema).min(2).max(100_000),
  execution: ExecutionPolicySchema,
});

export type StrategyValidationRequest = z.infer<typeof StrategyValidationRequestSchema>;
export type StrategyBacktestRequest = z.infer<typeof StrategyBacktestRequestSchema>;

export interface StrategyDiagnostic {
  code: string;
  message: string;
  line?: number;
  severity: 'error' | 'warning';
}

export interface StrategyValidationResult {
  valid: boolean;
  diagnostics: StrategyDiagnostic[];
  sourceHash: string;
  engineVersion: string;
}

export interface StrategyBacktestResult {
  runId: string;
  strategyVersionId: string;
  sourceHash: string;
  engineVersion: string;
  equityCurve: Array<{ timestamp: string; equity: number; drawdownPct: number }>;
  trades: Array<Record<string, unknown>>;
  metrics: Record<string, number>;
  assumptions: Record<string, unknown>;
  warnings: string[];
}
```

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run server/services/__tests__/strategyRuntimeContracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```text
Define immutable contracts for strategy execution

Constraint: TypeScript and Python must exchange bounded deterministic payloads
Confidence: high
Scope-risk: narrow
Tested: npx vitest run server/services/__tests__/strategyRuntimeContracts.test.ts
```

### Task 3: Build the Python Validator and Indicator Runtime

**Files:**
- Create: `server/python/strategy_runtime/__init__.py`
- Create: `server/python/strategy_runtime/contracts.py`
- Create: `server/python/strategy_runtime/validator.py`
- Create: `server/python/strategy_runtime/indicator_runtime.py`
- Create: `server/python/tests/test_strategy_runtime.py`

- [ ] **Step 1: Write failing standard-library Python tests**

```py
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from strategy_runtime.indicator_runtime import run_indicator
from strategy_runtime.validator import validate_source


class StrategyRuntimeTests(unittest.TestCase):
    def test_validator_rejects_forbidden_import(self):
        result = validate_source("indicator", "import os\\ndef run(data, params): return {}")
        self.assertFalse(result.valid)
        self.assertIn("forbidden_import", [item.code for item in result.diagnostics])

    def test_indicator_signals_are_aligned(self):
        source = (
            "def run(data, params):\\n"
            "    n = len(data['close'])\\n"
            "    return {'buy': [False] * (n - 1) + [True], 'sell': [False] * n}\\n"
        )
        result = run_indicator(source, {
            "open": [10.0, 11.0],
            "high": [11.0, 12.0],
            "low": [9.0, 10.0],
            "close": [10.0, 11.0],
            "volume": [100.0, 100.0],
            "timestamp": ["a", "b"],
        }, {})
        self.assertEqual(result["buy"], [False, True])

    def test_indicator_rejects_misaligned_signals(self):
        source = "def run(data, params): return {'buy': [True], 'sell': [False]}"
        with self.assertRaises(ValueError):
            run_indicator(source, {
                "open": [10.0, 11.0],
                "high": [11.0, 12.0],
                "low": [9.0, 10.0],
                "close": [10.0, 11.0],
                "volume": [100.0, 100.0],
                "timestamp": ["a", "b"],
            }, {})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the Python tests and verify failure**

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: FAIL because `strategy_runtime` does not exist.

- [ ] **Step 3: Implement Pydantic contracts**

```py
from typing import Any, Literal
from pydantic import BaseModel, Field


class Diagnostic(BaseModel):
    code: str
    message: str
    line: int | None = None
    severity: Literal["error", "warning"] = "error"


class ValidationResult(BaseModel):
    valid: bool
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    source_hash: str
    engine_version: str = "hermes-quant-1"


class StrategySource(BaseModel):
    strategyVersionId: str
    runtime: Literal["indicator", "script"]
    source: str = Field(min_length=1, max_length=100_000)
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    parameters: dict[str, Any] = Field(default_factory=dict)
```

- [ ] **Step 4: Implement AST validation**

```py
import ast
import hashlib
from .contracts import Diagnostic, ValidationResult

FORBIDDEN_NAMES = {
    "__import__", "compile", "eval", "exec", "globals", "locals", "open",
}
FORBIDDEN_MODULES = {
    "asyncio", "builtins", "ctypes", "importlib", "multiprocessing", "os",
    "pathlib", "requests", "shutil", "socket", "subprocess", "sys", "threading",
}


def validate_source(runtime: str, source: str) -> ValidationResult:
    diagnostics: list[Diagnostic] = []
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        return ValidationResult(
            valid=False,
            source_hash=source_hash,
            diagnostics=[Diagnostic(code="syntax_error", message=str(exc), line=exc.lineno)],
        )
    functions = {node.name for node in tree.body if isinstance(node, ast.FunctionDef)}
    required = {"run"} if runtime == "indicator" else {"on_init", "on_bar"}
    for name in sorted(required - functions):
        diagnostics.append(Diagnostic(code="missing_function", message=f"Missing {name}"))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            module = node.names[0].name if isinstance(node, ast.Import) else (node.module or "")
            if module.split(".")[0] in FORBIDDEN_MODULES:
                diagnostics.append(Diagnostic(
                    code="forbidden_import",
                    message=f"Import {module} is not allowed",
                    line=getattr(node, "lineno", None),
                ))
        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            diagnostics.append(Diagnostic(
                code="forbidden_name",
                message=f"{node.id} is not allowed",
                line=getattr(node, "lineno", None),
            ))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "shift":
            if node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value < 0:
                diagnostics.append(Diagnostic(
                    code="lookahead",
                    message="Negative shift introduces look-ahead bias",
                    line=getattr(node, "lineno", None),
                ))
    return ValidationResult(
        valid=not any(item.severity == "error" for item in diagnostics),
        source_hash=source_hash,
        diagnostics=diagnostics,
    )
```

- [ ] **Step 5: Implement the indicator runtime**

```py
from typing import Any
from .validator import validate_source

SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "float": float, "int": int, "len": len,
    "list": list, "max": max, "min": min, "range": range, "round": round,
    "sum": sum, "zip": zip,
}


def run_indicator(source: str, data: dict[str, list[Any]], params: dict[str, Any]):
    validation = validate_source("indicator", source)
    if not validation.valid:
        raise ValueError(validation.model_dump())
    namespace: dict[str, Any] = {"__builtins__": SAFE_BUILTINS}
    exec(compile(source, "<indicator-strategy>", "exec"), namespace, namespace)
    output = namespace["run"](data, dict(params))
    if not isinstance(output, dict):
        raise ValueError("Indicator strategy must return a dict")
    length = len(data["close"])
    required = ("buy", "sell")
    if not all(key in output for key in required):
        raise ValueError("Indicator strategy must return buy and sell")
    normalized = {}
    for key in required:
        values = list(output[key])
        if len(values) != length:
            raise ValueError(f"{key} length must match bars")
        normalized[key] = [bool(value) for value in values]
    return normalized
```

- [ ] **Step 6: Run Python tests**

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: PASS.

### Task 4: Add Event-Driven Runtime and Deterministic Backtest

**Files:**
- Modify: `server/python/tests/test_strategy_runtime.py`
- Create: `server/python/strategy_runtime/script_runtime.py`
- Create: `server/python/strategy_runtime/backtest.py`

- [ ] **Step 1: Add failing parity and fee tests**

```py
from strategy_runtime.backtest import run_backtest

def test_script_order_and_fee_accounting(self):
    source = (
        "def on_init(ctx):\\n    ctx.state['seen'] = 0\\n"
        "def on_bar(ctx, bar):\\n"
        "    ctx.state['seen'] += 1\\n"
        "    if ctx.state['seen'] == 1: ctx.buy()\\n"
        "    if ctx.state['seen'] == 3: ctx.close_position()\\n"
    )
    bars = [
        {"timestamp": "1", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1000},
        {"timestamp": "2", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 1000},
        {"timestamp": "3", "open": 102, "high": 103, "low": 101, "close": 102, "volume": 1000},
    ]
    result = run_backtest(
        runtime="script",
        source=source,
        bars=bars,
        params={},
        policy={"initialCapital": 10_000, "feeRate": 0.001, "slippageBps": 0,
                "entryPct": 1, "tradeDirection": "long", "exitOwner": "strategy"},
    )
    self.assertEqual(len(result["trades"]), 1)
    self.assertLess(result["metrics"]["totalReturnPct"], 2)
```

- [ ] **Step 2: Run and verify failure**

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: FAIL because `backtest.py` does not exist.

- [ ] **Step 3: Implement restricted context and backtest loop**

Implement `RuntimeContext` with only `state`, read-only position/cash values, and
`buy`, `sell`, `close_position` methods that append normalized intents. Execute intents
at the next bar open, applying the configured slippage and fee once. Apply engine-owned
stop-loss, take-profit, and trailing stop before ordinary strategy intents. Return
equity/drawdown curves, fills, trades, metrics, assumptions, and warnings.

The complete implementation must enforce:

```py
if policy["exitOwner"] == "strategy":
    engine_stop_loss = None
    engine_take_profit = None
    engine_trailing_stop = None
else:
    engine_stop_loss = policy.get("stopLossPct")
    engine_take_profit = policy.get("takeProfitPct")
    engine_trailing_stop = policy.get("trailingStopPct")
```

and must not expose the raw namespace, Python modules, wall clock, environment, or
filesystem through `ctx` or `bar`.

- [ ] **Step 4: Run Python tests**

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: PASS.

### Task 5: Expose Runtime Endpoints and TypeScript Client

**Files:**
- Modify: `server/python/science_skills_service.py`
- Modify: `server/utils/scienceService.ts`
- Create: `server/services/quantRuntimeClient.ts`
- Create: `server/services/__tests__/quantRuntimeClient.test.ts`

- [ ] **Step 1: Write a failing client boundary test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateStrategy } from '../quantRuntimeClient.js';

afterEach(() => vi.unstubAllGlobals());

describe('quant runtime client', () => {
  it('rejects a mismatched source hash before network I/O', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(validateStrategy({
      strategyVersionId: 'v1',
      runtime: 'indicator',
      source: 'def run(data, params): return {}',
      sourceHash: '0'.repeat(64),
      parameters: {},
    })).rejects.toThrow('source hash');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run server/services/__tests__/quantRuntimeClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Add FastAPI endpoints**

```py
from strategy_runtime.backtest import run_backtest
from strategy_runtime.contracts import StrategySource
from strategy_runtime.validator import validate_source

@app.post("/strategy/validate")
def strategy_validate(payload: StrategySource):
    result = validate_source(payload.runtime, payload.source)
    if result.source_hash != payload.sourceHash:
        return err("source hash mismatch")
    return ok(result.model_dump())

@app.post("/strategy/backtest")
def strategy_backtest(payload: StrategyBacktestPayload):
    return ok(run_backtest(
        runtime=payload.runtime,
        source=payload.source,
        bars=[bar.model_dump() for bar in payload.bars],
        params=payload.parameters,
        policy=payload.execution.model_dump(),
    ))
```

- [ ] **Step 4: Implement the bounded TypeScript client**

Use `crypto.createHash('sha256')`, the existing `SCIENCE_SERVICE_URL`, a 30-second
validation timeout, a configurable backtest timeout capped at five minutes, and parse
responses through the TypeScript schemas before returning them. Never retry a submitted
backtest automatically.

- [ ] **Step 5: Run client and Python tests**

Run: `npx vitest run server/services/__tests__/quantRuntimeClient.test.ts`

Expected: PASS.

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: PASS.

### Task 6: Add Immutable Strategy Versions and Backtest Jobs

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0002_strategy_runtime.sql`
- Create: `server/repositories/strategyRuntimeRepo.ts`
- Create: `server/services/__tests__/strategyRuntimeService.test.ts`

- [ ] **Step 1: Write repository/service tests with a fake repository**

Test that:

- creating a version increments its version number and preserves the prior source;
- a user cannot read another user's version;
- a backtest job stores strategy/source hashes and immutable parameters;
- terminal job states cannot transition back to `running`.

- [ ] **Step 2: Add additive tables**

```sql
CREATE TABLE IF NOT EXISTS strategy_versions (
  id uuid PRIMARY KEY,
  strategy_id integer NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  runtime text NOT NULL CHECK (runtime IN ('indicator', 'script')),
  source text NOT NULL,
  source_hash text NOT NULL,
  parameter_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance text NOT NULL DEFAULT 'human',
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(strategy_id, version)
);

CREATE TABLE IF NOT EXISTS backtest_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  request jsonb NOT NULL,
  result jsonb,
  error text,
  source_hash text NOT NULL,
  data_hash text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);
```

- [ ] **Step 3: Mirror tables in Drizzle schema**

Use `uuid`, `integer`, `text`, `jsonb`, `timestamp`, user/strategy foreign keys, and
indexes on `(userId, createdAt)` and `(strategyId, version)`.

- [ ] **Step 4: Implement user-scoped repository methods**

Required methods:

```ts
createVersion(input)
getVersionForUser(userId, versionId)
listVersionsForUser(userId, strategyId)
createBacktestJob(input)
markBacktestRunning(userId, jobId)
completeBacktestJob(userId, jobId, result)
failBacktestJob(userId, jobId, error)
getBacktestJobForUser(userId, jobId)
```

Every query must include `userId`. Completion updates must include the expected current
state so concurrent workers cannot overwrite a terminal result.

- [ ] **Step 5: Run targeted tests and typecheck**

Run: `npx vitest run server/services/__tests__/strategyRuntimeService.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

### Task 7: Add Authenticated Strategy and Async Backtest APIs

**Files:**
- Create: `server/services/strategyRuntimeService.ts`
- Create: `server/api/strategies.ts`
- Modify: `server.ts`
- Modify: `server/api/agent.ts`

- [ ] **Step 1: Implement orchestration with injected dependencies**

`StrategyRuntimeService` must accept repository, data loader, validator, and backtest
client dependencies. `startBacktest` creates a queued job and schedules execution
without blocking the HTTP response. It captures source and normalized OHLCV hashes
before execution.

- [ ] **Step 2: Implement authenticated routes**

```text
POST /api/strategies/:strategyId/versions
GET  /api/strategies/:strategyId/versions
POST /api/strategy-versions/:versionId/validate
POST /api/strategy-versions/:versionId/backtests
GET  /api/backtest-jobs/:jobId
```

All routes require `req.userId`, validate request bodies with Zod, and return `404`
instead of revealing cross-user resources.

- [ ] **Step 3: Replace the AI placeholder**

Change `execute_backtest` in `server/api/agent.ts` to call the same
`StrategyRuntimeService.startBacktest` method and return `{ jobId, status: 'queued' }`.
Do not maintain a second AI-only backtest implementation.

- [ ] **Step 4: Mount the router**

```ts
import { strategiesRouter } from './server/api/strategies.js';
app.use('/api', authMiddleware, strategiesRouter);
```

- [ ] **Step 5: Run targeted and full TypeScript verification**

Run: `npx vitest run server/services/__tests__/strategyRuntimeContracts.test.ts server/services/__tests__/quantRuntimeClient.test.ts server/services/__tests__/strategyRuntimeService.test.ts server/services/__tests__/backtestRegression.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

### Task 8: Phase 1 End-to-End Verification and Documentation

**Files:**
- Create: `docs/strategy-runtime.md`
- Modify: `README.md`

- [ ] **Step 1: Document contracts and safety**

Document:

- indicator and script entry points;
- allowed context and forbidden imports;
- signal and exit ownership rules;
- deterministic backtest assumptions;
- REST examples;
- Python service startup;
- paper-only limitation;
- Apache-2.0 reference provenance.

- [ ] **Step 2: Run the Python service smoke test**

Run: `python -m uvicorn server.python.science_skills_service:app --host 127.0.0.1 --port 8788`

Expected: service starts and `/health` returns `status=success`.

- [ ] **Step 3: Exercise the complete paper-safe flow**

Create a draft strategy, create a version, validate it, submit a backtest, poll until
terminal state, and verify the persisted result includes:

```text
strategyVersionId
sourceHash
dataHash
engineVersion
assumptions
warnings
equityCurve
trades
metrics
```

- [ ] **Step 4: Run final Phase 1 checks**

Run: `python -m unittest server.python.tests.test_strategy_runtime -v`

Expected: PASS.

Run: `npx vitest run`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Update graphify**

Run: `graphify update .`

Expected: `graphify-out/GRAPH_REPORT.md` and wiki reflect the new strategy runtime.
If the command is unavailable, record the exact missing-command gap and do not claim
knowledge-graph verification.

## Plan Self-Review

- Spec coverage: Phase 1 covers immutable strategy versions, both runtime modes,
  deterministic validation, asynchronous persisted backtests, AI tool reuse, and
  regression protection.
- Deferred by design: provider registry, Agent Gateway tokens, multi-tenant scheduler,
  and UI are separate plans for Phases 2–4.
- Placeholder scan: no `TBD`, `TODO`, or undefined implementation task remains.
- Type consistency: `strategyVersionId`, `sourceHash`, `runId`, `bars`, `execution`,
  diagnostics, and job states use the same names across TypeScript, Python, storage,
  service, and API tasks.
