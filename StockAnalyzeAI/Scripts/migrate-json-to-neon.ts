/**
 * scripts/migrate-json-to-neon.ts
 *
 * One-shot migration: reads legacy JSON files and inserts them into Neon DB.
 * A default admin user is created if no DATABASE_USER_EMAIL / DATABASE_USER_PASSWORD
 * env vars are provided (falls back to hard-coded dev credentials).
 *
 * Usage:
 *   npx tsx scripts/migrate-json-to-neon.ts
 *   # or
 *   npm run db:migrate-json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/index.js';
import * as usersRepo from '../server/repositories/usersRepo.js';
import * as watchlistRepo from '../server/repositories/watchlistRepo.js';
import * as positionsRepo from '../server/repositories/positionsRepo.js';
import * as tradesRepo from '../server/repositories/tradesRepo.js';
import * as alertsRepo from '../server/repositories/alertsRepo.js';
import * as settingsRepo from '../server/repositories/settingsRepo.js';
import * as strategiesRepo from '../server/repositories/strategiesRepo.js';

const CWD = process.cwd();

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(CWD, `${name}.json`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
  } catch {
    console.warn(`  [skip] ${name}.json not found or unreadable`);
    return fallback;
  }
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function main() {
  console.log('\n=== JSON → Neon Migration ===\n');

  // 1. Resolve admin user credentials
  let email = process.env.DATABASE_USER_EMAIL ?? '';
  let password = process.env.DATABASE_USER_PASSWORD ?? '';
  let userName = process.env.DATABASE_USER_NAME ?? '';

  if (!email) {
    email = await promptLine('Admin email: ');
  }
  if (!password) {
    password = await promptLine('Admin password (≥8 chars): ');
  }
  if (!userName) {
    userName = await promptLine('Display name (optional, press Enter to skip): ');
  }

  if (!email || password.length < 8) {
    console.error('Error: valid email and password (≥8 chars) are required.');
    process.exit(1);
  }

  // 2. Create or find admin user
  let user = await usersRepo.findUserByEmail(email);
  if (user) {
    console.log(`  ✓ Using existing user: ${user.email} (id: ${user.id})`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await usersRepo.createUser({ email, passwordHash, name: userName || null });
    console.log(`  ✓ Created user: ${user.email} (id: ${user.id})`);
  }

  const userId = user.id;

  // 3. Watchlist
  const watchlist = readJson<Array<{ symbol: string; name?: string; addedAt?: number }>>('watchlist', []);
  if (watchlist.length) {
    await watchlistRepo.replaceWatchlist(userId, watchlist);
    console.log(`  ✓ Watchlist: ${watchlist.length} items migrated`);
  }

  // 4. Positions
  const positions = readJson<Array<{ symbol: string; amount?: number; shares?: number; avgPrice: number }>>('positions', []);
  if (positions.length) {
    const mapped = positions.map(p => ({
      symbol: p.symbol,
      shares: String(p.shares ?? p.amount ?? 0),
      avgPrice: String(p.avgPrice ?? 0),
    }));
    await positionsRepo.replacePositions(userId, mapped);
    console.log(`  ✓ Positions: ${mapped.length} items migrated`);
  }

  // 5. Trades
  const trades = readJson<any[]>('trades', []);
  if (trades.length) {
    for (const t of trades) {
      try {
        await tradesRepo.createTrade(userId, t);
      } catch (e) {
        console.warn(`  [warn] Trade skip:`, (e as Error).message);
      }
    }
    console.log(`  ✓ Trades: ${trades.length} records migrated`);
  }

  // 6. Alerts
  const alerts = readJson<any[]>('alerts', []);
  if (alerts.length) {
    for (const a of alerts) {
      try {
        await alertsRepo.createAlert(userId, {
          symbol: a.symbol,
          condition: a.condition,
          target: String(a.target ?? a.price ?? 0),
        });
      } catch (e) {
        console.warn(`  [warn] Alert skip:`, (e as Error).message);
      }
    }
    console.log(`  ✓ Alerts: ${alerts.length} records migrated`);
  }

  // 7. Settings
  const settings = readJson<Record<string, unknown>>('settings', {});
  const skipKeys = new Set(['strategyScript', 'strategyName']); // migrated as a strategy below
  for (const [key, value] of Object.entries(settings)) {
    if (skipKeys.has(key)) continue;
    await settingsRepo.setSetting(userId, key, value);
  }
  console.log(`  ✓ Settings: ${Object.keys(settings).length} keys migrated`);

  // 8. Strategy (if strategyScript + strategyName exist in settings)
  const stratScript = settings['strategyScript'];
  const stratName   = settings['strategyName'] ?? 'Migrated Strategy';
  if (typeof stratScript === 'string' && stratScript.trim()) {
    const s = await strategiesRepo.createStrategy(userId, {
      name: String(stratName),
      script: stratScript,
    });
    await strategiesRepo.setActiveStrategy(userId, s.id);
    console.log(`  ✓ Strategy "${stratName}" migrated and activated`);
  }

  console.log('\n=== Migration complete ===\n');
  process.exit(0);
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
