/**
 * src/db/index.ts
 * Neon serverless PostgreSQL connection + Drizzle ORM instance.
 *
 * Works in both Node (server.ts / Express) and edge runtimes (Vercel).
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required. Copy .env.example to .env and fill in your Neon connection string.');
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export type DB = typeof db;
