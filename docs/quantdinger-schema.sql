-- Hermes / QuantDinger integration schema
-- PostgreSQL / Neon, additive and safe to re-run.
-- Prerequisite: the base Hermes schema (users, strategies, trades, alerts,
-- and autotrading_configs) already exists.

BEGIN;

CREATE INDEX IF NOT EXISTS trades_user_id_idx
  ON trades (user_id);
CREATE INDEX IF NOT EXISTS trades_user_created_idx
  ON trades (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_ticker_idx
  ON trades (ticker);
CREATE INDEX IF NOT EXISTS alerts_user_id_idx
  ON alerts (user_id);
CREATE INDEX IF NOT EXISTS alerts_pending_idx
  ON alerts (id) WHERE triggered = false;
CREATE INDEX IF NOT EXISTS strategies_user_id_idx
  ON strategies (user_id);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id integer NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version integer NOT NULL,
  runtime text NOT NULL CHECK (runtime IN ('indicator', 'script')),
  source text NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  parameter_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance text NOT NULL DEFAULT 'human'
    CHECK (provenance IN ('human', 'ai', 'imported')),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(strategy_id, version)
);

CREATE INDEX IF NOT EXISTS strategy_versions_user_created_idx
  ON strategy_versions (user_id, created_at);
CREATE INDEX IF NOT EXISTS strategy_versions_strategy_idx
  ON strategy_versions (strategy_id);

CREATE TABLE IF NOT EXISTS backtest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  request jsonb NOT NULL,
  result jsonb,
  error text,
  source_hash text NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  data_hash text NOT NULL CHECK (data_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamp NOT NULL DEFAULT now(),
  started_at timestamp,
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS backtest_jobs_user_created_idx
  ON backtest_jobs (user_id, created_at);
CREATE INDEX IF NOT EXISTS backtest_jobs_version_idx
  ON backtest_jobs (strategy_version_id);
CREATE INDEX IF NOT EXISTS backtest_jobs_status_idx
  ON backtest_jobs (status);

CREATE TABLE IF NOT EXISTS agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^hagt_[a-f0-9]{8}$'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0),
  expires_at timestamp NOT NULL,
  allowed_markets text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_instruments text[] NOT NULL DEFAULT ARRAY[]::text[],
  paper_only boolean NOT NULL DEFAULT true CHECK (paper_only = true),
  rate_limit_per_minute integer NOT NULL DEFAULT 60
    CHECK (rate_limit_per_minute > 0),
  revoked_at timestamp,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_tokens_user_created_idx
  ON agent_tokens (user_id, created_at);

CREATE TABLE IF NOT EXISTS agent_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES agent_tokens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  route text NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  resource_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(token_id, key)
);

CREATE INDEX IF NOT EXISTS agent_idempotency_user_created_idx
  ON agent_idempotency (user_id, created_at);

CREATE TABLE IF NOT EXISTS agent_audit_events (
  id serial PRIMARY KEY,
  token_id uuid REFERENCES agent_tokens(id) ON DELETE SET NULL,
  token_prefix text,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  route text NOT NULL,
  risk_class text NOT NULL
    CHECK (risk_class IN ('read', 'workspace', 'backtest', 'paper_trade', 'admin')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL
    CHECK (status IN ('success', 'denied', 'validation_error', 'server_error')),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  prompt_version text,
  tool_version text,
  resource_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_audit_user_created_idx
  ON agent_audit_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS agent_audit_token_created_idx
  ON agent_audit_events (token_id, created_at);
CREATE INDEX IF NOT EXISTS agent_audit_route_created_idx
  ON agent_audit_events (route, created_at);

ALTER TABLE autotrading_configs
  ADD COLUMN IF NOT EXISTS config_state jsonb,
  ADD COLUMN IF NOT EXISTS broker_state jsonb,
  ADD COLUMN IF NOT EXISTS risk_state jsonb,
  ADD COLUMN IF NOT EXISTS peak_price_track jsonb,
  ADD COLUMN IF NOT EXISTS recent_price_series jsonb,
  ADD COLUMN IF NOT EXISTS session_logs jsonb,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamp,
  ADD COLUMN IF NOT EXISTS last_sentiment_score bigint,
  ADD COLUMN IF NOT EXISTS last_equity_broadcast bigint,
  ADD COLUMN IF NOT EXISTS strategy_runtime_state jsonb;

COMMIT;
