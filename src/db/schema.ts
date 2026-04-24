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

// update usersRelations to include agentMemories

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

