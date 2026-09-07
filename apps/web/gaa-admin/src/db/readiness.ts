import { Pool } from "pg";

export async function checkDatabase(
  url: string | undefined,
  tables: readonly string[],
  baseline?: string
): Promise<boolean> {
  if (!url) return false;
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 1,
  });
  try {
    const result = await pool.query<{ present: boolean }>(
      "SELECT bool_and(to_regclass(name) IS NOT NULL) AS present FROM unnest($1::text[]) AS name",
      [[...tables, "drizzle.__drizzle_migrations"]]
    );
    if (!result.rows[0]?.present) return false;
    if (baseline) {
      const mark = await pool.query(
        "SELECT 1 FROM baseline_step WHERE key = $1",
        [baseline]
      );
      if (!mark.rowCount) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}
