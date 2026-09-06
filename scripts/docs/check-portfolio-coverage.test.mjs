import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(
  new URL("./check-portfolio-coverage.mjs", import.meta.url)
);
const successPattern = /Portfolio coverage passed/;
const missingWorkspacePattern =
  /missing governed surface `apps\/web\/unmapped`/;
const prohibitedClaimPattern = /prohibited client-as-product claim/;
const missingRootPattern = /missing governed surface `field-operations`/;

const write = (root, file, contents = "") => {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
};

const run = (root) =>
  spawnSync(process.execPath, [cliPath, "--root", root], {
    encoding: "utf8",
  });

const createFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "barrelsgd-portfolio-"));
  const portfolioFiles = [
    "barrels-portfolio-implementation-plan.md",
    "gaa-gms-client-programme-plan.md",
    "repository-delivery-map.md",
  ];
  const workspaces = [
    ["apps/web/example", "package.json"],
    ["apps/api/example", "pyproject.toml"],
    ["packages/example", "package.json"],
  ];
  const governedRoots = [
    ".github/workflows",
    "docs/adr",
    "docs/api",
    "docs/exec-plans",
    "docs/internal",
    "docs/operations",
    "docs/strategy",
    "docs/web",
    "geonetcast",
    "infra/docker",
    "notebooks",
    "scripts/api",
    "scripts/design-system",
    "scripts/docs",
    "scripts/guardrails",
    "scripts/scrapy-wxwatch",
    "scripts/sutron-collector",
    "scripts/wis2-setup",
    "scripts/wxregister",
    "surface",
    "wis2box",
  ];

  for (const [directory, manifest] of workspaces) {
    write(root, `${directory}/${manifest}`);
  }
  for (const directory of governedRoots) {
    write(root, `${directory}/.keep`);
  }

  const indexLinks = portfolioFiles.map((file) => `[view](${file})`).join("\n");
  write(root, "docs/portfolio/README.md", indexLinks);
  write(root, "docs/portfolio/barrels-portfolio-implementation-plan.md");
  write(root, "docs/portfolio/gaa-gms-client-programme-plan.md");
  write(
    root,
    "docs/portfolio/repository-delivery-map.md",
    [
      ...workspaces.map(([directory]) => directory),
      ...governedRoots,
      "docs/portfolio",
      "README.md",
      "CLAUDE.md",
      "docs/technical-overview.md",
      "docs/quality-score.md",
    ]
      .map((surface) => `\`${surface}\``)
      .join("\n")
  );

  for (const file of [
    "README.md",
    "CLAUDE.md",
    "docs/technical-overview.md",
    "docs/quality-score.md",
    "docs/strategy/barrels-product-strategy.md",
    "docs/exec-plans/barrelsgd-transition.md",
    "docs/exec-plans/barrelsgd-migration-plan.md",
    "docs/adr/0009-gaa-staff-platform.md",
  ]) {
    write(root, file, "GMS is a department of GAA.\n");
  }

  return root;
};

test("passes when all governed surfaces are classified", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));

  const result = run(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, successPattern);
});

test("fails when a discovered workspace is absent from the map", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));
  write(root, "apps/web/unmapped/package.json");

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, missingWorkspacePattern);
});

test("fails when a client-as-product claim is wrapped across lines", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));
  write(
    root,
    "docs/strategy/barrels-product-strategy.md",
    "GMS remains a\nBarrels product.\n"
  );

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, prohibitedClaimPattern);
});

test("fails when a new top-level surface is absent from the map", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));
  write(root, "field-operations/runbook.md");

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, missingRootPattern);
});

test("fails when an active plan commits a Barrels HR product", (t) => {
  const root = createFixture();
  t.after(() => rmSync(root, { force: true, recursive: true }));
  write(
    root,
    "docs/exec-plans/barrelsgd-transition.md",
    "The future Barrels HR product is multi-tenant.\n"
  );

  const result = run(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, prohibitedClaimPattern);
});
