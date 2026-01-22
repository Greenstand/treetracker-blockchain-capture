import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set; database features will be disabled');
}

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
    })
  : null;

export async function initDatabase(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data JSONB NOT NULL,
      species TEXT,
      common_name TEXT,
      status TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      image_url TEXT,
      capture_time TIMESTAMPTZ,
      tx_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS captures_user_time_idx
    ON captures (user_id, capture_time DESC);
  `);
}
