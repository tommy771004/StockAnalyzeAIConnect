
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function checkSchema() {
  const sql = neon(process.env.DATABASE_URL!);
  const columns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
  `;
  console.log('Users table columns:', columns);
  
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `;
  console.log('Public tables:', tables);
}

checkSchema();
