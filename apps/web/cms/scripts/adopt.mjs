import { execFileSync } from "node:child_process";
import pg from "pg";
import { cmsUrl, withDatabase } from "./database.mjs";

// Read-only schema dumps of BOTH databases; this command never creates or restores one.
function schemaDump(value) {
  const url = new URL(value);
  const output = execFileSync(
    "pg_dump",
    ["--schema-only", "--no-owner", "--no-privileges", "--no-comments"],
    {
      env: {
        ...process.env,
        PGHOST: url.hostname,
        PGPORT: url.port || "5432",
        PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  return output
    .split("\n")
    .filter(
      (line) =>
        !(
          line.startsWith("--") ||
          line.startsWith("\\restrict ") ||
          line.startsWith("\\unrestrict ")
        ) && line.trim()
    )
    .join("\n");
}

const reference = process.env.CMS_BASELINE_REFERENCE_URL;
if (!reference)
  throw new Error(
    "CMS_BASELINE_REFERENCE_URL must point to an isolated, freshly migrated reference database"
  );
// Check the host prerequisite before opening either database or taking a lock.
try {
  execFileSync("pg_dump", ["--version"], { stdio: "pipe", timeout: 10_000 });
} catch (error) {
  throw new Error(
    error.code === "ENOENT"
      ? "pg_dump is not installed or is not on PATH. CMS adoption needs a host PostgreSQL client matching the server major version. No databases were changed."
      : "pg_dump could not run on this host. Check pg_dump --version. No databases were changed."
  );
}
let stage = "connecting to the target database and acquiring its lock";
try {
  await withDatabase(async (client) => {
    const referenceClient = new pg.Client({
      connectionString: reference,
      connectionTimeoutMillis: 10_000,
    });
    try {
      stage = "connecting to the reference database";
      await referenceClient.connect();
      stage = "checking that the reference is a separate database";
      const identity =
        "SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port";
      const targetIdentity = (await client.query(identity)).rows[0];
      const referenceIdentity = (await referenceClient.query(identity)).rows[0];
      if (JSON.stringify(targetIdentity) === JSON.stringify(referenceIdentity))
        throw new Error("Reference must be isolated from the target");
      stage =
        "checking that the reference contains exactly the initial migration";
      const initial = "20260906_203710_initial";
      const referenceMigrations = await referenceClient.query(
        "SELECT name FROM payload_migrations ORDER BY id"
      );
      if (
        referenceMigrations.rowCount !== 1 ||
        referenceMigrations.rows[0].name !== initial
      )
        throw new Error("Reference must contain exactly the initial migration");
      stage =
        "dumping the target schema (check client/server version compatibility and database permissions)";
      const targetSchema = schemaDump(cmsUrl());
      stage =
        "dumping the reference schema (check client/server version compatibility and database permissions)";
      const referenceSchema = schemaDump(reference);
      stage =
        "comparing schemas: the target differs from the initial migration";
      if (targetSchema !== referenceSchema)
        throw new Error(
          "CMS schema differs from initial migration; no baseline recorded"
        );
      stage = "checking target migration history before adoption";
      await client.query("BEGIN");
      const recorded = await client.query(
        "SELECT name, batch FROM payload_migrations"
      );
      if (recorded.rows.some((row) => Number(row.batch) !== -1))
        throw new Error("CMS already has migration history; review required");
      stage = "recording the initial migration";
      await client.query("DELETE FROM payload_migrations WHERE batch = -1");
      await client.query(
        "INSERT INTO payload_migrations(name, batch) VALUES ($1, 1)",
        [initial]
      );
      await client.query("COMMIT");
      console.log("Matching CMS schema adopted; content preserved");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
        // Preserve the original failure if the disconnected client cannot roll back.
      });
      throw error;
    } finally {
      await referenceClient.end();
    }
  });
} catch {
  // Only report stages we control; driver and subprocess errors may contain credentials.
  throw new Error(
    `CMS adoption failed while ${stage}. Adoption did not finish; do not migrate until this is resolved.`
  );
}
