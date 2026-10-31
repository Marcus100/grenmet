const missingBase = /comparison base/;

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  changedPaths,
  selectCoverage,
  selectImages,
  selectSurface,
  webImages,
} from "../ci/select-images.mjs";

test("documentation and editor changes need no image builds", () => {
  assert.deepEqual(
    selectImages(["docs/deployment.md", ".devcontainer/Dockerfile"]),
    { web: [], weather: [], api: false }
  );
});
test("app changes include its runtime and migration targets", () => {
  assert.deepEqual(
    selectImages(["apps/web/cms/src/env.ts"]).web.map((image) => image.app),
    ["cms", "cms-migrate"]
  );
  assert.deepEqual(
    selectImages(["apps/web/auth/src/app/providers.tsx"]).web.map(
      (image) => image.app
    ),
    ["auth"]
  );
});
test("shared packages and copied manifests invalidate every Node consumer", () => {
  for (const path of [
    "packages/auth/src/index.ts",
    "apps/web/cms/package.json",
    "apps/web/elections/package.json",
  ])
    assert.deepEqual(selectImages([path]).web, webImages);
});
test("Elections source deploys independently while mixed changes retain core checks", () => {
  for (const path of [
    "apps/web/elections/src/app/page.tsx",
    "apps/web/elections/src/data/source/elections/2022/results.json",
    "apps/web/elections/vercel.json",
    "apps/web/barrels/index.html",
    "apps/web/barrels/build.mjs",
    "apps/web/babydoll/src/app/page.tsx",
    "apps/web/babydoll/vercel.json",
    "apps/web/commit/src/app/page.tsx",
    "apps/web/commit/content/posts/v1-0-0.mdx",
  ])
    assert.deepEqual(selectImages([path]), {
      web: [],
      weather: [],
      api: false,
    });
  const mixed = selectImages([
    "apps/web/elections/src/app/page.tsx",
    "apps/web/auth/src/app/page.tsx",
  ]);
  assert.deepEqual(
    mixed.web.map((image) => image.app),
    ["auth"]
  );
  assert.equal(mixed.api, false);
});
test("SURFACE source does not enter the release", () => {
  const selected = selectImages(["surface/api/tempestas_api/settings.py"]);
  assert.deepEqual(
    selected.weather.map((image) => image.name),
    []
  );
  assert.deepEqual(selected.web, []);
  assert.equal(selected.api, false);
});
test("unknown, lockfile and CI inputs conservatively select everything", () => {
  for (const path of [
    "pnpm-lock.yaml",
    "uv.lock",
    "apps/api/fastapi/pyproject.toml",
    ".github/workflows/ci-web.yml",
    "scripts/production/smoke-image.sh",
    "infra/weather/Dockerfile.collectors",
  ]) {
    const selected = selectImages([path]);
    assert.equal(selected.web.length, 13);
    assert.equal(selected.weather.length, 0);
    assert.equal(selected.api, true);
  }
});
test("promotion checks are full; deployment builds own their smoke checks", () => {
  assert.equal(selectImages([], "full").web.length, 13);
  assert.deepEqual(selectImages(["pnpm-lock.yaml"], "deployment"), {
    web: [],
    weather: [],
    api: false,
  });
});
test("PR comparisons use merge-base and retain deleted paths across renames", () => {
  const calls = [];
  const files = changedPaths(
    { pull_request: { base: { sha: "base" }, head: { sha: "head" } } },
    (args) => {
      calls.push(args);
      return args[0] === "merge-base"
        ? "ancestor\n"
        : "apps/web/auth/old.ts\0apps/web/cms/new.ts\0";
    }
  );
  assert.deepEqual(calls[1], [
    "diff",
    "--no-renames",
    "--name-only",
    "-z",
    "ancestor",
    "head",
  ]);
  assert.equal(selectImages(files).web.length, 3);
});
test("new branches cannot silently skip image checks", () => {
  assert.throws(
    () => changedPaths({ before: "000000", after: "head" }),
    missingBase
  );
});

test("unavailable Git history propagates to the full-selection fallback", () => {
  assert.throws(() =>
    changedPaths({ before: "base", after: "head" }, () => {
      throw new Error("missing Git object");
    })
  );
});

test("CLI selects all images when comparison history or event data is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "image-selection-"));
  try {
    const event = join(dir, "event.json");
    const output = join(dir, "output");
    for (const payload of [
      "{",
      JSON.stringify({ before: "0".repeat(40), after: "head" }),
      JSON.stringify({ before: "missing-base", after: "missing-head" }),
    ]) {
      writeFileSync(event, payload);
      writeFileSync(output, "");
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../ci/select-images.mjs", import.meta.url))],
        {
          env: {
            ...process.env,
            IMAGE_BUILD_MODE: "affected",
            GITHUB_EVENT_PATH: event,
            GITHUB_OUTPUT: output,
          },
        }
      );
      assert.equal(result.status, 0);
      const outputs = Object.fromEntries(
        readFileSync(output, "utf8")
          .trim()
          .split("\n")
          .map((line) => {
            const index = line.indexOf("=");
            return [line.slice(0, index), JSON.parse(line.slice(index + 1))];
          })
      );
      assert.deepEqual(outputs, {
        ...selectImages([], "full"),
        surface: true,
        coverage: selectCoverage([], "full").map(({ app, path }) => ({
          app,
          path,
        })),
      });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GMS source leaves unrelated application builds cached", () => {
  assert.deepEqual(
    selectImages(["apps/web/gms/src/components/hero.tsx"]).web.map(
      (image) => image.app
    ),
    ["gms"]
  );
});

test("coverage runs only the floor-tracked apps and follows the image scope", () => {
  assert.deepEqual(
    selectCoverage([], "full").map((image) => image.app),
    ["auth", "gms", "signal", "mbia"]
  );
  assert.deepEqual(
    selectCoverage(["apps/web/gaa-admin/src/app/page.tsx"], "affected"),
    []
  );
  assert.deepEqual(
    selectCoverage(["apps/web/signal/src/app/page.tsx"], "affected").map(
      (image) => image.app
    ),
    ["signal"]
  );
  assert.deepEqual(selectCoverage(["pnpm-lock.yaml"], "deployment"), []);
});

test("SURFACE CI runs only for SURFACE source and its own workflow", () => {
  for (const path of [
    "surface/api/wx/models.py",
    "surface/api/requirements.txt",
    "surface/Dockerfile.deploy",
    "surface/ci/deploy-check-accepted.txt",
    ".github/workflows/ci-surface.yml",
  ]) {
    assert.equal(selectSurface([path]), true, path);
    // Promotion PRs and main pushes use the diff too.
    assert.equal(selectSurface([path], "full"), true, path);
    assert.equal(selectSurface([path], "deployment"), false, path);
  }
  for (const path of [
    ".github/workflows/ci-api.yml",
    "pnpm-lock.yaml",
    "uv.lock",
    "apps/api/fastapi/src/main.py",
    "infra/weather/docker-compose.surface.yml",
    "docs/surface.md",
    "wis2box/wis2box.env.example",
  ])
    assert.equal(selectSurface([path]), false, path);
  assert.equal(selectSurface([], "full"), false);
});

test("CLI selects SURFACE from the diff in full mode and never for deployments", () => {
  const dir = mkdtempSync(join(tmpdir(), "surface-selection-"));
  try {
    const git = (args) =>
      spawnSync("git", args, { cwd: dir, encoding: "utf8" }).stdout.trim();
    git(["init", "-q"]);
    git(["config", "user.email", "ci@example.invalid"]);
    git(["config", "user.name", "CI"]);
    writeFileSync(join(dir, "README.md"), "x\n");
    git(["add", "."]);
    git(["commit", "-qm", "base"]);
    const base = git(["rev-parse", "HEAD"]);
    writeFileSync(join(dir, "README.md"), "y\n");
    git(["commit", "-qam", "docs only"]);
    const docsHead = git(["rev-parse", "HEAD"]);
    mkdirSync(join(dir, "surface/api"), { recursive: true });
    writeFileSync(join(dir, "surface/api/manage.py"), "\n");
    git(["add", "."]);
    git(["commit", "-qm", "surface"]);
    const surfaceHead = git(["rev-parse", "HEAD"]);
    const event = join(dir, "event.json");
    const output = join(dir, "output");
    const surfaceFor = (head, mode) => {
      writeFileSync(event, JSON.stringify({ before: base, after: head }));
      writeFileSync(output, "");
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../ci/select-images.mjs", import.meta.url))],
        {
          cwd: dir,
          env: {
            ...process.env,
            IMAGE_BUILD_MODE: mode,
            GITHUB_EVENT_PATH: event,
            GITHUB_OUTPUT: output,
          },
        }
      );
      assert.equal(result.status, 0);
      const line = readFileSync(output, "utf8")
        .split("\n")
        .find((entry) => entry.startsWith("surface="));
      return JSON.parse(line.slice("surface=".length));
    };
    assert.equal(surfaceFor(docsHead, "full"), false);
    assert.equal(surfaceFor(surfaceHead, "full"), true);
    assert.equal(surfaceFor(docsHead, "affected"), false);
    assert.equal(surfaceFor(surfaceHead, "affected"), true);
    assert.equal(surfaceFor(surfaceHead, "deployment"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
