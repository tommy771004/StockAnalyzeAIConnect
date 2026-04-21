/**
 * src/db/schema.ts
 * Drizzle ORM schema — 7 tables for StockAnalyzeAI on Neon PostgreSQL
 */
import {
  pgTable,
  serial,
  uuid,
  text,
  numeric,
  boolean,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
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
});

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
});

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
});

export const strategiesRelations = relations(strategies, ({ one }) => ({
  user: one(users, { fields: [strategies.userId], references: [users.id] }),
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
