const zeroSha = /^0+$/;
const workspaceManifest = /^(apps\/[^/]+\/[^/]+\/package\.json)$/;
const rootMarkdown = /^[^/]+\.md$/;
const nonImagePath =
  /^(docs\/|\.devcontainer\/|\.vscode\/|\.agents\/|\.claude\/|\.codex\/)/;

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const webImages = [
  { app: "auth", path: "apps/web/auth", port: 3000 },
  { app: "admin", path: "apps/web/gaa-admin", port: 3001 },
  { app: "docs", path: "apps/web/docs", port: 3002 },
  { app: "gms", path: "apps/web/gms", port: 3003 },
  { app: "cms", path: "apps/web/cms", port: 3006 },
  { app: "cms-migrate", path: "apps/web/cms", target: "migrate" },
  { app: "admin-migrate", path: "apps/web/gaa-admin", target: "migrate" },
  { app: "signal", path: "apps/web/signal", port: 3004 },
  { app: "mbia", path: "apps/web/mbia", port: 3005 },
  { app: "events", path: "apps/web/events", port: 3009 },
  { app: "hono", path: "apps/api/honoapi", port: 4000 },
];
export const weatherImages = [
  { name: "surface", dockerfile: "surface/Dockerfile.deploy", target: "" },
  {
    name: "wxwatch",
    dockerfile: "infra/weather/Dockerfile.collectors",
    target: "wxwatch",
  },
  {
    name: "gms-ingest",
    dockerfile: "infra/weather/Dockerfile.collectors",
    target: "gms-ingest",
  },
];

// Unknown inputs invalidate every image. Shared packages conservatively
// invalidate all Node consumers, including indirect dependencies.
const allImages = { web: webImages, weather: weatherImages, api: true };
const noImages = { web: [], weather: [], api: false };
function imagesForPath(path) {
  // Python workspace metadata is copied by both API and collector builds.
  // Check it before narrowing a path to its owning application.
  if (path === "pyproject.toml" || path.endsWith("/pyproject.toml"))
    return allImages;
  if (nonImagePath.test(path) || rootMarkdown.test(path)) return noImages;
  if (path.startsWith("surface/"))
    return { ...noImages, weather: [weatherImages[0]] };
  if (path.startsWith("packages/") || workspaceManifest.test(path))
    return { ...noImages, web: webImages };
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
  try {
    selection = selectImages(
      mode === "affected"
        ? changedPaths(JSON.parse(readFileSync(eventPath, "utf8")))
        : [],
      mode
    );
  } catch {
    console.error("Image comparison unavailable; checking every image.");
    selection = selectImages([], "full");
  }
  for (const [key, value] of Object.entries(selection))
    appendFileSync(output, `${key}=${JSON.stringify(value)}\n`);
}
