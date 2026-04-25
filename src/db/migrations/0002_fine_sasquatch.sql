CREATE TABLE "backtest_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"strategy_params_hash" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"metrics" jsonb NOT NULL,
	"trade_count" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backtest_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"entry_date" timestamp NOT NULL,
	"entry_price" numeric NOT NULL,
	"exit_date" timestamp,
	"exit_price" numeric,
	"qty" numeric NOT NULL,
	"pnl" numeric,
	"pnl_pct" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backtest_sessions" ADD CONSTRAINT "backtest_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backtest_trades" ADD CONSTRAINT "backtest_trades_session_id_backtest_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."backtest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_user_idx" ON "backtest_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "backtest_symbol_idx" ON "backtest_sessions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "backtest_hash_idx" ON "backtest_sessions" USING btree ("strategy_params_hash");--> statement-breakpoint
CREATE INDEX "backtest_trades_session_idx" ON "backtest_trades" USING btree ("session_id");