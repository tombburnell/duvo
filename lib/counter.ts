import { getPool } from "./db";

const ROW_ID = 1;

export async function ensureCounterTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS counter (
      id INTEGER PRIMARY KEY,
      counter INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(
    `INSERT INTO counter (id, counter) VALUES ($1, 0) ON CONFLICT (id) DO NOTHING`,
    [ROW_ID]
  );
}

export async function getCounter(): Promise<number> {
  await ensureCounterTable();
  const pool = getPool();
  const res = await pool.query<{ counter: string }>(
    `SELECT counter FROM counter WHERE id = $1`,
    [ROW_ID]
  );
  const row = res.rows[0];
  if (!row) {
    return 0;
  }
  return Number(row.counter);
}

export async function incrementCounter(): Promise<number> {
  await ensureCounterTable();
  const pool = getPool();
  const res = await pool.query<{ counter: string }>(
    `UPDATE counter SET counter = counter + 1 WHERE id = $1 RETURNING counter`,
    [ROW_ID]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error("Counter row missing after increment");
  }
  return Number(row.counter);
}
