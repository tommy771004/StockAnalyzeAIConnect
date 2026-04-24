CREATE TYPE "public"."agent_memory_type" AS ENUM('PREFERENCE', 'SKILL', 'CONTEXT');--> statement-breakpoint
CREATE TABLE "agent_memories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"memory_type" "agent_memory_type" DEFAULT 'CONTEXT' NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"condition" text NOT NULL,
	"target" numeric NOT NULL,
	"triggered" boolean DEFAULT false NOT NULL,
	"triggered_at" timestamp,
	"triggered_price" numeric,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"total_equity" numeric NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"shares" numeric NOT NULL,
	"avg_cost" numeric NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"script" text NOT NULL,
	"auto_trade" boolean DEFAULT false NOT NULL,
	"max_daily_loss" numeric,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"ticker" text NOT NULL,
	"side" text NOT NULL,
	"entry" numeric NOT NULL,
	"exit" numeric,
	"qty" numeric NOT NULL,
	"pnl" numeric,
	"status" text,
	"notes" text,
	"mode" text DEFAULT 'real' NOT NULL,
	"broker" text,
	"order_type" text,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"balance" numeric DEFAULT '100000' NOT NULL,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"added_at" bigint
);
--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_history" ADD CONSTRAINT "portfolio_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memories_user_id_idx" ON "agent_memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_memories_type_idx" ON "agent_memories" USING btree ("user_id","memory_type");--> statement-breakpoint
CREATE INDEX "alerts_user_id_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_triggered_idx" ON "alerts" USING btree ("triggered");--> statement-breakpoint
CREATE INDEX "portfolio_history_user_date_idx" ON "portfolio_history" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_user_symbol_idx" ON "positions" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "strategies_user_id_idx" ON "strategies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_user_id_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_user_created_idx" ON "trades" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_user_ticker_created_idx" ON "trades" USING btree ("user_id","ticker","created_at");--> statement-breakpoint
CREATE INDEX "trades_user_mode_created_idx" ON "trades" USING btree ("user_id","mode","created_at");--> statement-breakpoint
CREATE INDEX "trades_ticker_status_idx" ON "trades" USING btree ("ticker","status");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_symbol_idx" ON "watchlist_items" USING btree ("user_id","symbol");