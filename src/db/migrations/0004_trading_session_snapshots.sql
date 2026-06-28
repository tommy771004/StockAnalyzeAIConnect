-- Per-user paper trading recovery state.

ALTER TABLE autotrading_configs
  ADD COLUMN IF NOT EXISTS config_state jsonb,
  ADD COLUMN IF NOT EXISTS broker_state jsonb,
  ADD COLUMN IF NOT EXISTS risk_state jsonb,
  ADD COLUMN IF NOT EXISTS peak_price_track jsonb,
  ADD COLUMN IF NOT EXISTS recent_price_series jsonb,
  ADD COLUMN IF NOT EXISTS session_logs jsonb,
  ADD COLUMN IF NOT EXISTS cooldown_until timestamp,
  ADD COLUMN IF NOT EXISTS last_sentiment_score bigint,
  ADD COLUMN IF NOT EXISTS last_equity_broadcast bigint;
