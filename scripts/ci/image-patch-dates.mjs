#!/usr/bin/env node
// Date-keyed OS package upgrades in the release images (issue #1142).
//
// Every web Dockerfile runs `apk upgrade` behind ARG ALPINE_PATCH_DATE, and the
// API runs `apt-get upgrade` behind ARG DEBIAN_PATCH_DATE. BuildKit reuses the
// cached upgrade layer until that date changes, so fixing an OS package CVE in
// a reused image means bumping one date. This keeps those dates consistent and
// lets the daily image scan decide which Dockerfiles to bump.
//
//   image-patch-dates.mjs check                     every date valid, one per family
//   image-patch-dates.mjs bump <YYYY-MM-DD> [family] set the date (alpine | debian | all)
//   image-patch-dates.mjs plan <key>=<trivy.json>... which Dockerfiles a bump fixes
//   image-patch-dates.mjs targets tags <tag>...      scan matrix: every image at each tag
//   image-patch-dates.mjs targets digests "<list>"   scan matrix: promoted digests
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluate } from "./check-vulnerabilities.mjs";
import { imageRepositories, parseDigests } from "./promote-images.mjs";
import { webImages } from "./release-scope.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const TAG = /^[\w][\w.-]{0,127}$/u;
const ARG_LINE = /^ARG (ALPINE|DEBIAN)_PATCH_DATE=(\S*)$/mu;
const OS_TARGET = /\((alpine|debian) [^)]+\)$/u;

export const FAMILIES = { alpine: "ALPINE", debian: "DEBIAN" };

/**
 * Release image key → `{ dockerfile, scope }`, the API first. `scope` matches
 * the build workflows' scan scope (Dockerfile#target), which keys exceptions.
 * cms-migrate shares cms's Dockerfile.
 */
export function releaseImages() {
  const api = "apps/api/fastapi/Dockerfile.prod";
  const images = new Map([
    ["api", { dockerfile: api, scope: `${api}#runtime` }],
  ]);
  for (const image of webImages) {
    const dockerfile = `${image.path}/Dockerfile`;
    images.set(image.image, {
      dockerfile,
      scope: `${dockerfile}#${image.target ?? "runner"}`,
    });
  }
  return images;
}

export function isValidDate(value) {
  if (!DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
  );
}

/** The patch-date ARG of one Dockerfile: `{ family, date }`, or null. */
export function readPatchDate(text) {
  const match = ARG_LINE.exec(text);
  if (!match) {
    return null;
  }
  return { family: match[1].toLowerCase(), date: match[2] };
}

/** Text with the patch date set to `date`; never moves a date backwards. */
export function bumpPatchDate(text, date) {
  if (!isValidDate(date)) {
    throw new Error(`Invalid patch date: ${date}`);
  }
  const current = readPatchDate(text);
  if (!current) {
    throw new Error("No ALPINE_PATCH_DATE or DEBIAN_PATCH_DATE ARG");
  }
  if (current.date >= date) {
    return text;
  }
  return text.replace(
    ARG_LINE,
    `ARG ${FAMILIES[current.family]}_PATCH_DATE=${date}`
  );
}

/** Problems with the dates across Dockerfiles: `{ path: text }` in, strings out. */
export function checkPatchDates(texts) {
  const errors = [];
  const byFamily = new Map();
  for (const [path, text] of Object.entries(texts)) {
    const current = readPatchDate(text);
    if (!current) {
      errors.push(`${path}: no ALPINE_PATCH_DATE or DEBIAN_PATCH_DATE ARG`);
      continue;
    }
    if (!isValidDate(current.date)) {
      errors.push(`${path}: invalid patch date ${current.date}`);
    }
    const dates = byFamily.get(current.family) ?? new Set();
    dates.add(current.date);
    byFamily.set(current.family, dates);
  }
  for (const [family, dates] of byFamily) {
    if (dates.size > 1) {
      errors.push(
        `${family} Dockerfiles disagree on the patch date: ${[...dates].sort().join(", ")}`
      );
    }
  }
  return errors;
}

/** The OS family of a Trivy target such as "image (alpine 3.22.2)", or null. */
export function osFamily(target) {
  return OS_TARGET.exec(target ?? "")?.[1] ?? null;
}

/**
 * From blocked findings per image (`[{ key, blocked }]`, `blocked` as returned
 * by check-vulnerabilities.mjs evaluate), the Dockerfiles a patch-date bump
 * can fix and the findings it cannot (language packages, unknown images).
 */
export function planFixes(scans, images = releaseImages()) {
  const bump = new Set();
  const unfixable = [];
  for (const { key, blocked } of scans) {
    for (const finding of blocked) {
      const path = images.get(key)?.dockerfile;
      if (path && osFamily(finding.target)) {
        bump.add(path);
      } else {
        unfixable.push({ key, ...finding });
      }
    }
  }
  return { bump: [...bump].sort(), unfixable };
}

/**
 * Images to scan, as a workflow matrix: `[{ key, ref, scope, name }]`.
 * `digests` is the promote output (`repo@sha256:… …`); otherwise every
 * release image at each of `tags` (for example dev, staging, latest).
 */
export function scanTargets({ owner, repository, digests, tags = [] }) {
  const images = releaseImages();
  const repositories = imageRepositories(owner, repository);
  const targets = [];
  const add = (key, ref, label) => {
    const scope = images.get(key)?.scope;
    if (!scope) {
      throw new Error(`No Dockerfile scope for image ${key}`);
    }
    targets.push({ key, ref, scope, name: `${key}-${label}` });
  };
  if (digests) {
    for (const { repo, digest } of parseDigests(digests)) {
      const match = repositories.find((item) => item.repo === repo);
      if (!match) {
        throw new Error(`Digest for an unknown repository: ${repo}`);
      }
      add(match.key, `${repo}@${digest}`, digest.slice(7, 19));
    }
    return targets;
  }
  for (const tag of tags) {
    if (!TAG.test(tag)) {
      throw new Error(`Invalid tag: ${tag}`);
    }
    for (const { key, repo } of repositories) {
      add(key, `${repo}:${tag}`, tag);
    }
  }
  return targets;
}

function readTexts(paths) {
  return Object.fromEntries(
    paths.map((path) => [path, readFileSync(`${ROOT}${path}`, "utf8")])
  );
}

function uniqueFiles() {
  return [
    ...new Set([...releaseImages().values()].map((image) => image.dockerfile)),
  ];
}

export function run(argv, { log = console.log, env = process.env } = {}) {
  const [command, ...rest] = argv;
  if (command === "check") {
    const errors = checkPatchDates(readTexts(uniqueFiles()));
    log(
      errors.length ? errors.join("\n") : "Image patch dates are consistent."
    );
    return errors.length ? 1 : 0;
  }
  if (command === "bump") {
    const [date, family = "all"] = rest;
    if (!(family === "all" || Object.hasOwn(FAMILIES, family))) {
      throw new Error(`Unknown family: ${family}`);
    }
    for (const [path, text] of Object.entries(readTexts(uniqueFiles()))) {
      if (family !== "all" && readPatchDate(text)?.family !== family) {
        continue;
      }
      const next = bumpPatchDate(text, date);
      if (next !== text) {
        writeFileSync(`${ROOT}${path}`, next);
        log(`bumped ${path}`);
      }
    }
    return 0;
  }
  if (command === "plan") {
    const policy = JSON.parse(
      readFileSync(
        `${ROOT}.github/security/vulnerability-exceptions.json`,
        "utf8"
      )
    );
    const scans = rest.map((pair) => {
      const [key, reportPath] = pair.split("=");
      const scope = releaseImages().get(key)?.scope;
      if (!(scope && reportPath)) {
        throw new Error(`Expected <image key>=<trivy report>, got ${pair}`);
      }
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      return { key, blocked: evaluate(report, policy, scope).blocked };
    });
    log(JSON.stringify(planFixes(scans), null, 2));
    return 0;
  }
  if (command === "targets") {
    return runTargets(rest, { log, env });
  }
  throw new Error(
    "Usage: image-patch-dates.mjs check | bump <date> | plan | targets"
  );
}

function runTargets([mode, ...values], { log, env }) {
  if (!(mode === "tags" || mode === "digests")) {
    throw new Error("Usage: targets tags <tag>... | targets digests <list>");
  }
  const targets = scanTargets({
    owner: env.GITHUB_REPOSITORY_OWNER,
    repository: env.GITHUB_REPOSITORY,
    ...(mode === "tags" ? { tags: values } : { digests: values.join(" ") }),
  });
  if (targets.length === 0) {
    throw new Error("No images to scan");
  }
  const json = JSON.stringify(targets);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `targets=${json}\n`);
  }
  log(json);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
