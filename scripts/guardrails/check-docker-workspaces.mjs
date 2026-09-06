import { globSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifests = new Map(
  globSync([
    "packages/*/package.json",
    "apps/web/*/package.json",
    "apps/api/honoapi/package.json",
  ]).map((path) => [readJson(path).name, { path, data: readJson(path) }])
);

// These Dockerfiles intentionally cache installation using explicit manifest
// COPY instructions. Validate that list against the actual workspace graph.
const installPattern = /^RUN pnpm install\b/m;
const copyPattern = /^COPY (\S+\/package\.json)\s+/gm;
let failures = 0;
for (const dockerfile of globSync("apps/web/*/Dockerfile")) {
  const source = readFileSync(dockerfile, "utf8");
  const install = source.search(installPattern);
  if (install < 0) {
    throw new Error(`${dockerfile}: expected a pnpm installation layer`);
  }
  const copied = new Set(
    [...source.slice(0, install).matchAll(copyPattern)].map((match) => match[1])
  );
  const pending = [readJson(`${dirname(dockerfile)}/package.json`).name];
  const visited = new Set();
  while (pending.length) {
    const name = pending.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    const manifest = manifests.get(name);
    if (!manifest) throw new Error(`Unknown workspace dependency: ${name}`);
    if (!copied.has(manifest.path)) {
      console.error(`${dockerfile}: copy ${manifest.path} before pnpm install`);
      failures += 1;
    }
    const { dependencies, devDependencies, peerDependencies } = manifest.data;
    for (const [dependency, version] of Object.entries({
      ...dependencies,
      ...devDependencies,
      ...peerDependencies,
    })) {
      if (version.startsWith("workspace:")) pending.push(dependency);
    }
  }
}
if (failures) {
  process.exitCode = 1;
} else {
  console.log("Docker workspace manifest coverage passed.");
}
