/**
 * src/db/index.ts
 * Neon serverless PostgreSQL connection + Drizzle ORM instance.
 *
 * Works in both Node (server.ts / Express) and edge runtimes (Vercel).
 * When DATABASE_URL is not set, exports `db = null` so the server can still
 * start in dev/demo mode (API routes requiring DB will return 503).
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL not set — running without database. Set it in .env to enable persistence.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: ReturnType<typeof drizzle<typeof schema>> | null = process.env.DATABASE_URL
  ? drizzle(neon(process.env.DATABASE_URL), { schema })
  : null;

export type DB = NonNullable<typeof db>;

