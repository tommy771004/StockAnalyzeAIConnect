# Agent Gateway v1

The Agent Gateway is a separate authentication surface for external AI/MCP clients. It
does not accept browser JWTs, and agent bearer tokens do not authorize legacy browser
routes.

The standard stdio adapter is documented in `docs/mcp.md` and implemented by
`server/mcp/stdio.ts`. It is a thin MCP transport over this Gateway, not a second tool
implementation.

## Token lifecycle

Browser-authenticated users manage tokens at:

```text
POST   /api/agent/v1/tokens
GET    /api/agent/v1/tokens
DELETE /api/agent/v1/tokens/:tokenId
GET    /api/agent/v1/audit?limit=100
```

The create response returns a token shaped like:

```text
hagt_ab12cd34_<random-secret>
```

The plaintext is returned once. Hermes stores only its SHA-256 hash and a non-secret
prefix. Listing tokens never returns plaintext or hashes.

Tokens have:

- scopes: `R` read, `W` workspace draft/validation, `B` bounded backtest, `T`
  paper-trading command, and `A` administration;
- expiry and revocation timestamps;
- optional market and instrument allowlists;
- a per-minute request budget;
- an invariant `paperOnly=true`.

`T` does not authorize live execution. Requests containing `mode=real`,
`executionMode=live`, `paperOnly=false`, or equivalent nested fields are rejected before
side effects.

## External routes

Use:

```http
Authorization: Bearer hagt_ab12cd34_<random-secret>
```

Available contracts:

```text
GET  /api/agent/v1/tools
POST /api/agent/v1/tools/:toolName
POST /api/agent/v1/strategy-drafts
POST /api/agent/v1/strategy-versions/:versionId/validate
POST /api/agent/v1/backtests
GET  /api/agent/v1/backtests/:jobId
GET  /api/agent/v1/backtests/:jobId/events
POST /api/agent/v1/paper-sessions
GET  /api/agent/v1/paper-sessions/current
GET  /api/agent/v1/paper-sessions/current/orders
DELETE /api/agent/v1/paper-sessions/current
```

Tool discovery is filtered by the token's scopes. Tool execution revalidates scope,
paper-only policy, input schema, output schema, allowlists, and evidence.

`start_paper_strategy` validates user ownership and the immutable strategy version before
starting the user's isolated session. Paper execution supports validated indicators and
long-only ScriptStrategy versions with durable runtime cursors. The same restricted
Python runtime evaluates current normalized 15-minute OHLCV, and the resulting signal
still passes through proactive stops, freshness checks, portfolio risk, and the simulated
broker.

## Idempotency

`W`, `B`, and `T` operations require:

```http
Idempotency-Key: client-stable-operation-id
```

The key is unique per token. Reusing it with the same request hash replays the stored
response without repeating the side effect. Reusing it for another request returns a
conflict. An in-progress request is not executed twice.

## Backtest SSE

`GET /api/agent/v1/backtests/:jobId/events` emits:

```text
event: status
data: {"id":"...","status":"queued|running|completed|failed",...}
```

The stream polls only through the authenticated user's ownership boundary and closes on
`completed` or `failed`.

## Audit

Gateway success, denial, validation failure, replay, JSON reads, and SSE reads record:

- token ID/prefix and user;
- route, risk class, request hash, result status, and latency;
- prompt/tool versions when applicable;
- created resource IDs;
- redacted metadata.

API keys, bearer tokens, cookies, raw credentials, response bodies, and stack traces are
not audit fields. Audit rows are append-only in the repository surface.

## Safety boundary

- Agent-created strategies are immutable drafts with `provenance=ai`.
- Strategy validation and execution occur in the restricted Python runtime.
- Generated strategy code is never executed in the Express process.
- Real broker placeholders remain unavailable to the gateway.
- Paper session IDs and run/resource IDs are recorded in idempotency and audit rows.
