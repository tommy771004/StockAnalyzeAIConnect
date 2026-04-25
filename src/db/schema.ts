/**
 * src/db/schema.ts
 * Drizzle ORM schema — 7 tables for StockAnalyzeAI on Neon PostgreSQL
 */
import {
  pgTable,
  pgEnum,
  serial,
  uuid,
  text,
  numeric,
  boolean,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── users ────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:               uuid('id').defaultRandom().primaryKey(),
  email:            text('email').notNull().unique(),
  passwordHash:     text('password_hash').notNull(),
  name:             text('name'),
  balance:          numeric('balance').notNull().default('100000'), // 現金餘額
  subscriptionTier: text('subscription_tier').notNull().default('free'),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  watchlistItems: many(watchlistItems),
  positions:      many(positions),
  trades:         many(trades),
  alerts:         many(alerts),
  settings:       many(userSettings),
  strategies:     many(strategies),
  agentMemories:  many(agentMemories),
  portfolioHistory: many(portfolioHistory),
  paymentOrders:  many(paymentOrders),
  orders:         many(orders),
  notificationSettings: many(notificationSettings),
}));

// ─── portfolio_history (NAV snapshots) ────────────────────────────────────────
export const portfolioHistory = pgTable('portfolio_history', {
  id:          serial('id').primaryKey(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  totalEquity: numeric('total_equity').notNull(),
  date:        text('date').notNull(), // 'YYYY-MM-DD'
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('portfolio_history_user_date_idx').on(t.userId, t.date),
]);

export const portfolioHistoryRelations = relations(portfolioHistory, ({ one }) => ({
  user: one(users, { fields: [portfolioHistory.userId], references: [users.id] }),
}));

// ─── watchlist_items ──────────────────────────────────────────────────────────
export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id:      serial('id').primaryKey(),
    userId:  uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    symbol:  text('symbol').notNull(),
    name:    text('name'),
    addedAt: bigint('added_at', { mode: 'number' }),
  },
  (t) => [uniqueIndex('watchlist_user_symbol_idx').on(t.userId, t.symbol)],
);

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  user: one(users, { fields: [watchlistItems.userId], references: [users.id] }),
}));

// ─── positions ────────────────────────────────────────────────────────────────
export const positions = pgTable(
  'positions',
  {
    id:        serial('id').primaryKey(),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    symbol:    text('symbol').notNull(),
    name:      text('name'),
    shares:    numeric('shares').notNull(),
    avgCost:   numeric('avg_cost').notNull(),
    currency:  text('currency').notNull().default('USD'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('positions_user_symbol_idx').on(t.userId, t.symbol)],
);

export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(users, { fields: [positions.userId], references: [users.id] }),
}));

// ─── trades ───────────────────────────────────────────────────────────────────
export const trades = pgTable('trades', {
  id:          serial('id').primaryKey(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:        text('date').notNull(),
  ticker:      text('ticker').notNull(),
  side:        text('side').notNull(),          // 'BUY' | 'SELL'
  entry:       numeric('entry').notNull(),
  exit:        numeric('exit'),
  qty:         numeric('qty').notNull(),
  pnl:         numeric('pnl'),
  status:      text('status'),                  // 'Win' | 'Loss'
  notes:       text('notes'),
  mode:        text('mode').notNull().default('real'), // 'real' | 'paper'
  broker:      text('broker'),
  orderType:   text('order_type'),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
},
(t) => [
  // Rule: skills/03_Backend_Security.md §1 "Performance Indexing"
  // Basic FK index for per-user queries
  index('trades_user_id_idx').on(t.userId),
  // Composite: time-series range queries (e.g. equity curve in backtest)
  index('trades_user_created_idx').on(t.userId, t.createdAt),
  // Composite: per-symbol backtest scan (userId + ticker + date DESC)
  index('trades_user_ticker_created_idx').on(t.userId, t.ticker, t.createdAt),
  // Composite: paper vs real trade filtering (userId + mode + date)
  index('trades_user_mode_created_idx').on(t.userId, t.mode, t.createdAt),
  // Covering index for win-rate & P&L aggregations (ticker + status)
  index('trades_ticker_status_idx').on(t.ticker, t.status),
]);

export const tradesRelations = relations(trades, ({ one }) => ({
  user: one(users, { fields: [trades.userId], references: [users.id] }),
}));

// ─── alerts ───────────────────────────────────────────────────────────────────
export const alerts = pgTable('alerts', {
  id:             serial('id').primaryKey(),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol:         text('symbol').notNull(),
  condition:      text('condition').notNull(),  // 'above' | 'below'
  target:         numeric('target').notNull(),
  triggered:      boolean('triggered').notNull().default(false),
  triggeredAt:    timestamp('triggered_at'),
  triggeredPrice: numeric('triggered_price'),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
},
(t) => [
  // userId index for per-user queries; triggered index for polling job (getAllPendingAlerts)
  index('alerts_user_id_idx').on(t.userId),
  index('alerts_triggered_idx').on(t.triggered),
]);

export const alertsRelations = relations(alerts, ({ one }) => ({
  user: one(users, { fields: [alerts.userId], references: [users.id] }),
}));

// ─── user_settings ────────────────────────────────────────────────────────────
export const userSettings = pgTable(
  'user_settings',
  {
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    key:       text('key').notNull(),
    value:     jsonb('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
}));

// ─── strategies ───────────────────────────────────────────────────────────────
export const strategies = pgTable('strategies', {
  id:           serial('id').primaryKey(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  script:       text('script').notNull(),
  autoTrade:    boolean('auto_trade').notNull().default(false),
  maxDailyLoss: numeric('max_daily_loss'),
  description:  text('description'),
  isActive:     boolean('is_active').notNull().default(false),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
},
(t) => [
  index('strategies_user_id_idx').on(t.userId),
]);

export const strategiesRelations = relations(strategies, ({ one }) => ({
  user: one(users, { fields: [strategies.userId], references: [users.id] }),
}));

// ─── agent_memory_type enum ───────────────────────────────────────────────────
export const agentMemoryTypeEnum = pgEnum('agent_memory_type', ['PREFERENCE', 'SKILL', 'CONTEXT']);

// ─── agent_memories ───────────────────────────────────────────────────────────
export const agentMemories = pgTable('agent_memories', {
  id:         serial('id').primaryKey(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memoryType: agentMemoryTypeEnum('memory_type').notNull().default('CONTEXT'),
  content:    jsonb('content').notNull(),         // free-form JSON: { key, value, … }
  createdAt:  timestamp('created_at').defaultNow().notNull(),
},
(t) => [
  index('agent_memories_user_id_idx').on(t.userId),
  index('agent_memories_type_idx').on(t.userId, t.memoryType),
]);

export const agentMemoriesRelations = relations(agentMemories, ({ one }) => ({
  user: one(users, { fields: [agentMemories.userId], references: [users.id] }),
}));

// ─── payment_orders ───────────────────────────────────────────────────────────
export const paymentOrders = pgTable('payment_orders', {
  id:              serial('id').primaryKey(),
  merchantTradeNo: text('merchant_trade_no').notNull().unique(),
  userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId:          text('plan_id').notNull(),
  status:          text('status').notNull().default('pending'), // 'pending' | 'success' | 'failed'
  amount:          numeric('amount').notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
},
(t) => [
  index('payment_orders_user_id_idx').on(t.userId),
]);

export const paymentOrdersRelations = relations(paymentOrders, ({ one }) => ({
  user: one(users, { fields: [paymentOrders.userId], references: [users.id] }),
}));

// ─── autotrading_configs ──────────────────────────────────────────────────────
export const autotradingConfigs = pgTable('autotrading_configs', {
  id:              serial('id').primaryKey(),
  userId:          uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  mode:            text('mode').notNull(),
  strategies:      text('strategies').array().notNull(),
  params:          jsonb('params').notNull(),
  symbols:         text('symbols').array().notNull(),
  tickIntervalMs:  bigint('tick_interval_ms', { mode: 'number' }).notNull(),
  budgetLimitTwd:  numeric('budget_limit_twd').notNull(),
  maxDailyLossTwd: numeric('max_daily_loss_twd').notNull(),
  status:          text('status').notNull().default('stopped'),
  lossStreakCount: bigint('loss_streak_count', { mode: 'number' }).notNull().default(0),
  posTrack:        jsonb('pos_track'),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
});

export const autotradingConfigsRelations = relations(autotradingConfigs, ({ one }) => ({
  user: one(users, { fields: [autotradingConfigs.userId], references: [users.id] }),
}));

// ─── autotrading_logs ─────────────────────────────────────────────────────────
export const autotradingLogs = pgTable('autotrading_logs', {
  id:         text('id').primaryKey(),
  timestamp:  timestamp('timestamp').notNull(),
  level:      text('level').notNull(),
  source:     text('source').notNull(),
  message:    text('message').notNull(),
  symbol:     text('symbol'),
  confidence: bigint('confidence', { mode: 'number' }),
  action:     text('action'),
});

// ─── orders ───────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id:            serial('id').primaryKey(),
  userId:        uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  symbol:        text('symbol').notNull(),
  side:          text('side').notNull(),          // 'BUY' | 'SELL'
  qty:           numeric('qty').notNull(),
  price:         numeric('price').notNull(),
  orderType:     text('order_type').notNull(),    // 'MARKET' | 'LIMIT'
  marketType:    text('market_type').notNull(),   // 'TW_STOCK' | 'US_STOCK'
  status:        text('status').notNull(),        // 'PENDING' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED'
  brokerOrderId: text('broker_order_id'),
  lastError:     text('last_error'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
  updatedAt:     timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('orders_user_id_idx').on(t.userId),
  index('orders_broker_id_idx').on(t.brokerOrderId),
]);

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
}));

// ─── notification_settings ────────────────────────────────────────────────────
export const notificationSettings = pgTable('notification_settings', {
  id:        serial('id').primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel:   text('channel').notNull(),           // 'telegram' | 'discord' | 'webhook' | 'email'
  target:    text('target').notNull(),            // webhook URL or ID
  enabled:   boolean('enabled').notNull().default(true),
  triggers:  jsonb('triggers').notNull(),         // Array of NotifyEvent: ['fill', 'risk_block', ...]
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('notification_settings_user_id_idx').on(t.userId),
]);

export const notificationSettingsRelations = relations(notificationSettings, ({ one }) => ({
  user: one(users, { fields: [notificationSettings.userId], references: [users.id] }),
}));

// ─── Type exports ─────────────────────────────────────────────────────────────
export type User         = typeof users.$inferSelect;
export type NewUser      = typeof users.$inferInsert;
export type WatchlistItem  = typeof watchlistItems.$inferSelect;
export type NewWatchlistItem = typeof watchlistItems.$inferInsert;
export type Position     = typeof positions.$inferSelect;
export type NewPosition  = typeof positions.$inferInsert;
export type Trade        = typeof trades.$inferSelect;
export type NewTrade     = typeof trades.$inferInsert;
export type Alert        = typeof alerts.$inferSelect;
export type NewAlert     = typeof alerts.$inferInsert;
export type UserSetting  = typeof userSettings.$inferSelect;
export type Strategy     = typeof strategies.$inferSelect;
export type NewStrategy  = typeof strategies.$inferInsert;
export type AgentMemory    = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;
export type AgentMemoryType = 'PREFERENCE' | 'SKILL' | 'CONTEXT';
export type PortfolioHistory = typeof portfolioHistory.$inferSelect;
export type NewPortfolioHistory = typeof portfolioHistory.$inferInsert;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type NewPaymentOrder = typeof paymentOrders.$inferInsert;
export type AutotradingConfig = typeof autotradingConfigs.$inferSelect;
export type NewAutotradingConfig = typeof autotradingConfigs.$inferInsert;
export type AutotradingLog = typeof autotradingLogs.$inferSelect;
export type NewAutotradingLog = typeof autotradingLogs.$inferInsert;

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type NewNotificationSetting = typeof notificationSettings.$inferInsert;
