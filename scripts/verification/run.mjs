import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LOOPBACK_PORT = /^127\.0\.0\.1:(\d+)$/;
const SERVICES = {
  backend: ["backend-db", "redis"],
  storage: ["storage-db"],
  release: ["backend-db", "storage-db", "redis"],
};
const root = fileURLToPath(new URL("../../", import.meta.url));
const mode = process.argv[2];
if (!["backend", "storage", "release"].includes(mode)) {
  throw new Error("Expected backend, storage or release");
}
const project = `grenmet-verify-${randomUUID().replaceAll("-", "")}`;
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "scripts/verification/compose.yml",
];
function run(command, args, env = process.env, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? result.error?.code})`
    );
  }
  return result.stdout?.trim();
}
function port(service, containerPort) {
  const address = run(
    "docker",
    [...compose, "port", service, containerPort],
    process.env,
    true
  );
  const match = LOOPBACK_PORT.exec(address ?? "");
  if (!match) throw new Error("Expected a loopback-only test service port");
  return match[1];
}
let started = false;
function cleanup() {
  if (!started) return;
  started = false;
  run("docker", [...compose, "down", "--volumes", "--remove-orphans"]);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    try {
      cleanup();
    } finally {
      process.exit(1);
    }
  });
}
try {
  if (existsSync("/.dockerenv")) {
    throw new Error(
      "Run managed verification on the host, outside the devcontainer."
    );
  }
  run("docker", ["info"], process.env, true);
  if (mode !== "backend") run("psql", ["--version"]);
  if (mode === "release") {
    run("pnpm", ["verify:quick"]);
    run("pnpm", ["check:drift"]);
    run("pnpm", ["docs:check-links"]);
    run("pnpm", ["test:guardrails"]);
    run("pnpm", ["test:delivery"]);
  }
  console.log(`Disposable test project: ${project}`);
  started = true;
  const services = SERVICES[mode];
  run("docker", [
    ...compose,
    "up",
    "-d",
    "--wait",
    "--wait-timeout",
    "120",
    ...services,
  ]);
  if (mode !== "storage") {
    run("bash", ["scripts/verification/backend.sh"], {
      ...process.env,
      ENVIRONMENT: "local",
      POSTGRES_SERVER: "127.0.0.1",
      POSTGRES_PORT: port("backend-db", "5432"),
      POSTGRES_USER: "verification",
      POSTGRES_PASSWORD: "test-only-password",
      POSTGRES_DB: "verification",
      REDIS_URL: `redis://127.0.0.1:${port("redis", "6379")}/0`,
      SECRET_KEY: "verification-only-secret-at-least-32-characters",
      FIRST_SUPERUSER: "admin@example.test",
      FIRST_SUPERUSER_PASSWORD: "verification-only-password",
      PROJECT_NAME: "Disposable verification",
    });
  }
  if (mode !== "backend") {
    run("bash", ["scripts/verification/storage.sh"], {
      ...process.env,
      STORAGE_TEST_POSTGRES_URL: `postgresql://verification:test-only-password@127.0.0.1:${port("storage-db", "5432")}/postgres`,
    });
  }
  console.log(
    `PASS: ${mode} verification. Deployment and live integrations are separate checks.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
} finally {
  cleanup();
}
