const deferredPath = /^(surface|wis2box|geonetcast|wxwatch|gms-ingest)\//u;
const zeroSha = /^0+$/u;
const workspaceManifest = /^(apps\/[^/]+\/[^/]+\/package\.json)$/u;
const rootMarkdown = /^[^/]+\.md$/u;
const nonImagePath =
  /^(docs\/|\.devcontainer\/|\.vscode\/|\.agents\/|\.claude\/|\.codex\/)/u;

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { promotionVerified } from "./promotion-verified.mjs";
import { releaseScope, weatherImages, webImages } from "./release-scope.mjs";

export { weatherImages, webImages } from "./release-scope.mjs";

// Unknown inputs invalidate every image. Shared packages conservatively
// invalidate all Node consumers, including indirect dependencies.
const allImages = releaseScope;
const noImages = { web: [], weather: [], api: false };
function imagesForPath(path) {
  // Python workspace metadata is copied by both API and collector builds.
  // Check it before narrowing a path to its owning application.
  if (path === "pyproject.toml" || path.endsWith("/pyproject.toml"))
    return allImages;
  if (nonImagePath.test(path) || rootMarkdown.test(path)) return noImages;
  if (deferredPath.test(path)) return noImages;
  if (path.startsWith("packages/") || workspaceManifest.test(path))
    return { ...noImages, web: webImages };
  // Elections, Babydoll (Vercel) and Commit (Cloudflare Pages) deploy
  // independently. Their manifests still affect
  // Docker installation layers above, but their source does not enter them.
  if (
    path.startsWith("apps/web/elections/") ||
    path.startsWith("apps/web/babydoll/") ||
    path.startsWith("apps/web/commit/") ||
    path.startsWith("apps/web/barrels/")
  )
    return noImages;
  if (path.startsWith("apps/api/fastapi/")) return { ...noImages, api: true };
  const web = webImages.filter((image) => path.startsWith(`${image.path}/`));
  return web.length ? { ...noImages, web } : allImages;
}
export function selectImages(paths, mode = "affected") {
  if (mode === "deployment") return noImages;
  if (mode !== "affected") return allImages;
  const selections = paths.map(imagesForPath);
  return {
    web: webImages.filter((image) =>
      selections.some((selection) => selection.web.includes(image))
    ),
    weather: weatherImages.filter((image) =>
      selections.some((selection) => selection.weather.includes(image))
    ),
    api: selections.some((selection) => selection.api),
  };
}

// SURFACE (vendored Django app) is deferred from releases but has its own CI
// job, .github/workflows/ci-surface.yml. Its image is built from surface/api
// only, so only SURFACE paths and that workflow can change the result. Unlike
// the image checks, promotion ("full") runs use the diff too: nothing outside
// these paths enters the SURFACE image.
const surfacePath = /^(surface\/|\.github\/workflows\/ci-surface\.yml$)/u;
export function selectSurface(paths, mode = "affected") {
  if (mode === "deployment") return false;
  return paths.some((path) => surfacePath.test(path));
}

// Web apps whose Vitest coverage floors CI enforces (scripts/guardrails/
// coverage-baseline.json). gaa-admin is left out: its full coverage run takes
// about 40 minutes locally (docs/testing.md, Coverage floors).
export const coverageApps = ["auth", "gms", "mbia", "signal"];

// Coverage runs follow the same scope as the image checks: dev PRs and dev
// pushes run the affected apps, every other event runs all of them.
export function selectCoverage(paths, mode = "affected") {
  return selectImages(paths, mode).web.filter((image) =>
    coverageApps.includes(image.app)
  );
}

// Job scope: which test suites a diff needs, beside the image checks above.
// Only documentation and agent/editor configuration skip suites. The API and
// web suites read each other's files (API tests read packages/gms and web
// route folders; gaa-admin tests read CAP and wxproducts sources), so a code
// change runs both. Promotion ("full") and deployment runs keep every suite.
// tests/test_reserved_names.py reads docs/ports.md, so it is code here.
const testedDocs = new Set(["docs/ports.md"]);
const nonCodePath = (path) =>
  !testedDocs.has(path) && (nonImagePath.test(path) || rootMarkdown.test(path));
const surfaceOnlyPath = (path) => path.startsWith("surface/");
const apiPythonPath = (path) =>
  path.startsWith("apps/api/fastapi/") &&
  path !== "apps/api/fastapi/openapi.json";
const webPath = (path) =>
  path.startsWith("apps/web/") ||
  path.startsWith("packages/") ||
  path === "pnpm-lock.yaml" ||
  path === "pnpm-workspace.yaml";
const collectorPath =
  /^(scripts\/(scrapy-wxwatch|sutron-collector|gnc-collector|gms-ingest)\/|scripts\/verification\/collectors\.sh$|(.*\/)?pyproject\.toml$|uv\.lock$)/u;

export function selectJobs(paths, mode = "affected") {
  const all = { python: true, collectors: true, webtests: true, storage: true };
  if (mode !== "affected") return all;
  const code = paths.some(
    (path) => !(nonCodePath(path) || surfaceOnlyPath(path))
  );
  // Collector packages are standalone uv projects: only their own sources,
  // the shared Python manifests or an unrecognised path select them.
  const collectors = paths.some(
    (path) =>
      collectorPath.test(path) ||
      !(
        nonCodePath(path) ||
        surfaceOnlyPath(path) ||
        apiPythonPath(path) ||
        webPath(path)
      )
  );
  return { python: code, collectors, webtests: code, storage: code };
}

export function changedPaths(
  event,
  git = (args) => execFileSync("git", args, { encoding: "utf8" })
) {
  let base = event.before;
  const head = event.pull_request?.head?.sha ?? event.after;
  if (event.pull_request)
    base = git(["merge-base", event.pull_request.base.sha, head]).trim();
  if (!(base && head) || zeroSha.test(base))
    throw new Error("No trustworthy comparison base");
  return git(["diff", "--no-renames", "--name-only", "-z", base, head])
    .split("\0")
    .filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Standalone CI entry point; never reads application secrets.
  const {
    IMAGE_BUILD_MODE: requestedMode = "full",
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: repository,
  } = process.env;
  // Promotion PRs (into staging or main) reuse dev's results when their tree
  // passed every required check on dev (scripts/ci/promotion-verified.mjs);
  // otherwise they run everything, like any other full run.
  let verified = false;
  if (requestedMode === "promotion") {
    const run = (command) => (args) =>
      execFileSync(command, args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    const result = promotionVerified({
      git: run("git"),
      gh: run("gh"),
      repository,
    });
    verified = result.verified;
    console.log(
      verified
        ? `Reusing dev checks: ${result.reason}.`
        : `Running every check: ${result.reason}`
    );
  }
  const mode = requestedMode === "promotion" ? "full" : requestedMode;
  appendFileSync(output, `verified=${JSON.stringify(verified)}\n`);
  if (verified) {
    for (const [key, value] of Object.entries(noImages))
      appendFileSync(output, `${key}=${JSON.stringify(value)}\n`);
    appendFileSync(output, "surface=false\n");
    for (const key of Object.keys(selectJobs([], "full")))
      appendFileSync(output, `${key}=false\n`);
    appendFileSync(output, "coverage=[]\n");
    process.exit(0);
  }
  let selection;
  let coverage;
  let surface;
  let jobs;
  try {
    // Deployment builds own their checks; every other mode needs the diff,
    // at least for the SURFACE selection.
    const paths =
      mode === "deployment"
        ? []
        : changedPaths(JSON.parse(readFileSync(eventPath, "utf8")));
    selection = selectImages(paths, mode);
    coverage = selectCoverage(paths, mode);
    surface = selectSurface(paths, mode);
    jobs = selectJobs(paths, mode);
  } catch {
    console.error("Image comparison unavailable; checking every image.");
    selection = selectImages([], "full");
    coverage = selectCoverage([], "full");
    surface = true;
    jobs = selectJobs([], "full");
  }
  for (const [key, value] of Object.entries(selection))
    appendFileSync(output, `${key}=${JSON.stringify(value)}\n`);
  appendFileSync(output, `surface=${JSON.stringify(surface)}\n`);
  for (const [key, value] of Object.entries(jobs))
    appendFileSync(output, `${key}=${JSON.stringify(value)}\n`);
  // Matrix entries for the web coverage job: app name and package directory.
  const coverageMatrix = coverage.map(({ app, path }) => ({ app, path }));
  appendFileSync(output, `coverage=${JSON.stringify(coverageMatrix)}\n`);
}
