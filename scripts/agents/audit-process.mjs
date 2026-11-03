import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";

// Tests receive a minimal environment; no application or GitHub credentials.
export function testEnvironment(env = process.env) {
  const allowed = [
    "PATH",
    "LANG",
    "LC_ALL",
    "SHELL",
    "XDG_CACHE_HOME",
    "UV_PYTHON_INSTALL_DIR",
    "SSL_CERT_FILE",
  ];
  const result = Object.fromEntries(
    allowed.filter((key) => env[key]).map((key) => [key, env[key]])
  );
  return {
    ...result,
    HOME: "/nonexistent",
    CI: "true",
    NO_COLOR: "1",
    TURBO_CONCURRENCY: "2",
    PROJECT_NAME: "Disposable audit",
    ENVIRONMENT: "local",
    TEST_WORKERS: "2",
    SECRET_KEY: "audit-test-only-secret-at-least-32-characters",
    FIRST_SUPERUSER: "admin@example.com",
    FIRST_SUPERUSER_PASSWORD: "audit-test-only-password",
    POSTGRES_SERVER: "127.0.0.1",
    POSTGRES_USER: "verification",
    POSTGRES_PASSWORD: "test-only-password",
    POSTGRES_DB: "verification",
    REDIS_URL: "redis://127.0.0.1:6379/15",
    UV_PROJECT_ENVIRONMENT: ".venv",
  };
}
export function command(
  argv,
  {
    cwd,
    env = process.env,
    timeout = 60_000,
    logPath,
    captureLimit = 2_000_000,
    spawnProcess = spawn,
  } = {}
) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let fd;
    let logBytes = 0;
    const logLimit = 1_000_000;
    if (logPath) {
      fd = openSync(logPath, "wx", 0o600);
    }
    const child = spawnProcess(argv[0], argv.slice(1), {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let timedOut = false;
    const kill = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        /* The failed probe or exited process is handled by its result. */
      }
    };
    let hardKill;
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      hardKill = setTimeout(() => kill("SIGKILL"), 10_000);
    }, timeout);
    const collect = (stream) => (chunk) => {
      if (fd !== undefined && logBytes < logLimit) {
        const bounded = chunk.subarray(0, logLimit - logBytes);
        writeSync(fd, bounded);
        logBytes += bounded.length;
      }
      if (stream === "stdout") stdout = (stdout + chunk).slice(-captureLimit);
      else stderr = (stderr + chunk).slice(-captureLimit);
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(hardKill);
      if (fd !== undefined) {
        if (logBytes >= logLimit)
          writeSync(
            fd,
            `\\n[Private log truncated; final output follows]\\n${stdout.slice(-100_000)}${stderr.slice(-100_000)}`
          );
        closeSync(fd);
      }
      resolve({ code: timedOut ? 124 : code, stdout, stderr, timedOut });
    };
    child.on("error", () => finish(127));
    child.on("close", (code) => finish(code ?? 125));
  });
}
export function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}
export function evidencePath(directory, id, attempt) {
  return join(directory, `${id.replace(/[^a-z0-9_-]/giu, "_")}-${attempt}.log`);
}
