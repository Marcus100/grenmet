import pg from "pg";

export function cmsUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("CMS DATABASE_URL is required");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid CMS DATABASE_URL");
  }
  const expected = process.env.CMS_DB_NAME ?? "gms_cms";
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname.slice(1)) !== expected ||
    ["app", "app_test", "app_prod", "app_staging", "postgres"].includes(
      expected
    )
  ) {
    throw new Error("CMS DATABASE_URL does not target CMS_DB_NAME");
  }
  return value;
}

export async function withDatabase(operation) {
  const client = new pg.Client({
    connectionString: cmsUrl(),
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock(73190506)");
    return await operation(client);
  } finally {
    await client.end();
  }
}
