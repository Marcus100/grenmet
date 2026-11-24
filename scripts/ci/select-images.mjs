const deferredPath = /^(surface|wis2box|geonetcast|wxwatch|gms-ingest)\//u;
const workspaceManifest = /^(apps\/[^/]+\/[^/]+\/package\.json)$/u;
const rootMarkdown = /^[^/]+\.md$/u;
const nonImagePath =
  /^(docs\/|\.devcontainer\/|\.vscode\/|\.agents\/|\.claude\/|\.codex\/)/u;

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { changedPaths } from "./changed-paths.mjs";
import {
  narrowJobs,
  selectChecks,
  writeShadowRecord,
} from "./select-checks.mjs";
import { promotionVerified } from "./promotion-verified.mjs";
import { releaseScope, weatherImages, webImages } from "./release-scope.mjs";

export { changedPaths } from "./changed-paths.mjs";
export { weatherImages, webImages } from "./release-scope.mjs";

// Unknown inputs invalidate every image. A shared package invalidates the web
// images whose app depends on it, directly or through another workspace
// package (the pnpm workspace graph below). Dockerfiles copy exactly that
// dependency closure, so nothing outside it enters an image.
const allImages = releaseScope;
const noImages = { web: [], weather: [], api: false };

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

// Workspace packages keyed by directory, with the workspace packages each one
// declares. Read from the package.json files in the checkout.
export function workspaceGraph(root = repoRoot) {
  const packages = new Map();
  for (const parent of ["packages", "apps/web", "apps/pwa"]) {
    const base = join(root, parent);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const manifest = join(base, entry.name, "package.json");
      if (!(entry.isDirectory() && existsSync(manifest))) continue;
      packages.set(`${parent}/${entry.name}`, {
        ...JSON.parse(readFileSync(manifest, "utf8")),
      });
    }
  }
  const names = new Map(
    [...packages].map(([dir, manifest]) => [manifest.name, dir])
  );
  const dependencies = new Map();
  for (const [dir, manifest] of packages)
    dependencies.set(
      dir,
      new Set(
        dependencyFields
          .flatMap((field) => Object.keys(manifest[field] ?? {}))
          .map((name) => names.get(name))
          .filter(Boolean)
      )
    );
  return { dependencies, dirs: [...packages.keys()] };
}

// Every workspace directory that depends on `dir`, directly or indirectly.
export function dependentsOf(dir, graph) {
  const found = new Set();
  const queue = [dir];
  while (queue.length) {
    const current = queue.pop();
    for (const [candidate, deps] of graph.dependencies)
      if (deps.has(current) && !found.has(candidate)) {
        found.add(candidate);
        queue.push(candidate);
      }
  }
  return found;
}

// Packages whose sources an image's Dockerfile copies (`COPY packages/x/ ...`).
// Some enter only through the Dockerfile (cms builds cms-migrations without
// declaring it), so the Dockerfile is read as well as package.json. A missing
// Dockerfile means unknown inputs: null selects the image for every package.
export function dockerfilePackages(image, root = repoRoot) {
  const file = join(root, image.path, "Dockerfile");
  if (!existsSync(file)) return null;
  const copied = new Set();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^COPY\s+(?:--\S+\s+)*(packages\/[^/\s]+)\/\s/u.exec(line);
    if (match) copied.add(match[1]);
  }
  return copied;
}

let cachedGraph;
function packageImages(path) {
  const match = /^(packages\/[^/]+)\//u.exec(path);
  if (!match) return null;
  cachedGraph ??= workspaceGraph();
  // A manifest change alters the install layer every image shares.
  if (path === `${match[1]}/package.json`) return webImages;
  if (!cachedGraph.dirs.includes(match[1])) return webImages;
  const dependents = dependentsOf(match[1], cachedGraph);
  return webImages.filter((image) => {
    if (dependents.has(image.path)) return true;
    const copied = dockerfilePackages(image);
    return !copied || copied.has(match[1]);
  });
}
function imagesForPath(path) {
  // Python workspace metadata is copied by both API and collector builds.
  // Check it before narrowing a path to its owning application.
  if (path === "pyproject.toml" || path.endsWith("/pyproject.toml"))
    return allImages;
  if (nonImagePath.test(path) || rootMarkdown.test(path)) return noImages;
  if (deferredPath.test(path)) return noImages;
  if (workspaceManifest.test(path)) return { ...noImages, web: webImages };
  const shared = packageImages(path);
  if (shared) return { ...noImages, web: shared };
  // Elections, Babydoll (Vercel), Commit (Cloudflare Pages) and the phone
  // apps under apps/pwa deploy independently. Their manifests still affect
  // Docker installation layers above, but their source does not enter them.
  if (
    path.startsWith("apps/web/elections/") ||
    path.startsWith("apps/web/babydoll/") ||
    path.startsWith("apps/web/commit/") ||
    path.startsWith("apps/pwa/") ||
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
export const coverageApps = [
  "admin",
  "auth",
  "bookings",
  "cap",
  "events",
  "gms",
  "gmsdash",
  "mbia",
  "signal",
];

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
  path.startsWith("apps/pwa/") ||
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
    const event =
      mode === "deployment" ? {} : JSON.parse(readFileSync(eventPath, "utf8"));
    const paths = mode === "deployment" ? [] : changedPaths(event);
    selection = selectImages(paths, mode);
    coverage = selectCoverage(paths, mode);
    surface = selectSurface(paths, mode);
    // Pull requests into dev narrow the suites further (select-checks.mjs).
    // Under CI_PATH_SELECTION=shadow (the default) or off this changes nothing
    // and shadow mode records what `on` would skip.
    const rollout = process.env.CI_PATH_SELECTION;
    jobs = narrowJobs(selectJobs(paths, mode), paths, event, mode, rollout);
    writeShadowRecord(
      selectChecks(paths, {
        mode,
        baseRef: event.pull_request?.base?.ref,
        labels: (event.pull_request?.labels ?? []).map((l) => l.name),
        rollout,
      }),
      event
    );
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
