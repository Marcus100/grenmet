import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bumpPatchDate,
  checkPatchDates,
  isValidDate,
  osFamily,
  planFixes,
  readPatchDate,
  releaseImages,
  run,
  scanTargets,
} from "./image-patch-dates.mjs";

const ROOT = new URL("../../", import.meta.url);
const CONTEXT = { owner: "Marcus100", repository: "Marcus100/grenmet" };
const DIGEST = `sha256:${"ab".repeat(32)}`;
const WEB = [
  "FROM node:24-alpine AS base",
  "ARG ALPINE_PATCH_DATE=2026-11-07",
  "RUN apk upgrade --no-cache",
  "",
].join("\n");
const API = [
  "FROM python:3.14-slim-trixie",
  "ARG DEBIAN_PATCH_DATE=2026-11-08",
  "RUN apt-get update && apt-get upgrade -y",
  "",
].join("\n");

describe("patch dates", () => {
  it("reads the family and date", () => {
    assert.deepEqual(readPatchDate(WEB), {
      family: "alpine",
      date: "2026-11-07",
    });
    assert.deepEqual(readPatchDate(API), {
      family: "debian",
      date: "2026-11-08",
    });
    assert.equal(readPatchDate("FROM scratch\n"), null);
  });

  it("validates calendar dates", () => {
    assert.equal(isValidDate("2026-11-08"), true);
    assert.equal(isValidDate("2026-02-30"), false);
    assert.equal(isValidDate("2026-11-8"), false);
  });

  it("bumps forward only and changes nothing else", () => {
    const next = bumpPatchDate(WEB, "2026-11-09");
    assert.equal(next, WEB.replace("2026-11-07", "2026-11-09"));
    assert.equal(bumpPatchDate(WEB, "2026-11-01"), WEB);
    assert.equal(bumpPatchDate(WEB, "2026-11-07"), WEB);
    assert.throws(() => bumpPatchDate(WEB, "tomorrow"), {
      message: "Invalid patch date: tomorrow",
    });
    assert.throws(() => bumpPatchDate("FROM scratch\n", "2026-11-09"));
  });

  it("reports missing ARGs, bad dates and families that disagree", () => {
    assert.deepEqual(
      checkPatchDates({
        "a/Dockerfile": WEB,
        "b/Dockerfile": WEB.replace("2026-11-07", "2026-11-09"),
        "c/Dockerfile": "FROM scratch\n",
        "d/Dockerfile": API.replace("2026-11-08", "2026-13-01"),
      }),
      [
        "c/Dockerfile: no ALPINE_PATCH_DATE or DEBIAN_PATCH_DATE ARG",
        "d/Dockerfile: invalid patch date 2026-13-01",
        "alpine Dockerfiles disagree on the patch date: 2026-11-07, 2026-11-09",
      ]
    );
  });

  it("every release Dockerfile in the repository carries a consistent patch date", () => {
    const texts = Object.fromEntries(
      [...new Set([...releaseImages().values()].map((i) => i.dockerfile))].map(
        (path) => [path, readFileSync(new URL(path, ROOT), "utf8")]
      )
    );
    assert.deepEqual(checkPatchDates(texts), []);
    assert.equal(
      readPatchDate(texts["apps/api/fastapi/Dockerfile.prod"]).family,
      "debian"
    );
  });
});

describe("planFixes", () => {
  it("maps release images to their Dockerfile and scan scope", () => {
    const images = releaseImages();
    assert.deepEqual(images.get("api"), {
      dockerfile: "apps/api/fastapi/Dockerfile.prod",
      scope: "apps/api/fastapi/Dockerfile.prod#runtime",
    });
    assert.deepEqual(images.get("web-cms-migrate"), {
      dockerfile: "apps/web/cms/Dockerfile",
      scope: "apps/web/cms/Dockerfile#migrate",
    });
  });

  it("recognises OS package targets only", () => {
    assert.equal(osFamily("ghcr.io/x/web-gms:dev (alpine 3.22.2)"), "alpine");
    assert.equal(osFamily("ghcr.io/x/api:dev (debian 13.1)"), "debian");
    assert.equal(osFamily("app/node_modules/next/package.json"), null);
    assert.equal(osFamily(undefined), null);
  });

  it("bumps each Dockerfile with an OS finding once and keeps the rest for a person", () => {
    const os = (target) => ({
      vulnerability: "CVE-1",
      package: "musl",
      target,
    });
    const plan = planFixes([
      { key: "web-cms", blocked: [os("x (alpine 3.22.2)")] },
      { key: "web-cms-migrate", blocked: [os("y (alpine 3.22.2)")] },
      { key: "api", blocked: [os("z (debian 13.1)")] },
      {
        key: "web-gms",
        blocked: [{ vulnerability: "CVE-2", package: "next", target: "n" }],
      },
      { key: "web-unknown", blocked: [os("w (alpine 3.22.2)")] },
      { key: "web-auth", blocked: [] },
    ]);
    assert.deepEqual(plan.bump, [
      "apps/api/fastapi/Dockerfile.prod",
      "apps/web/cms/Dockerfile",
    ]);
    assert.deepEqual(
      plan.unfixable.map((item) => [item.key, item.package]),
      [
        ["web-gms", "next"],
        ["web-unknown", "musl"],
      ]
    );
  });
});

describe("scanTargets", () => {
  it("scans every release image at each tag with its exception scope", () => {
    const targets = scanTargets({ ...CONTEXT, tags: ["dev", "latest"] });
    assert.equal(targets.length, releaseImages().size * 2);
    assert.deepEqual(targets[0], {
      key: "api",
      ref: "ghcr.io/marcus100/grenmet:dev",
      scope: "apps/api/fastapi/Dockerfile.prod#runtime",
      name: "api-dev",
    });
    const migrate = targets.find(
      (item) => item.key === "web-cms-migrate" && item.name.endsWith("latest")
    );
    assert.equal(
      migrate.ref,
      "ghcr.io/marcus100/barrelsgd-web-cms-migrate:latest"
    );
    assert.equal(migrate.scope, "apps/web/cms/Dockerfile#migrate");
    assert.equal(
      new Set(targets.map((item) => item.name)).size,
      targets.length
    );
  });

  it("maps promoted digests back to their image", () => {
    const targets = scanTargets({
      ...CONTEXT,
      digests: `ghcr.io/marcus100/barrelsgd-web-gms@${DIGEST} ghcr.io/marcus100/grenmet@${DIGEST}`,
    });
    assert.deepEqual(
      targets.map((item) => [item.key, item.ref, item.name]),
      [
        [
          "web-gms",
          `ghcr.io/marcus100/barrelsgd-web-gms@${DIGEST}`,
          "web-gms-abababababab",
        ],
        ["api", `ghcr.io/marcus100/grenmet@${DIGEST}`, "api-abababababab"],
      ]
    );
  });

  it("refuses unknown repositories, bad digests and bad tags", () => {
    assert.throws(
      () => scanTargets({ ...CONTEXT, digests: `ghcr.io/other/x@${DIGEST}` }),
      { message: "Digest for an unknown repository: ghcr.io/other/x" }
    );
    assert.throws(() =>
      scanTargets({
        ...CONTEXT,
        digests: "ghcr.io/marcus100/grenmet@sha256:short",
      })
    );
    assert.throws(() => scanTargets({ ...CONTEXT, tags: ["bad tag"] }), {
      message: "Invalid tag: bad tag",
    });
  });

  it("the targets command prints the matrix and refuses an empty one", () => {
    const lines = [];
    const env = {
      GITHUB_REPOSITORY_OWNER: CONTEXT.owner,
      GITHUB_REPOSITORY: CONTEXT.repository,
    };
    const log = (line) => lines.push(line);
    assert.equal(run(["targets", "tags", "staging"], { log, env }), 0);
    assert.equal(
      JSON.parse(lines[0])[0].ref,
      "ghcr.io/marcus100/grenmet:staging"
    );
    assert.throws(() => run(["targets", "digests"], { log, env }), {
      message: "No images to scan",
    });
  });
});
