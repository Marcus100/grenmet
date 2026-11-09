import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyBump,
  bump,
  check,
  describe,
  inventory,
  mirrorReference,
  parseReference,
  plan,
  scanFile,
  scanRoot,
} from "./base-images.mjs";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;
const C = `sha256:${"c".repeat(64)}`;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOLLAR = "$";
/** `${name}` without a template placeholder in a plain string (the linter flags those). */
const variable = (name) => [DOLLAR, "{", name, "}"].join("");
const INVALID_OWNER = /Invalid registry owner/u;
const USE_MIRROR = /use ghcr\.io\/marcus100\/base\/node:24@sha256:a+/u;
const UNEXPECTED_DIGEST = /Unexpected digest/u;
const MIRROR_TARGET = /^ghcr\.io\/marcus100\/base\/[a-z0-9._/-]+:[\w.-]+$/u;
const HUB_SOURCE =
  /^docker\.io\/[a-z0-9._/-]+(?::[\w.-]+|@sha256:[0-9a-f]{64})$/u;

test("parseReference normalises Docker Hub shorthand", () => {
  assert.deepEqual(parseReference(`node:24-alpine@${A}`), {
    registry: "docker.io",
    repository: "library/node",
    tag: "24-alpine",
    digest: A,
  });
  assert.equal(
    parseReference("postgis/postgis:17-3.5").repository,
    "postgis/postgis"
  );
  assert.equal(
    parseReference("index.docker.io/library/redis").registry,
    "docker.io"
  );
  assert.equal(
    parseReference("ghcr.io/astral-sh/uv:0.12.24").registry,
    "ghcr.io"
  );
  assert.equal(
    parseReference("localhost:5000/x/y:1").registry,
    "localhost:5000"
  );
  assert.equal(parseReference("localhost:5000/x/y:1").tag, "1");
});

test("parseReference rejects malformed references", () => {
  assert.equal(parseReference("node@sha256:short"), null);
  assert.equal(parseReference("Node:24"), null);
  assert.equal(parseReference("node:bad tag"), null);
  assert.equal(parseReference(""), null);
});

test("describe maps Docker Hub to the mirror with the same digest", () => {
  const library = describe(`docker.io/library/node:24-alpine@${A}`);
  assert.equal(library.mirror, "ghcr.io/marcus100/base/node");
  assert.equal(
    mirrorReference(library),
    `ghcr.io/marcus100/base/node:24-alpine@${A}`
  );
  assert.equal(library.onMirror, false);

  const namespaced = describe(`postgis/postgis:17-3.5@${B}`);
  assert.equal(namespaced.mirror, "ghcr.io/marcus100/base/postgis/postgis");
  assert.equal(namespaced.upstream, "docker.io/postgis/postgis");
});

test("describe maps the mirror back to Docker Hub", () => {
  const library = describe(`ghcr.io/marcus100/base/node:24-alpine@${A}`);
  assert.equal(library.upstream, "docker.io/library/node");
  assert.equal(library.onMirror, true);
  assert.equal(
    describe("ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1").upstream,
    "docker.io/moby/buildkit"
  );
});

test("describe lower-cases nothing silently and ignores other registries", () => {
  assert.equal(describe("ghcr.io/astral-sh/uv:0.12.24"), null);
  assert.equal(describe("ghcr.io/marcus100/barrelsgd-web-auth:sha-1"), null);
  assert.equal(describe("quay.io/org/img:1"), null);
  assert.throws(() => describe("node:24", "Bad Owner"), INVALID_OWNER);
  assert.equal(
    describe(`ghcr.io/other/base/node@${A}`, "other").mirror,
    "ghcr.io/other/base/node"
  );
});

test("scanFile reads Dockerfile stages, aliases, COPY --from and ARG", () => {
  const text = [
    "# syntax=docker/dockerfile:1",
    `FROM node:24-alpine@${A} AS base`,
    "FROM base AS builder",
    "FROM scratch AS empty",
    "ARG IMAGE=node:24",
    `FROM ${variable("IMAGE")} AS dynamic`,
    "COPY --from=builder /app /app",
    "COPY --from=0 /x /x",
    `COPY --from=ghcr.io/astral-sh/uv:0.12.24@${B} /uv /bin/uv`,
    `COPY --from=redis:7-alpine@${C} /usr/local/bin/redis-cli /bin/`,
    `FROM --platform=linux/amd64 python:3.14-slim@${B}`,
  ].join("\n");
  const items = scanFile("apps/web/x/Dockerfile", text);
  assert.deepEqual(
    items.map((item) => [item.reference, item.context, item.line]),
    [
      [`node:24-alpine@${A}`, "from", 2],
      [`redis:7-alpine@${C}`, "copy", 10],
      [`python:3.14-slim@${B}`, "from", 11],
    ]
  );
});

test("scanFile reads workflow service containers, container jobs and buildkit images", () => {
  const text = [
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    services:",
    "      postgres:",
    `        image: postgres:17@${A} # pinned`,
    "        credentials:",
    `          username: ${variable("{ secrets.DOCKERHUB_USERNAME }")}`,
    "      redis:",
    '        image: "redis:7-alpine"',
    "    steps:",
    "      - uses: some/action@v1",
    "        with:",
    "          image: test-image:latest",
    "      - uses: docker/setup-buildx-action@v4",
    "        with:",
    "          driver-opts: image=ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1",
    "  other:",
    "    container: node:24",
    "  dynamic:",
    "    services:",
    "      db:",
    `        image: ${variable("{ matrix.image }")}`,
  ].join("\n");
  const items = scanFile(".github/workflows/ci.yml", text);
  assert.deepEqual(
    items.map((item) => [item.reference, item.context]),
    [
      [`postgres:17@${A}`, "service"],
      ["redis:7-alpine", "service"],
      ["ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1", "driver"],
      ["node:24", "service"],
    ]
  );
});

test("scanFile keeps only pinned or mirrored compose images", () => {
  const text = [
    "services:",
    "  api:",
    "    image: grenmet-api:local",
    "  redis:",
    "    image: redis:7-alpine",
    "  adminer:",
    `    image: adminer:6.1.2@${A}`,
    "  tool:",
    `    image: ${variable("REGISTRY")}/${variable("IMAGE_NAME")}:${variable("TAG")}`,
    "  mirrored:",
    "    image: ghcr.io/marcus100/base/traefik:v3.7",
  ].join("\n");
  const items = scanFile("infra/docker/docker-compose.deploy.yml", text);
  assert.deepEqual(
    items.map((item) => item.reference),
    [`adminer:6.1.2@${A}`, "ghcr.io/marcus100/base/traefik:v3.7"]
  );
});

test("scanFile ignores files that cannot hold images", () => {
  assert.deepEqual(scanFile("README.md", "FROM node:24@"), []);
  assert.deepEqual(
    scanFile("docs/x.yml", "services:\n  a:\n    image: node:24\n"),
    []
  );
});

test("inventory merges before and after the switch into distinct entries", () => {
  const items = [
    ...scanFile("a/Dockerfile", `FROM node:24-alpine@${A}`),
    ...scanFile("b/Dockerfile", `FROM node:24-alpine@${A}`),
    ...scanFile(
      "c/Dockerfile",
      `FROM ghcr.io/marcus100/base/node:24-alpine@${A}`
    ),
    ...scanFile("d/Dockerfile", `FROM node:24-alpine@${B}`),
  ];
  const entries = inventory(items);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].digest, A);
  assert.deepEqual(
    entries[0].sources.map((source) => source.file),
    ["a/Dockerfile", "b/Dockerfile", "c/Dockerfile"]
  );
});

test("plan copies each pinned digest once and tracks each tag", () => {
  const items = [
    ...scanFile("a/Dockerfile", `FROM node:24-alpine@${A}`),
    ...scanFile(
      "b/Dockerfile",
      `FROM ghcr.io/marcus100/base/node:24-alpine@${A}`
    ),
    ...scanFile("c/Dockerfile", `FROM node:24-alpine@${B}`),
    ...scanFile(
      ".github/workflows/ci.yml",
      "x:\n  driver-opts: image=ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1\n"
    ),
  ];
  const operations = plan(inventory(items));
  assert.deepEqual(
    operations.map((operation) => [
      operation.kind,
      operation.source,
      operation.target,
    ]),
    [
      [
        "track",
        "docker.io/moby/buildkit:buildx-stable-1",
        "ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1",
      ],
      [
        "track",
        "docker.io/library/node:24-alpine",
        "ghcr.io/marcus100/base/node:24-alpine",
      ],
      [
        "pinned",
        `docker.io/library/node@${A}`,
        `ghcr.io/marcus100/base/node:sha256-${"a".repeat(64)}`,
      ],
      [
        "pinned",
        `docker.io/library/node@${B}`,
        `ghcr.io/marcus100/base/node:sha256-${"b".repeat(64)}`,
      ],
    ]
  );
});

test("plan always carries the implicit BuildKit builder image", () => {
  const operations = plan([]);
  assert.deepEqual(
    operations.map((operation) => [
      operation.kind,
      operation.source,
      operation.target,
    ]),
    [
      [
        "track",
        "docker.io/moby/buildkit:buildx-stable-1",
        "ghcr.io/marcus100/base/moby/buildkit:buildx-stable-1",
      ],
    ]
  );
  assert.equal(
    plan([], "other")[0].target,
    "ghcr.io/other/base/moby/buildkit:buildx-stable-1"
  );
});

test("plan leaves unpinned vendored Docker Hub images alone", () => {
  const items = scanFile("surface/nginx/Dockerfile", "FROM nginx:1.25-alpine");
  assert.deepEqual(
    plan(inventory(items)).map((operation) => operation.source),
    ["docker.io/moby/buildkit:buildx-stable-1"]
  );
});

test("plan never tracks a mirror digest tag", () => {
  const items = scanFile(
    "a/Dockerfile",
    `FROM ghcr.io/marcus100/base/node:sha256-${"a".repeat(64)}@${A}`
  );
  assert.deepEqual(
    plan(inventory(items)).map((operation) => operation.kind),
    ["track", "pinned"]
  );
});

test("check flags unpinned Dockerfile and service images", () => {
  const items = [
    ...scanFile("a/Dockerfile", "FROM node:24-alpine"),
    ...scanFile("b/Dockerfile", "FROM ghcr.io/marcus100/base/node:24-alpine"),
    ...scanFile(
      ".github/workflows/ci.yml",
      "s:\n services:\n  p:\n   image: postgres:17\n"
    ),
    ...scanFile("c/Dockerfile", `FROM node:24@${A}`),
  ];
  assert.deepEqual(
    check(items).map((error) => error.file),
    ["a/Dockerfile", "b/Dockerfile", ".github/workflows/ci.yml"]
  );
});

test("check --require-mirror rejects Docker Hub except where allowed", () => {
  const items = [
    ...scanFile("a/Dockerfile", `FROM node:24@${A}`),
    ...scanFile(".devcontainer/Dockerfile", `FROM node:24@${A}`),
    ...scanFile(
      "surface/Dockerfile.deploy",
      `FROM nmsbdocker/surface-base:v1@${B}`
    ),
    ...scanFile("b/Dockerfile", `FROM ghcr.io/marcus100/base/node:24@${A}`),
    ...scanFile(
      ".github/workflows/ci.yml",
      "x:\n  driver-opts: image=moby/buildkit:buildx-stable-1\n"
    ),
  ];
  assert.deepEqual(check(items), []);
  const errors = check(items, { requireMirror: true });
  assert.deepEqual(
    errors.map((error) => error.file),
    ["a/Dockerfile", ".github/workflows/ci.yml", ".github/workflows/ci.yml"]
  );
  assert.match(errors[0].message, USE_MIRROR);
});

test("bump moves a pinned digest to the mirror's current tag", () => {
  const root = mkdtempSync(join(tmpdir(), "base-images-"));
  try {
    mkdirSync(join(root, "apps"), { recursive: true });
    writeFileSync(
      join(root, "apps", "Dockerfile"),
      `FROM ghcr.io/marcus100/base/node:24-alpine@${A} AS base\nRUN true\n`
    );
    const looked = [];
    const resolve = (reference) => {
      looked.push(reference);
      return B;
    };
    const changes = bump(scanRoot(root), resolve);
    assert.deepEqual(looked, ["ghcr.io/marcus100/base/node:24-alpine"]);
    assert.deepEqual(
      changes.map((change) => [
        change.file,
        change.line,
        change.from,
        change.to,
      ]),
      [["apps/Dockerfile", 1, A, B]]
    );
    applyBump(root, changes);
    assert.equal(
      readFileSync(join(root, "apps", "Dockerfile"), "utf8"),
      `FROM ghcr.io/marcus100/base/node:24-alpine@${B} AS base\nRUN true\n`
    );
    assert.deepEqual(
      bump(scanRoot(root), () => B),
      []
    );
    assert.throws(() => bump(scanRoot(root), () => "nope"), UNEXPECTED_DIGEST);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scanRoot skips dependency, build and hidden directories", () => {
  const root = mkdtempSync(join(tmpdir(), "base-images-"));
  try {
    for (const directory of [
      "app",
      "node_modules/pkg",
      ".claude/worktrees/x",
      ".github/workflows",
      ".devcontainer",
    ]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    for (const file of [
      "app/Dockerfile",
      "node_modules/pkg/Dockerfile",
      ".claude/worktrees/x/Dockerfile",
      ".devcontainer/Dockerfile",
    ]) {
      writeFileSync(join(root, file), `FROM node:24@${A}\n`);
    }
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      "j:\n  services:\n    p:\n      image: postgres:17\n"
    );
    assert.deepEqual(
      scanRoot(root)
        .map((item) => item.file)
        .sort(),
      [".devcontainer/Dockerfile", ".github/workflows/ci.yml", "app/Dockerfile"]
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the repository pins every third-party image and every mirror operation is well formed", () => {
  const items = scanRoot(REPO_ROOT);
  assert.deepEqual(check(items), []);
  const operations = plan(inventory(items));
  assert.ok(operations.length > 0);
  for (const operation of operations) {
    assert.match(operation.target, MIRROR_TARGET);
    assert.match(operation.source, HUB_SOURCE);
  }
});
