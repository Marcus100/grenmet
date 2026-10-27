import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const OWN_CHECKOUT = /own checkout/;

import { testExecutor } from "./audit-executor.mjs";
import { pruneEvidence } from "./audit-retention.mjs";
import { buildAuditSandboxArgs } from "./audit-sandbox.mjs";

test("test sandbox hides host homes, runtime sockets and Windows files while restoring the resolver", () => {
  const args = buildAuditSandboxArgs(["node", "--version"], {
    root: "/tmp/owned",
    cwd: "/tmp/owned/apps",
    home: "/tmp/owned/node_modules/.cache/audit-home",
    env: { HOME: "/home/host", PATH: "/usr/bin" },
    nodeRuntime: "/opt/node",
    uv: { real: "/opt/uv", path: "/usr/bin/uv" },
    resolver: "/mnt/wsl/resolv.conf",
    commonGitDir: "/tmp/common",
  });
  for (const value of [
    "--property=ProtectHome=tmpfs",
    "--property=ProtectSystem=strict",
    "--property=TemporaryFileSystem=/mnt:ro",
    "--property=TemporaryFileSystem=/run:ro",
    "--property=BindReadOnlyPaths=/mnt/wsl/resolv.conf",
    "--property=BindReadOnlyPaths=/tmp/common",
  ])
    assert.ok(args.includes(value));
  assert.ok(!args.includes("HOME=/home/host"));
  assert.ok(args.includes("-i"));
  assert.throws(
    () =>
      buildAuditSandboxArgs(["node"], {
        root: "/tmp/owned",
        home: "/tmp/elsewhere",
        env: {},
        uv: { real: "/opt/uv", path: "/bin/uv" },
      }),
    OWN_CHECKOUT
  );
});
test("backend lifecycle stays outside the sandbox while the source test command is isolated", async () => {
  const root = mkdtempSync(join(tmpdir(), "audit-executor-"));
  const calls = [];
  try {
    const execute = testExecutor(
      root,
      "/tmp/common",
      (argv, options) => {
        calls.push({ argv, options });
        if (argv[0] === "docker" && argv.includes("port"))
          return { code: 0, stdout: "127.0.0.1:34567", stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      },
      (argv, options) =>
        buildAuditSandboxArgs(argv, {
          ...options,
          uv: { real: "/opt/uv", path: "/usr/bin/uv" },
          resolver: "/mnt/wsl/resolv.conf",
        })
    );
    const result = await execute(
      ["node", "scripts/verification/run.mjs", "backend"],
      { cwd: root, env: {}, timeout: 30_000, logPath: join(root, "test.log") }
    );
    assert.equal(result.code, 0);
    assert.ok(
      calls.some(
        (call) => call.argv[0] === "docker" && call.argv.includes("up")
      )
    );
    assert.ok(!calls.some((call) => call.argv[0] === "pnpm"));
    assert.ok(
      calls.some(
        (call) =>
          call.argv[0] === "systemd-run" &&
          call.argv.includes("pnpm") &&
          call.argv.includes("--version")
      )
    );
    for (const host of calls.filter(
      (call) => call.argv[0] === "docker" || call.argv[0] === "uv"
    )) {
      assert.equal(host.options.env.HOME, homedir());
      assert.equal(host.options.env.DOCKER_CONFIG, join(homedir(), ".docker"));
      assert.ok(
        !(host.options.env?.PATH ?? "")
          .split(":")
          .some((directory) => directory.startsWith(`${root}/`))
      );
    }
    const sandbox = calls.find(
      (call) =>
        call.argv[0] === "systemd-run" &&
        call.argv.includes("scripts/verification/backend.sh")
    );
    assert.ok(sandbox);
    for (const call of calls.filter(
      (entry) => entry.argv[0] === "docker" && entry.argv.includes("compose")
    )) {
      const config = call.argv[call.argv.indexOf("-f") + 1];
      assert.ok(config.endsWith("/scripts/verification/compose.yml"));
      assert.ok(!config.startsWith(root));
      assert.notEqual(call.options.cwd, root);
    }
    assert.ok(sandbox.argv.includes("scripts/verification/backend.sh"));
    assert.ok(
      calls.some(
        (call) => call.argv[0] === "docker" && call.argv.includes("down")
      )
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("retention removes only recognized owned evidence and preserves unfamiliar material", () => {
  const root = mkdtempSync(join(tmpdir(), "audit-retention-"));
  const create = (name, marked) => {
    const path = join(root, name);
    mkdirSync(path);
    if (marked)
      writeFileSync(
        join(path, "owned-run.json"),
        JSON.stringify({
          owner: "grenmet-advisory-audit",
          version: 1,
          createdAt: "2020-01-01T00:00:00Z",
        })
      );
    writeFileSync(join(path, "observations.json"), "{}");
    return path;
  };
  try {
    create(
      "2020-01-01T00-00-00.000Z-12345678-1234-1234-1234-123456789012",
      true
    );
    const unrecognized = create(
      "2020-01-01T00-00-01.000Z-12345678-1234-1234-1234-123456789012",
      true
    );
    writeFileSync(join(unrecognized, "private-material.txt"), "preserve");
    create(
      "2020-01-01T00-00-02.000Z-12345678-1234-1234-1234-123456789012",
      false
    );
    assert.equal(pruneEvidence(root, Date.now()), 1);
    assert.equal(
      readFileSync(join(unrecognized, "private-material.txt"), "utf8"),
      "preserve"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pnpm uses login runtime corepack despite a hidden HOME-dependent wrapper", () => {
  const args = buildAuditSandboxArgs(["pnpm", "install", "--frozen-lockfile"], {
    root: "/tmp/owned",
    home: "/tmp/owned/home",
    env: { PATH: "/home/user/.local/bin:/usr/bin" },
    nodeRuntime: "/home/user/.nvm/versions/node/v24",
    uv: { real: "/opt/uv", path: "/usr/bin/uv" },
    resolver: "/etc/resolv.conf",
  });
  assert.deepEqual(args.slice(-4), [
    "/home/user/.nvm/versions/node/v24/bin/corepack",
    "pnpm",
    "install",
    "--frozen-lockfile",
  ]);
  assert.ok(
    args.includes(
      "PATH=/home/user/.nvm/versions/node/v24/bin:/home/user/.local/bin:/usr/bin"
    )
  );
  assert.ok(args.includes("HOME=/tmp/owned/home"));
});

import { spawnSync } from "node:child_process";
import { preparePnpmShim } from "./audit-executor.mjs";

test("nested pnpm uses the disposable shim with the selected corepack and preserves arguments", () => {
  const root = mkdtempSync(join(tmpdir(), "audit-pnpm-child-"));
  try {
    const home = join(root, "home");
    mkdirSync(home);
    const corepack = join(root, "corepack's runtime");
    writeFileSync(corepack, '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
      mode: 0o755,
    });
    const bin = preparePnpmShim(root, home, corepack);
    const child = spawnSync(
      join(bin, "pnpm"),
      ["run", "argument with spaces"],
      { env: { PATH: "/usr/bin:/bin", HOME: home }, encoding: "utf8" }
    );
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(child.stdout.trim().split("\n"), [
      "pnpm",
      "run",
      "argument with spaces",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
