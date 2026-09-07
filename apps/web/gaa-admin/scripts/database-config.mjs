const domains = new Set(["wxwatch", "wxproducts", "transport", "janitorial"]);

export function databaseConfig(domain, environment = process.env) {
  if (!domains.has(domain)) {
    throw new Error("Unknown database domain");
  }
  const prefix = domain.toUpperCase();
  const key = `${prefix}_DATABASE_URL`;
  const value = environment[key];
  if (!value) {
    throw new Error(
      `${key} is required; generic database fallbacks are disabled`
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a PostgreSQL URL`);
  }
  const expected =
    environment[`${prefix}_DB_NAME`] ??
    `${domain}${environment.ENVIRONMENT === "staging" ? "_staging" : ""}`;
  if (
    !(
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.hostname &&
      url.username
    ) ||
    decodeURIComponent(url.pathname.slice(1)) !== expected ||
    [
      "app",
      "app_test",
      "app_prod",
      "app_staging",
      "postgres",
      "template0",
      "template1",
    ].includes(expected)
  ) {
    throw new Error(`${key} does not target the configured domain database`);
  }
  return { connectionString: value, connectionTimeoutMillis: 10_000 };
}
