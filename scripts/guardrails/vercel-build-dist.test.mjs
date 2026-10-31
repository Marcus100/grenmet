import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// Vercel runs an app's buildCommand in a fresh clone where no workspace package
// has been built. A workspace package whose main/types/exports point at dist/
// therefore has to be built by the buildCommand before the app's own build,
// or the app fails with "Module not found" (see apps/web/babydoll/AGENTS.md).

const root = new URL("../../", import.meta.url);
const workspaces = new Map();
for (const parent of ["packages", "apps/web"]) {
  for (const entry of readdirSync(new URL(parent, root), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const path = `${parent}/${entry.name}`;
    const manifestUrl = new URL(`${path}/package.json`, root);
    if (!existsSync(manifestUrl)) continue;
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
    workspaces.set(manifest.name, { path, manifest });
  }
}

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function workspaceDependencies(name, seen = new Set()) {
  const { manifest } = workspaces.get(name);
  for (const section of DEPENDENCY_SECTIONS)
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (seen.has(dependency) || !workspaces.has(dependency)) continue;
      seen.add(dependency);
      workspaceDependencies(dependency, seen);
    }
  return seen;
}

const DIST_ENTRY = /"\.\/dist\//;
// First `&&` step: pnpm --filter '<name>^...' run build (group 2 is the name).
// `^...` selects every workspace dependency of <name> and not <name> itself.
const DEPENDENCY_BUILD_STEP =
  /^\s*pnpm\s+--filter\s+(['"])(.+)\^\.\.\.\1\s+run\s+build\s*$/;

function resolvesToDist(manifest) {
  return DIST_ENTRY.test(
    JSON.stringify([manifest.main, manifest.types, manifest.exports])
  );
}

// True when the command's first `&&` step builds the app's workspace dependencies.
function buildsDependenciesFirst(command, appName) {
  const [firstStep] = command.split("&&");
  const match = DEPENDENCY_BUILD_STEP.exec(firstStep);
  return match !== null && match[2] === appName;
}

test("the guard rejects the plain pnpm build that left api-client dist unbuilt", () => {
  assert.equal(
    buildsDependenciesFirst("pnpm build", "@barrelsgd/web-babydoll"),
    false
  );
  assert.equal(
    buildsDependenciesFirst(
      "pnpm --filter '@barrelsgd/web-babydoll^...' run build && pnpm build",
      "@barrelsgd/web-babydoll"
    ),
    true
  );
});

const vercelApps = [...workspaces.values()]
  .filter(({ path }) => existsSync(new URL(`${path}/vercel.json`, root)))
  .map(({ path, manifest }) => ({ path, name: manifest.name }));

test("babydoll is covered by the Vercel dist guard", () => {
  assert.ok(
    vercelApps.some(({ name }) => name === "@barrelsgd/web-babydoll"),
    "apps/web/babydoll/vercel.json must be scanned"
  );
});

for (const { path, name } of vercelApps) {
  test(`${name} Vercel buildCommand builds workspace dependencies that ship dist`, () => {
    const vercel = JSON.parse(
      readFileSync(new URL(`${path}/vercel.json`, root), "utf8")
    );
    const distPackages = [...workspaceDependencies(name)].filter((dependency) =>
      resolvesToDist(workspaces.get(dependency).manifest)
    );
    for (const dependency of distPackages)
      assert.ok(
        workspaces.get(dependency).manifest.scripts?.build,
        `${dependency} ships dist but has no build script`
      );
    if (distPackages.length === 0) return;
    assert.ok(
      buildsDependenciesFirst(vercel.buildCommand ?? "", name),
      `${path}/vercel.json buildCommand must start with "pnpm --filter '${name}^...' run build" ` +
        `so ${distPackages.join(", ")} is built before the app (dist is gitignored and absent on Vercel)`
    );
  });
}
