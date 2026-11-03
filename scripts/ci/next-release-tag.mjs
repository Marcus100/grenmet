import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Release tags follow `vN.M` and only ever increase (v0.9, v0.10, v0.23, ...).
// Anything else in the list (for example a stray `v.03`) is ignored.
const RELEASE_TAG = /^v(\d+)\.(\d+)$/u;

/** The highest `vN.M` tag, compared numerically, or null when there is none. */
export function latestReleaseTag(tags) {
  let best = null;
  for (const tag of tags) {
    const match = RELEASE_TAG.exec(tag.trim());
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (
      !best ||
      major > best.major ||
      (major === best.major && minor > best.minor)
    ) {
      best = { major, minor, tag: tag.trim() };
    }
  }
  return best?.tag ?? null;
}

/** The next tag: the highest existing `vN.M` with its minor number plus one. */
export function nextReleaseTag(tags) {
  const latest = latestReleaseTag(tags);
  if (!latest) throw new Error("No existing vN.M release tag to increment");
  const [, major, minor] = RELEASE_TAG.exec(latest);
  return `v${major}.${Number(minor) + 1}`;
}

/** True when a hand-typed tag has the `vN.M` shape. */
export function isReleaseTag(tag) {
  return RELEASE_TAG.test(tag);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tags = readFileSync(0, "utf8").split("\n").filter(Boolean);
  if (process.argv.includes("--validate")) {
    const tag = process.argv[process.argv.indexOf("--validate") + 1] ?? "";
    if (!isReleaseTag(tag)) {
      console.error(`"${tag}" is not a vN.M release tag`);
      process.exit(1);
    }
    process.exit(0);
  }
  const result = process.argv.includes("--latest")
    ? latestReleaseTag(tags)
    : nextReleaseTag(tags);
  if (!result) {
    console.error("No existing vN.M release tag found");
    process.exit(1);
  }
  console.log(result);
}
