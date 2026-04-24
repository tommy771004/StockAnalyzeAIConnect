
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function fixSchema() {
  const sql = neon(process.env.DATABASE_URL!);
  
  console.log('Adding balance column to users...');
  try {
    await sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "balance" numeric DEFAULT '100000' NOT NULL`;
    console.log('Balance column added.');
  } catch (e) {
    console.error('Error adding balance:', e);
  }

  console.log('Ensuring subscription_tier has default...');
  try {
    await sql`ALTER TABLE "users" ALTER COLUMN "subscription_tier" SET DEFAULT 'free'`;
    console.log('Subscription tier default set.');
  } catch (e) {
    console.error('Error setting subscription_tier default:', e);
  }

  console.log('Schema fix complete.');
}

fixSchema();
