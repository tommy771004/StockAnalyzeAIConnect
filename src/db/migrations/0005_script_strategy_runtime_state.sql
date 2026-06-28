-- Durable per-user ScriptStrategy paper runtime cursors.

ALTER TABLE autotrading_configs
  ADD COLUMN IF NOT EXISTS strategy_runtime_state jsonb;
