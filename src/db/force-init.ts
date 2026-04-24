import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';

const databaseUrl = process.env.DATABASE_URL;

async function run() {
  if (!databaseUrl) {
    console.error('DATABASE_URL is missing');
    return;
  }
  const db = drizzle(neon(databaseUrl));

  console.log('🚀 Force-creating missing tables...');

  try {
    // Create user_settings
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user_settings" (
        "user_id" uuid NOT NULL,
        "key" text NOT NULL,
        "value" jsonb NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "user_settings_user_id_key_pk" PRIMARY KEY("user_id","key")
      );
    `);
    console.log('✅ table "user_settings" created/verified');

    // Create watchlist_items
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "watchlist_items" (
        "id" serial PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "symbol" text NOT NULL,
        "name" text,
        "added_at" bigint
      );
    `);
    console.log('✅ table "watchlist_items" created/verified');

    // Create positions if missing
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "positions" (
        "id" serial PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "symbol" text NOT NULL,
        "name" text,
        "shares" numeric NOT NULL,
        "avg_cost" numeric NOT NULL,
        "currency" text DEFAULT 'USD' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    console.log('✅ table "positions" created/verified');

    console.log('🎉 Database repair completed!');
  } catch (err) {
    console.error('❌ Failed to repair database:', err);
  }
}

run();
