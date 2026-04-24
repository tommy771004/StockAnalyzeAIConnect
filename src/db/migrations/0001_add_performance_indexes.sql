-- Migration: 0001_add_performance_indexes
-- Supabase/Postgres best practice: add indexes for every FK column used in WHERE/ORDER BY
-- and a partial index for the hot polling query (getAllPendingAlerts).

-- trades: per-user queries (getTradesByUser ORDER BY created_at DESC)
CREATE INDEX IF NOT EXISTS trades_user_id_idx        ON trades (user_id);
CREATE INDEX IF NOT EXISTS trades_user_created_idx   ON trades (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_ticker_idx         ON trades (ticker);

-- alerts: per-user queries + polling job (getAllPendingAlerts WHERE triggered = false)
CREATE INDEX IF NOT EXISTS alerts_user_id_idx        ON alerts (user_id);
-- Partial index: only un-triggered rows — dramatically smaller, fits in cache
CREATE INDEX IF NOT EXISTS alerts_pending_idx        ON alerts (id) WHERE triggered = false;

-- strategies: per-user queries
CREATE INDEX IF NOT EXISTS strategies_user_id_idx    ON strategies (user_id);
