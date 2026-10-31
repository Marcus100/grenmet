const deferredPath = /^(surface|wis2box|geonetcast|wxwatch|gms-ingest)\//;
const zeroSha = /^0+$/;
const workspaceManifest = /^(apps\/[^/]+\/[^/]+\/package\.json)$/;
const rootMarkdown = /^[^/]+\.md$/;
const nonImagePath =
  /^(docs\/|\.devcontainer\/|\.vscode\/|\.agents\/|\.claude\/|\.codex\/)/;

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
const surfacePath = /^(surface\/|\.github\/workflows\/ci-surface\.yml$)/;
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
    IMAGE_BUILD_MODE: mode = "full",
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: output,
  } = process.env;
  let selection;
  let coverage;
  let surface;
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
  } catch {
    console.error("Image comparison unavailable; checking every image.");
    selection = selectImages([], "full");
    coverage = selectCoverage([], "full");
    surface = true;
  }
  for (const [key, value] of Object.entries(selection))
    appendFileSync(output, `${key}=${JSON.stringify(value)}\n`);
  appendFileSync(output, `surface=${JSON.stringify(surface)}\n`);
  // Matrix entries for the web coverage job: app name and package directory.
  const coverageMatrix = coverage.map(({ app, path }) => ({ app, path }));
  appendFileSync(output, `coverage=${JSON.stringify(coverageMatrix)}\n`);
}
