import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { webImages } from "../ci/release-scope.mjs";

const root = new URL("../../", import.meta.url);
const workspaces = new Map();
for (const parent of ["packages", "apps/web", "apps/api"]) {
  for (const entry of readdirSync(new URL(parent, root), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    try {
      const path = `${parent}/${entry.name}`;
      const manifest = JSON.parse(
        readFileSync(new URL(`${path}/package.json`, root), "utf8")
      );
      workspaces.set(manifest.name, { path, manifest });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
function closure(name, result = new Set()) {
  if (result.has(name)) return result;
  result.add(name);
  const { manifest } = workspaces.get(name);
  for (const section of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ])
    for (const dependency of Object.keys(manifest[section] ?? {}))
      if (workspaces.has(dependency)) closure(dependency, result);
  return result;
}
test("each Node image includes its dependency closure after a separate install layer", () => {
  for (const path of new Set(webImages.map((image) => image.path))) {
    const dockerfile = readFileSync(
      new URL(`${path}/Dockerfile`, root),
      "utf8"
    );
    const app = [...workspaces].find(([, value]) => value.path === path)[0];
    const sources = dockerfile.slice(
      dockerfile.indexOf("pnpm install --frozen-lockfile")
    );
    assert.equal(dockerfile.includes("COPY . ."), false, path);
    for (const name of closure(app)) {
      const dependency = workspaces.get(name).path;
      assert.ok(
        sources.includes(`COPY ${dependency}/ ${dependency}/`),
        `${path} requires ${dependency}`
      );
    }
    for (const other of webImages.filter((image) => image.path !== path))
      assert.equal(
        sources.includes(`COPY ${other.path}/ ${other.path}/`),
        false,
        `${path} must not copy ${other.path}`
      );
    for (const { path: dependency } of workspaces.values()) {
      const manifestPosition = dockerfile.indexOf(
        `COPY ${dependency}/package.json ${dependency}/`
      );
      assert.ok(
        manifestPosition >= 0 &&
          manifestPosition <
            dockerfile.indexOf("pnpm install --frozen-lockfile"),
        `${path} must copy ${dependency}'s manifest before installation`
      );
    }
  }
});
