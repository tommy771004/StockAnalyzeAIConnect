CREATE TABLE "autotrading_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"strategies" text[] NOT NULL,
	"params" jsonb NOT NULL,
	"symbols" text[] NOT NULL,
	"tick_interval_ms" bigint NOT NULL,
	"budget_limit_twd" numeric NOT NULL,
	"max_daily_loss_twd" numeric NOT NULL,
	"status" text DEFAULT 'stopped' NOT NULL,
	"loss_streak_count" bigint DEFAULT 0 NOT NULL,
	"pos_track" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "autotrading_configs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "autotrading_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"symbol" text,
	"confidence" bigint,
	"action" text
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"triggers" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"broker_order_id" text,
	"broker_id" text DEFAULT 'simulated' NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric NOT NULL,
	"price" numeric,
	"order_type" text DEFAULT 'MARKET' NOT NULL,
	"market_type" text DEFAULT 'TW_STOCK' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"filled_qty" numeric DEFAULT '0' NOT NULL,
	"avg_fill_price" numeric,
	"retry_count" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"parent_signal_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_trade_no" text NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_merchant_trade_no_unique" UNIQUE("merchant_trade_no")
);
--> statement-breakpoint
ALTER TABLE "autotrading_configs" ADD CONSTRAINT "autotrading_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notification_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_user_status_idx" ON "orders" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders" USING btree ("user_id");