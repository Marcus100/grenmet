import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const project = "grenmet-staging";
function container(service, overrides = {}) {
  return {
    Id: service,
    Name: `/${project}-${service}-1`,
    Image: "sha256:local",
    Config: {
      Image: "ghcr.io/example/web:old",
      Env: ["PASSWORD=never-print-this"],
      Labels: {
        "com.docker.compose.project": project,
        "com.docker.compose.service": service,
        "traefik.enable": "true",
        "traefik.http.routers.legacy.rule": "Host(`old.example.test`)",
        "traefik.http.middlewares.auth.basicauth.users": "never-print-this",
      },
    },
    State: { Status: "running" },
    HostConfig: { RestartPolicy: { Name: "always" } },
    Mounts: [
      { Type: "volume", Name: "uploads", Destination: "/data", RW: true },
    ],
    NetworkSettings: { Networks: { core: {} } },
    ...overrides,
  };
}

function run(fixture, args = ["--services-only", "--project", project]) {
  const root = mkdtempSync(join(tmpdir(), "service-inventory-"));
  try {
    writeFileSync(join(root, "fixture.json"), JSON.stringify(fixture));
    writeFileSync(
      join(root, "docker"),
      `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.INVENTORY_CALLS, JSON.stringify(args) + '\\n');
const f = JSON.parse(fs.readFileSync(process.env.INVENTORY_FIXTURE, 'utf8'));
if (f.fail) { console.error('never-print-this'); process.exit(1); }
if (f.malformed) { console.log('not-json'); process.exit(0); }
if (args[0] === 'compose') console.log(JSON.stringify({services: f.services ?? {api: {}, 'web-docs': {}}}));
else if (args[0] === 'ps') console.log(f.containers.map(c => c.Id).join('\\n'));
else if (args[0] === 'container' && args[1] === 'inspect') console.log(JSON.stringify([f.containers.find(c => c.Id === args[2])]));
else if (args[0] === 'image' && args[1] === 'inspect') console.log(JSON.stringify([{RepoDigests: f.digests ?? ['ghcr.io/example/web@sha256:immutable']} ]));
else process.exit(2);
`,
      { mode: 0o700 }
    );
    const result = spawnSync(
      "python3",
      ["scripts/production/inventory.py", ...args],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          INVENTORY_CALLS: join(root, "calls"),
          INVENTORY_FIXTURE: join(root, "fixture.json"),
        },
      }
    );
    let calls = [];
    try {
      calls = readFileSync(join(root, "calls"), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
    } catch {
      // Argument validation can exit before invoking Docker.
    }
    return { ...result, calls };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("reports current and legacy ownership, digests, routes and writable data without secrets or mutations", () => {
  const result = run({
    containers: [
      container("api"),
      container("web-hurricaneplan"),
      container("web-spicewx"),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.unexpected_services, [
    "web-hurricaneplan",
    "web-spicewx",
  ]);
  assert.equal(report.containers[0].classification, "current");
  const legacy = report.containers[1];
  assert.equal(legacy.legacy_service, true);
  assert.equal(legacy.restart_policy, "always");
  assert.equal(legacy.mounts[0].RW, true);
  assert.deepEqual(legacy.networks, ["core"]);
  assert.deepEqual(legacy.image_digests, [
    "ghcr.io/example/web@sha256:immutable",
  ]);
  assert.equal(
    legacy.routing["traefik.http.routers.legacy.rule"],
    "Host(`old.example.test`)"
  );
  assert.ok(!result.stdout.includes("never-print-this"));
  assert.equal(result.calls.filter((c) => c[0] === "image").length, 1);
  assert.ok(
    result.calls.some((c) =>
      c.includes(`label=com.docker.compose.project=${project}`)
    )
  );
  assert.ok(result.calls[0].includes("--no-env-resolution"));
  assert.ok(
    result.calls.every(
      (c) =>
        (c[0] === "compose" && c.includes("config")) ||
        c[0] === "ps" ||
        (["container", "image"].includes(c[0]) && c[1] === "inspect")
    )
  );
});

test("unknown or missing service labels require review; they are not declared legacy", () => {
  const unknown = container("sidecar");
  const missing = container("unlabelled");
  missing.Config.Labels["com.docker.compose.service"] = undefined;
  const report = JSON.parse(
    run({ containers: [unknown, missing], digests: [] }).stdout
  );
  assert.deepEqual(report.unexpected_services, [
    "<missing-service-label>",
    "sidecar",
  ]);
  assert.ok(
    report.containers.every(
      (c) =>
        !c.legacy_service && c.classification === "unexpected-review-required"
    )
  );
  assert.deepEqual(report.containers[0].image_digests, []);
});

test("empty Docker project is reported as an empty snapshot", () => {
  assert.deepEqual(JSON.parse(run({ containers: [] }).stdout).containers, []);
});

test("wrong ownership, unavailable Docker, malformed data and empty configuration fail without partial output", () => {
  const wrong = container("web-spicewx");
  wrong.Config.Labels["com.docker.compose.project"] = "grenmet";
  for (const fixture of [
    { containers: [wrong] },
    { fail: true },
    { malformed: true },
    { services: {}, containers: [] },
  ]) {
    const result = run(fixture);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes("never-print-this"));
    assert.ok(result.stderr.includes("Inventory failed"));
  }
});

test("requires an explicit supported project and rejects ambiguous modes before Docker access", () => {
  for (const args of [
    ["--services-only"],
    ["--project", project],
    ["--services-only", "--project", "other"],
    ["--services-only", "--project", project, "--configured-only"],
  ]) {
    const result = run({}, args);
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.calls, []);
  }
});
