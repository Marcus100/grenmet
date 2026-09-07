import { spawn } from "node:child_process";

// Reads the existing local configuration; never writes it or displays its values.
process.loadEnvFile(
  new URL("../../../../infra/docker/.env.local", import.meta.url)
);
const url = new URL("postgresql://localhost/postgres");
url.hostname = process.argv[2] ?? "127.0.0.1";
url.port = "5432";
url.username = process.env.POSTGRES_USER ?? "";
url.password = process.env.POSTGRES_PASSWORD ?? "";
if (!(url.username && url.password))
  throw new Error("Local PostgreSQL credentials are required");
const child = spawn(
  process.execPath,
  [
    "--test",
    new URL(
      "../../../../scripts/production/runtime-role.integration.test.mjs",
      import.meta.url
    ).pathname,
    new URL("./storage.integration.test.mjs", import.meta.url).pathname,
    new URL("../../cms/scripts/storage.integration.test.mjs", import.meta.url)
      .pathname,
  ],
  {
    env: {
      ...process.env,
      STORAGE_TEST_POSTGRES_URL: url.toString(),
      RUNTIME_ROLE_TEST_REQUIRED: "true",
    },
    stdio: "inherit",
  }
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
