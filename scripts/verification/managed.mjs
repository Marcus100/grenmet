import { randomUUID } from "node:crypto";

const LOOPBACK_PORT = /^127\.0\.0\.1:(\d+)$/;
const SERVICES = {
  backend: ["backend-db", "redis"],
  storage: ["storage-db"],
  release: ["backend-db", "storage-db", "redis"],
};

// The runner is injected so lifecycle tests exercise the real orchestration
// without requiring Docker or touching an existing service.
export async function verifyManaged(mode, { run, inContainer, env, log }) {
  if (!Object.hasOwn(SERVICES, mode))
    throw new Error("Expected backend, storage or release");
  if (inContainer)
    throw new Error(
      "Run managed verification on the host, outside the devcontainer."
    );
  const project = `grenmet-verify-${randomUUID().replaceAll("-", "")}`;
  const compose = [
    "compose",
    "-p",
    project,
    "-f",
    "scripts/verification/compose.yml",
  ];
  async function port(service, containerPort) {
    const address = await run(
      "docker",
      [...compose, "port", service, containerPort],
      env,
      true
    );
    const match = LOOPBACK_PORT.exec(address ?? "");
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65_535) {
      throw new Error("Expected a loopback-only test service port");
    }
    return match[1];
  }
  await run("docker", ["info"], env, true);
  await run("pnpm", ["--version"], env, true);
  if (mode !== "storage") await run("uv", ["--version"], env, true);
  if (mode !== "backend") await run("psql", ["--version"], env, true);
  if (mode === "release") {
    for (const check of [
      "verify:quick",
      "check:drift",
      "docs:check-links",
      "docs:check-portfolio",
      "test:guardrails",
      "test:delivery",
      "test:verification",
    ]) {
      await run("pnpm", [check], env);
    }
  }
  log(`Disposable test project: ${project}`);
  let failure;
  try {
    await run(
      "docker",
      [
        ...compose,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "120",
        ...SERVICES[mode],
      ],
      env
    );
    if (mode !== "storage") {
      await run("bash", ["scripts/verification/backend.sh"], {
        ...env,
        ENVIRONMENT: "local",
        POSTGRES_SERVER: "127.0.0.1",
        POSTGRES_PORT: await port("backend-db", "5432"),
        POSTGRES_USER: "verification",
        POSTGRES_PASSWORD: "test-only-password",
        POSTGRES_DB: "verification",
        VERIFY_DB_BASE: "verification",
        VERIFY_RUN_ID: randomUUID().replaceAll("-", ""),
        REDIS_URL: `redis://127.0.0.1:${await port("redis", "6379")}/0`,
        SECRET_KEY: "verification-only-secret-at-least-32-characters",
        FIRST_SUPERUSER: "admin@example.com",
        FIRST_SUPERUSER_PASSWORD: "verification-only-password",
        PROJECT_NAME: "Disposable verification",
      });
    }
    if (mode !== "backend") {
      await run("bash", ["scripts/verification/storage.sh"], {
        ...env,
        STORAGE_TEST_POSTGRES_URL: `postgresql://verification:test-only-password@127.0.0.1:${await port("storage-db", "5432")}/postgres`,
      });
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      // Even a failed `up` may have created resources. Cleanup is restricted
      // to this UUID project, and is allowed to run after cancellation.
      await run(
        "docker",
        [...compose, "down", "--volumes", "--remove-orphans"],
        env,
        false,
        true
      );
    } catch (error) {
      failure = new AggregateError(
        failure ? [failure, error] : [error],
        `Cleanup failed for ${project}; inspect only this project.`
      );
    }
  }
  if (failure) throw failure;
  log(
    `PASS: ${mode} verification. Deployment and live integrations are separate checks.`
  );
}
