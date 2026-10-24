import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const dockerfiles = globSync("apps/web/*/Dockerfile", {
  cwd: new URL("../../", import.meta.url),
});

test("every web Dockerfile caches the pnpm store and the Next.js build cache outside image layers", () => {
  assert.ok(dockerfiles.length >= 10);
  for (const path of dockerfiles) {
    const app = path.split("/")[2];
    const source = read(path);
    assert.match(
      source,
      /^ENV npm_config_store_dir="\/pnpm\/store"$/m,
      `${path}: pnpm store location`
    );
    assert.match(
      source,
      /^RUN --mount=type=cache,id=pnpm-store,target=\/pnpm\/store HUSKY=0 pnpm install --frozen-lockfile/m,
      `${path}: install uses the pnpm store cache mount`
    );
    assert.ok(
      source.includes(
        `--mount=type=cache,id=next-cache-${app},target=/app/apps/web/${app}/.next/cache`
      ),
      `${path}: build uses a per-app Next.js cache mount`
    );
  }
});

test("web Dockerfiles install only their own dependency closure, except the CMS migration image", () => {
  for (const path of dockerfiles) {
    const app = path.split("/")[2];
    const name = JSON.parse(read(`apps/web/${app}/package.json`)).name;
    const install = read(path).match(/^RUN .*pnpm install .*$/m)?.[0];
    assert.ok(install, path);
    if (app === "cms") {
      // pnpm deploy for the migration runtime needs the whole workspace installed.
      assert.doesNotMatch(install, /--filter/, path);
    } else {
      assert.ok(install.includes(`--filter "${name}..."`), `${path}: ${install}`);
    }
  }
});

test("source is copied after the dependency install layer", () => {
  for (const path of dockerfiles) {
    const source = read(path);
    const install = source.search(/^RUN .*pnpm install /m);
    const appSource = source.indexOf(`COPY ${path.replace("/Dockerfile", "")}/ `);
    assert.ok(install > 0 && appSource > install, path);
  }
});

test("pull-request container smoke builds can only read the registry cache", () => {
  const source = read(".github/workflows/ci-web.yml");
  const job = source.split("\n  container-smoke:\n")[1].split("\n  storage-integration:")[0];
  assert.match(job, /packages: read/);
  assert.doesNotMatch(job, /packages: write/);
  assert.doesNotMatch(job, /cache-to/);
  assert.match(job, /cache-from: type=registry/);
  assert.ok(job.includes("smoke-image.sh"), "smoke test still runs");
  assert.ok(job.includes("./.github/actions/scan-image"), "vulnerability policy still runs");
});

test("only the dev-push workflow writes the web build cache, never a pull request", () => {
  const warm = read(".github/workflows/warm-web-build-cache.yml");
  assert.match(warm, /on:\n {2}push:\n {4}branches: \[dev\]\n/);
  assert.doesNotMatch(warm, /pull_request|workflow_call|workflow_dispatch/);
  assert.match(warm, /packages: write/);
  assert.match(warm, /cache-to: type=registry,ref=ghcr\.io\/.*barrelsgd-buildcache/);
  // ci-web.yml is called by pipelines that grant read-only packages permission.
  assert.doesNotMatch(read(".github/workflows/ci-web.yml"), /packages: write/);
});
