import { spawn } from "node:child_process";
import { withDatabase } from "./database.mjs";

await withDatabase(async (client) => {
  const table = await client.query(
    "SELECT to_regclass('public.payload_migrations') AS name"
  );
  if (table.rows[0].name) {
    const pushed = await client.query(
      "SELECT 1 FROM payload_migrations WHERE batch = -1"
    );
    if (pushed.rowCount)
      throw new Error(
        "CMS schema-push database requires db:adopt with a matching isolated migration reference"
      );
  } else {
    const existing = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' LIMIT 1"
    );
    if (existing.rowCount)
      throw new Error("Unmarked CMS schema requires review before migration");
  }
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/payload/bin.js", "migrate"],
      {
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
      }
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("CMS migration failed"))
    );
  });
});
