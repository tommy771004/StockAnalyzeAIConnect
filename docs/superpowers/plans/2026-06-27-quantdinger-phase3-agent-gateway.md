# QuantDinger Phase 3 AI Tools and Agent Gateway Implementation Plan

> **Execution:** Use `superpowers:executing-plans`, `superpowers:test-driven-development`,
> and `superpowers:verification-before-completion` task-by-task.

**Goal:** Replace prompt-only AI capabilities with registered, provenance-rich tools and
provide a separate scoped Agent Gateway with hashed tokens, idempotency, audit,
instrument allowlists, paper-only enforcement, and SSE job observation.

**Architecture:** Browser chat remains behind HttpOnly-cookie authentication. A new
`/api/agent/v1` surface authenticates random agent tokens and invokes the same Hermes
services through an explicit tool registry. Tool results carry evidence/citations.
Prompt versions and model calls are recorded without secrets. Agent writes are bounded,
idempotent, and paper-only; live broker activation remains unavailable.

**Tech Stack:** TypeScript, Zod, Express, Drizzle, Node crypto, Vitest; existing model
router, data registry, strategy runtime, repositories, and SSE support; no new
dependencies.

---

### Task 1: Define AI Evidence, Prompt, Tool, and Gateway Contracts

**Files:**
- Create `server/ai/contracts.ts`
- Create `server/ai/__tests__/contracts.test.ts`

- [ ] Write failing tests for evidence IDs, provider citations, prompt versions, tool
  risk classes, gateway scopes, token prefixes, allowlists, idempotency keys, and
  redacted audit payloads.
- [ ] Run the focused test and verify RED.
- [ ] Implement Zod contracts with scopes `R`, `W`, `B`, `T`, `A`; tool risk classes
  `read`, `workspace`, `backtest`, `paper_trade`, `admin`; and structured error codes.
- [ ] Require every fact-bearing tool result to contain evidence or an explicit
  `dataUnavailable` reason.
- [ ] Run GREEN and commit.

### Task 2: Build Prompt and Tool Registries

**Files:**
- Create `server/ai/promptRegistry.ts`
- Create `server/ai/toolRegistry.ts`
- Create `server/ai/defaultTools.ts`
- Create `server/ai/__tests__/toolRegistry.test.ts`
- Modify `server/api/agent.ts`

- [ ] Write failing tests for duplicate registration, input/output validation, scope
  checks, provider citation propagation, and unknown-tool denial.
- [ ] Register tools for market snapshot, news, fundamentals, macro, data-source health,
  portfolio inspection, strategy version creation/validation, real async backtest, and
  backtest inspection.
- [ ] Move `AGENT_TOOLS` and `executeToolCall` out of the route file; OpenRouter schemas
  must derive from the registry.
- [ ] Version prompts by stable ID/hash and include the version in every model/tool
  result.
- [ ] Run focused agent/tool regressions and commit.

### Task 3: Make RAG Evidence and Citations Enforceable

**Files:**
- Create `server/ai/evidence.ts`
- Create `server/ai/modelGateway.ts`
- Create `server/ai/__tests__/modelGateway.test.ts`
- Modify `server/api/agent.ts`

- [ ] Write failing tests that provider facts become `[E1]`-style evidence, cited IDs
  must exist, unavailable data cannot become a fact, and credentials are removed before
  model calls/audit.
- [ ] Build chat/research context through registered tools and the data registry instead
  of the current no-op dynamic import of `server.ts`.
- [ ] Validate structured model output and attach citations plus prompt/model versions.
- [ ] Preserve memory/persona behavior while marking memory and user text separately
  from externally sourced evidence.
- [ ] Commit model gateway and chat migration.

### Task 4: Retire Express-Process Strategy Execution

**Files:**
- Modify `server/api/agent.ts`
- Create or extend agent route tests

- [ ] Add a failing test proving generated source is never executed with Node `vm`.
- [ ] Replace `/dynamic-strategy` with AI draft creation using the immutable strategy
  service and `provenance='ai'`; require a user-owned `strategyId` and runtime.
- [ ] Return the draft version and validation link/state. Validation and execution occur
  only through the Python runtime and async backtest service.
- [ ] Remove `node:vm` usage and generated-JavaScript execution.
- [ ] Commit the sandbox-boundary fix.

### Task 5: Persist Agent Tokens, Idempotency, and Append-Only Audit

**Files:**
- Modify `src/db/schema.ts`
- Create `src/db/migrations/0003_agent_gateway.sql`
- Create `server/repositories/agentGatewayRepo.ts`
- Create repository tests

- [ ] Write failing repository/contract tests for token hash uniqueness, expiry,
  revocation, scopes, allowlists, paper-only flag, idempotent replay, request hash
  conflict, and append-only audit fields.
- [ ] Add `agent_tokens`, `agent_idempotency`, and `agent_audit_events` tables with
  user ownership and indexes.
- [ ] Store only SHA-256 hashes of 256-bit random tokens; expose the plaintext once.
- [ ] Persist token prefix, route, scope/risk class, request hash, result status,
  latency, prompt/tool versions, resource IDs, and redacted metadata.
- [ ] Commit schema, migration, and repository.

### Task 6: Implement Agent Authentication and Policy Gates

**Files:**
- Create `server/middleware/agentAuth.ts`
- Create `server/services/agentPolicy.ts`
- Create focused tests

- [ ] Write failing tests for browser JWT rejection, missing/expired/revoked tokens,
  scope denial, allowlist denial, rate budget, required idempotency, and `paperOnly`.
- [ ] Authenticate `Authorization: Bearer hagt_<prefix>_<secret>` by hash and constant
  time comparison semantics.
- [ ] Enforce `W`, `B`, and `T` idempotency keys before execution.
- [ ] Deny all live trading fields/commands even when `T` is present.
- [ ] Commit middleware and policy.

### Task 7: Add `/api/agent/v1` Routes and SSE

**Files:**
- Create `server/api/agentV1.ts`
- Create `server/api/__tests__/agentV1.test.ts`
- Modify `server.ts`

- [ ] Write failing HTTP tests for token administration via browser auth and agent-token
  calls for tools, strategy drafts, validation, backtests, job reads, and SSE status.
- [ ] Add browser-authenticated token create/list/revoke administration.
- [ ] Add agent-authenticated read/tool/backtest endpoints with request schemas and
  idempotent replay.
- [ ] Stream async job state using SSE without exposing another user's resources.
- [ ] Audit success, denial, validation failure, and server failure with redaction.
- [ ] Mount separately from `/api/agent` browser routes and commit.

### Task 8: Document and Verify Phase 3

**Files:**
- Create `docs/agent-gateway.md`
- Create `docs/ai-evidence.md`
- Update `graphify-out/*`

- [ ] Document token lifecycle, scopes, idempotency, allowlists, paper-only limits,
  audit fields, prompt/tool versions, evidence/citation rules, and examples.
- [ ] Run all Vitest and Python tests, lint, and production build.
- [ ] Run migration verification when `DATABASE_URL` is configured; otherwise report the
  explicit gap.
- [ ] Run `python -m graphify update .` and confirm AI/gateway nodes.
- [ ] Restore only generated artifacts, review the diff, and commit final documentation.

## Plan Self-Review

- Browser JWT and agent token surfaces remain separate.
- Agent-created strategies are drafts; Python owns validation/execution.
- Every state-changing gateway request is scoped, idempotent, audited, allowlisted, and
  paper-only.
- Facts reaching an LLM are traceable to evidence IDs and provider provenance; absent
  facts remain absent.
- Existing stop-loss, cooldown, hedge, and simulated-broker invariants are unchanged.
- Optional MCP wrapping remains outside this phase until REST contracts stabilize.
