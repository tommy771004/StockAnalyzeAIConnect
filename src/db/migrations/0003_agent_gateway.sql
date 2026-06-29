-- Scoped external agent tokens, idempotent mutations, and append-only audit.

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
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute > 0),
  revoked_at timestamp,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_tokens_user_created_idx
  ON agent_tokens (user_id, created_at);--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_idempotency_user_created_idx
  ON agent_idempotency (user_id, created_at);--> statement-breakpoint

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
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS agent_audit_user_created_idx
  ON agent_audit_events (user_id, created_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_audit_token_created_idx
  ON agent_audit_events (token_id, created_at);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_audit_route_created_idx
  ON agent_audit_events (route, created_at);
