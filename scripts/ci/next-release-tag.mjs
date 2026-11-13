import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Release tags are `vX.Y.Z` since v1.0.0 and only ever increase. Older
// releases used `vN.M` (v0.9 ... v0.32); they still count when finding the
// latest tag, as `vN.M.0`. Anything else (for example a stray `v.03` or
// `v1.0.4-rc1`) is ignored.
const ANY_RELEASE_TAG = /^v(\d+)\.(\d+)(?:\.(\d+))?$/u;
const NEW_RELEASE_TAG = /^v\d+\.\d+\.\d+$/u;

function parse(tag) {
  const match = ANY_RELEASE_TAG.exec(tag.trim());
  if (!match) {
    return null;
  }
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)],
    tag: tag.trim(),
  };
}

function isHigher(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] > b[index];
    }
  }
  return false;
}

/** The highest release tag, compared numerically, or null when there is none. */
export function latestReleaseTag(tags) {
  let best = null;
  for (const tag of tags) {
    const parsed = parse(tag);
    if (parsed && (!best || isHigher(parsed.parts, best.parts))) {
      best = parsed;
    }
  }
  return best?.tag ?? null;
}

/** The next tag: the latest release with its patch number plus one. */
export function nextReleaseTag(tags) {
  const latest = latestReleaseTag(tags);
  if (!latest) {
    throw new Error("No existing release tag to increment");
  }
  const [major, minor, patch] = parse(latest).parts;
  return `v${major}.${minor}.${patch + 1}`;
}

/** True when a hand-typed tag has the `vX.Y.Z` shape new releases use. */
export function isReleaseTag(tag) {
  return NEW_RELEASE_TAG.test(tag);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tags = readFileSync(0, "utf8").split("\n").filter(Boolean);
  if (process.argv.includes("--validate")) {
    const tag = process.argv[process.argv.indexOf("--validate") + 1] ?? "";
    if (!isReleaseTag(tag)) {
      console.error(`"${tag}" is not a vX.Y.Z release tag`);
      process.exit(1);
    }
    process.exit(0);
  }
  const result = process.argv.includes("--latest")
    ? latestReleaseTag(tags)
    : nextReleaseTag(tags);
  if (!result) {
    console.error("No existing release tag found");
    process.exit(1);
  }
  console.log(result);
}
