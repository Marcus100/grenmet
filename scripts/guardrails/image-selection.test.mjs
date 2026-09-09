const missingBase = /comparison base/;

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedPaths, selectImages, webImages } from "../ci/select-images.mjs";

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
  ])
    assert.deepEqual(selectImages([path]).web, webImages);
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
    assert.equal(selected.web.length, 11);
    assert.equal(selected.weather.length, 0);
    assert.equal(selected.api, true);
  }
});
test("promotion checks are full; deployment builds own their smoke checks", () => {
  assert.equal(selectImages([], "full").web.length, 11);
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
      assert.deepEqual(outputs, selectImages([], "full"));
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
