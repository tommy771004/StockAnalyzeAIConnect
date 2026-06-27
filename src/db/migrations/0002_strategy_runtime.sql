-- Immutable strategy versions and asynchronous backtest jobs.
-- Additive only: existing strategy and autotrading rows remain valid.

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
