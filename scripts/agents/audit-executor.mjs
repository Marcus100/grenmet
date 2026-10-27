import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { verifyManaged } from "../verification/managed.mjs";
import {
  command,
  privateDirectory,
  testEnvironment,
} from "./audit-process.mjs";
import { buildAuditSandboxArgs } from "./audit-sandbox.mjs";

const TRUSTED_ROOT = resolve(import.meta.dirname, "../..");
// Turbo launches the package manager again for each task. Host pnpm wrappers
// are hidden and may depend on the host HOME, so supply an isolated wrapper.
export function preparePnpmShim(
  root,
  home,
  corepack = join(dirname(process.execPath), "corepack")
) {
  if (!realpathSync(home).startsWith(`${realpathSync(root)}/`))
    throw new Error("Pnpm shim must remain in its own checkout");
  const bin = mkdtempSync(join(home, "bin-"));
  const quoted = "'" + corepack.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh\nexec ${quoted} pnpm "$@"\n`, {
    mode: 0o755,
    flag: "wx",
  });
  return bin;
}
export function testExecutor(
  root,
  commonGitDir,
  run = command,
  sandbox = buildAuditSandboxArgs
) {
  const home = privateDirectory(join(root, "node_modules/.cache/audit-home"));
  const bin = preparePnpmShim(root, home);
  const isolated = async (argv, options) => {
    const unit = `grenmet-audit-check-${randomUUID().replaceAll("-", "")}`;
    const args = sandbox(argv, {
      root,
      home,
      cwd: options.cwd,
      env: {
        ...options.env,
        HOME: home,
        PATH: `${bin}:${options.env?.PATH ?? "/usr/bin:/bin"}`,
      },
      commonGitDir,
      timeout: options.timeout,
    });
    args.splice(6, 0, `--unit=${unit}`);
    const result = await run(["systemd-run", ...args], {
      ...options,
      env: process.env,
    });
    if (result.code !== 0)
      await run(["systemctl", "--user", "stop", unit], { timeout: 60_000 });
    return result;
  };
  return async (argv, options) => {
    if (
      !(
        argv[0] === "node" &&
        argv[1] === "scripts/verification/run.mjs" &&
        argv[2] === "backend"
      )
    )
      return isolated(argv, options);
    let sequence = 0;
    const output = [];
    try {
      await verifyManaged("backend", {
        inContainer: existsSync("/.dockerenv"),
        env: {
          ...testEnvironment(),
          HOME: home,
          UV_PROJECT_ENVIRONMENT: join(root, ".venv"),
        },
        log: (text) => output.push(text),
        run: async (cmd, args, env, capture) => {
          const settings = {
            ...options,
            cwd: root,
            env,
            logPath: `${options.logPath}.${++sequence}`,
          };
          const trustedArgs =
            cmd === "docker"
              ? args.map((value) =>
                  value === "scripts/verification/compose.yml"
                    ? join(TRUSTED_ROOT, value)
                    : value
                )
              : args;
          const result =
            cmd === "bash"
              ? await isolated([cmd, ...args], settings)
              : await run([cmd, ...trustedArgs], {
                  ...settings,
                  cwd: TRUSTED_ROOT,
                  timeout: 180_000,
                });
          output.push(result.stdout);
          if (result.code !== 0)
            throw new Error("Disposable backend verification failed");
          return capture ? result.stdout.trim() : result.stdout;
        },
      });
      return { code: 0, stdout: output.join("\n"), stderr: "" };
    } catch {
      return {
        code: 1,
        stdout: output.join("\n"),
        stderr: "Disposable backend verification failed.",
      };
    }
  };
}
