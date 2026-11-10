// Mirror third-party base images into GHCR (issue #816).
//
// Docker Hub rate-limits CI (`429 Too Many Requests`) because ~15 PRs build 13+
// images at once. Every third-party Docker Hub image the repository builds from
// or runs as a service container is copied, by digest, to
// `ghcr.io/<owner>/base/<name>`, and the Dockerfiles and workflows reference
// the mirror. This file is the single source of truth: it reads the Dockerfiles,
// compose files and workflows, and derives the list of images to mirror.
//
//   base-images.mjs list  [--root DIR]... [--json]   every managed image reference
//   base-images.mjs plan  [--root DIR]... [--owner O] copy operations for the mirror workflow (JSON)
//   base-images.mjs check [--root DIR] [--require-mirror]  unpinned / unmirrored references
//   base-images.mjs bump  [--root DIR] [--apply]     move pinned digests to the mirror's current tag
//
// Mapping (same digest, so pinning is preserved):
//   docker.io/library/node@sha256:X        -> ghcr.io/marcus100/base/node@sha256:X
//   docker.io/postgis/postgis@sha256:X     -> ghcr.io/marcus100/base/postgis/postgis@sha256:X
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_OWNER = "marcus100";
const HUB = "docker.io";
const GHCR = "ghcr.io";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const NAME =
  /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:\/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*$/u;
const TAG = /^\w[\w.-]{0,127}$/u;
const OWNER = /^[a-z0-9](?:[a-z0-9-]{0,38})$/u;
const HUB_HOSTS = new Set([
  "docker.io",
  "index.docker.io",
  "registry-1.docker.io",
]);
const MIRROR_TAG_PREFIX = "sha256-";

const DOCKERFILE_NAME = /^(?:Dockerfile(?:\..+)?|.+\.dockerfile)$/u;
const COMPOSE_NAME = /^(?:docker-)?compose(?:[.-].+)?\.ya?ml$/u;
const YAML_NAME = /\.ya?ml$/u;
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "__pycache__",
]);
const KEPT_DOT_DIRECTORIES = new Set([".github", ".devcontainer"]);

const FROM_LINE = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/iu;
const COPY_FROM = /^\s*COPY\s+.*?--from=(\S+)/iu;
const IMAGE_KEY = /^(\s*)(?:-\s+)?image:\s*(.*?)\s*$/u;
const BLOCK_KEY = /^(\s*)(services|container):\s*(.*?)\s*$/u;
const DRIVER_IMAGE = /(?:^|\s|["'])image=([^\s"']+)/u;
const COMMENT = /\s+#.*$/u;
const QUOTES = /^["']|["']$/gu;
const NUMERIC = /^\d+$/u;
const PATH_SEPARATOR = /[\\/]/gu;

/**
 * Images that actions pull without naming them in a repository file: the
 * default BuildKit builder of docker/setup-buildx-action. Workflows point
 * `driver-opts: image=` at the mirror copy; the mirror always carries it.
 */
export const IMPLICIT_IMAGES = ["moby/buildkit:buildx-stable-1"];

/** Hub references that intentionally stay on Docker Hub (local dev, vendored). */
export const HUB_ALLOWED_PREFIXES = [".devcontainer/", "surface/"];

/**
 * Split an image reference into registry, repository, tag and digest. Docker
 * Hub shorthand is normalised (`node` -> `docker.io/library/node`). Returns
 * null for anything that is not a valid reference.
 */
export function parseReference(reference) {
  let rest = reference.trim();
  let digest = null;
  const at = rest.indexOf("@");
  if (at !== -1) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
    if (!DIGEST.test(digest)) {
      return null;
    }
  }
  let tag = null;
  const colon = rest.indexOf(":", rest.lastIndexOf("/") + 1);
  if (colon !== -1) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
    if (!TAG.test(tag)) {
      return null;
    }
  }
  const parts = rest.split("/");
  let registry = HUB;
  const [first] = parts;
  if (
    parts.length > 1 &&
    (first.includes(".") || first.includes(":") || first === "localhost")
  ) {
    registry = parts.shift().toLowerCase();
  }
  if (HUB_HOSTS.has(registry)) {
    registry = HUB;
  }
  let repository = parts.join("/");
  if (!NAME.test(repository)) {
    return null;
  }
  if (registry === HUB && !repository.includes("/")) {
    repository = `library/${repository}`;
  }
  return { registry, repository, tag, digest };
}

function mirrorPrefix(owner) {
  return `${owner}/base/`;
}

function assertOwner(owner) {
  if (!OWNER.test(owner)) {
    throw new Error(`Invalid registry owner: ${owner}`);
  }
}

/**
 * Describe a reference as a managed third-party image, or null when it is not
 * one (a registry other than Docker Hub and the mirror, or a local image).
 */
export function describe(reference, owner = DEFAULT_OWNER) {
  assertOwner(owner);
  const parsed = parseReference(reference);
  if (!parsed) {
    return null;
  }
  const prefix = mirrorPrefix(owner);
  const { digest, tag } = parsed;
  if (parsed.registry === GHCR && parsed.repository.startsWith(prefix)) {
    const name = parsed.repository.slice(prefix.length);
    const upstreamName = name.includes("/") ? name : `library/${name}`;
    return {
      upstream: `${HUB}/${upstreamName}`,
      mirror: `${GHCR}/${parsed.repository}`,
      tag,
      digest,
      onMirror: true,
    };
  }
  if (parsed.registry === HUB) {
    const name = parsed.repository.startsWith("library/")
      ? parsed.repository.slice("library/".length)
      : parsed.repository;
    return {
      upstream: `${HUB}/${parsed.repository}`,
      mirror: `${GHCR}/${prefix}${name}`,
      tag,
      digest,
      onMirror: false,
    };
  }
  return null;
}

/** The mirror reference for an image, keeping its tag (informational) and digest. */
export function mirrorReference(image) {
  const tag = image.tag ? `:${image.tag}` : "";
  const digest = image.digest ? `@${image.digest}` : "";
  return `${image.mirror}${tag}${digest}`;
}

function unquote(value) {
  return value.replace(COMMENT, "").replace(QUOTES, "");
}

function isDynamic(value) {
  return value.includes("$") || value.includes("{{");
}

function scanDockerfile(text) {
  const items = [];
  const stages = new Set();
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    const from = FROM_LINE.exec(line);
    const copy = from ? null : COPY_FROM.exec(line);
    const found = from ?? copy;
    if (found) {
      const reference = found[1];
      const isStage =
        stages.has(reference.toLowerCase()) ||
        NUMERIC.test(reference) ||
        reference.toLowerCase() === "scratch";
      if (!(isStage || isDynamic(reference))) {
        items.push({
          line: index + 1,
          reference,
          context: from ? "from" : "copy",
        });
      }
    }
    if (from?.[2]) {
      stages.add(from[2].toLowerCase());
    }
  }
  return items;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isBlank(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/** A `services:` or `container:` key in a workflow, with its inline image if any. */
function blockStart(line, number) {
  const match = BLOCK_KEY.exec(line);
  if (!match) {
    return null;
  }
  const scalar = unquote(match[3]);
  const item =
    match[2] === "container" && scalar && !isDynamic(scalar)
      ? { line: number, reference: scalar, context: "service" }
      : null;
  return { indent: match[1].length, item };
}

function imageItem(line, number, { workflow, block }) {
  const driver = workflow ? DRIVER_IMAGE.exec(line) : null;
  if (driver) {
    return isDynamic(driver[1])
      ? null
      : { line: number, reference: driver[1], context: "driver" };
  }
  const image = IMAGE_KEY.exec(line);
  if (!image) {
    return null;
  }
  const reference = unquote(image[2]);
  const allowed = workflow ? block && image[1].length > block.indent : true;
  if (!(reference && allowed) || isDynamic(reference)) {
    return null;
  }
  return {
    line: number,
    reference,
    context: workflow ? "service" : "compose",
  };
}

function scanYaml(text, { workflow }) {
  const items = [];
  let block = null;
  for (const [index, line] of text.split("\n").entries()) {
    if (isBlank(line)) {
      continue;
    }
    if (block && indentOf(line) <= block.indent) {
      block = null;
    }
    const started = workflow ? blockStart(line, index + 1) : null;
    if (started) {
      block = started;
      if (started.item) {
        items.push(started.item);
      }
      continue;
    }
    const item = imageItem(line, index + 1, { workflow, block });
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/**
 * Every image reference in one file. `file` is the repository-relative path,
 * which decides how the text is read (Dockerfile, compose file or workflow).
 */
export function scanFile(file, text, owner = DEFAULT_OWNER) {
  const name = file.split("/").at(-1);
  let raw = [];
  if (DOCKERFILE_NAME.test(name)) {
    raw = scanDockerfile(text);
  } else if (
    YAML_NAME.test(name) &&
    (file.startsWith(".github/workflows/") ||
      file.startsWith(".github/actions/"))
  ) {
    raw = scanYaml(text, { workflow: true });
  } else if (COMPOSE_NAME.test(name)) {
    raw = scanYaml(text, { workflow: false });
  }
  const items = [];
  for (const item of raw) {
    const image = describe(item.reference, owner);
    if (!image) {
      continue;
    }
    // Compose files also hold local build outputs (`grenmet-api:local`); only
    // pinned or mirrored references there are third-party images we manage.
    if (item.context === "compose" && !(image.digest || image.onMirror)) {
      continue;
    }
    items.push({ ...item, file, image });
  }
  return items;
}

function* walk(root, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const hidden = entry.name.startsWith(".");
      if (
        SKIPPED_DIRECTORIES.has(entry.name) ||
        (hidden && !KEPT_DOT_DIRECTORIES.has(entry.name))
      ) {
        continue;
      }
      yield* walk(root, path);
    } else if (entry.isFile()) {
      yield relative(root, path).replace(PATH_SEPARATOR, "/");
    }
  }
}

/** Scan a checkout for image references. */
export function scanRoot(root, owner = DEFAULT_OWNER) {
  const items = [];
  for (const file of walk(root)) {
    const name = file.split("/").at(-1);
    if (
      !(
        DOCKERFILE_NAME.test(name) ||
        COMPOSE_NAME.test(name) ||
        (YAML_NAME.test(name) && file.startsWith(".github/"))
      )
    ) {
      continue;
    }
    items.push(
      ...scanFile(file, readFileSync(join(root, file), "utf8"), owner)
    );
  }
  return items;
}

/** Group scanned references into one entry per image (upstream, tag, digest). */
export function inventory(items) {
  const entries = new Map();
  for (const item of items) {
    const { image } = item;
    const key = `${image.upstream}|${image.tag ?? ""}|${image.digest ?? ""}`;
    const entry = entries.get(key) ?? {
      upstream: image.upstream,
      mirror: image.mirror,
      tag: image.tag,
      digest: image.digest,
      sources: [],
    };
    entry.sources.push({
      file: item.file,
      line: item.line,
      context: item.context,
      onMirror: image.onMirror,
    });
    entries.set(key, entry);
  }
  return [...entries.values()].sort((a, b) =>
    `${a.upstream}${a.tag}${a.digest}`.localeCompare(
      `${b.upstream}${b.tag}${b.digest}`
    )
  );
}

/**
 * Copy operations for the mirror workflow. A pinned reference is copied by
 * digest to a `sha256-<hex>` tag (which keeps the digest from being garbage
 * collected). Every tagged reference also refreshes the mirror's floating tag
 * from the upstream tag, so Dependabot and `bump` see newer digests that are
 * already in the mirror.
 */
export function plan(entries, owner = DEFAULT_OWNER) {
  const operations = new Map();
  const implicit = IMPLICIT_IMAGES.map((reference) => ({
    ...describe(reference, owner),
    sources: [],
  }));
  for (const entry of [...entries, ...implicit]) {
    // Unpinned Docker Hub references that nothing points at the mirror for
    // (vendored SURFACE files) stay where they are; there is nothing to track.
    const mirrored =
      entry.digest ||
      entry.sources.length === 0 ||
      entry.sources.some((source) => source.onMirror);
    if (entry.digest) {
      const target = `${entry.mirror}:${MIRROR_TAG_PREFIX}${entry.digest.slice("sha256:".length)}`;
      operations.set(target, {
        kind: "pinned",
        source: `${entry.upstream}@${entry.digest}`,
        target,
        repository: entry.mirror,
        digest: entry.digest,
      });
    }
    if (mirrored && entry.tag && !entry.tag.startsWith(MIRROR_TAG_PREFIX)) {
      const target = `${entry.mirror}:${entry.tag}`;
      operations.set(target, {
        kind: "track",
        source: `${entry.upstream}:${entry.tag}`,
        target,
        repository: entry.mirror,
        digest: null,
      });
    }
  }
  return [...operations.values()].sort((a, b) =>
    a.target.localeCompare(b.target)
  );
}

function isAllowedOnHub(file) {
  return HUB_ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/**
 * Problems with the references found. Unpinned Dockerfile and service-container
 * images are errors (except under the allowed Docker Hub paths); with `requireMirror`, any Docker Hub reference
 * outside the allowed paths is too.
 */
export function check(items, { requireMirror = false } = {}) {
  const errors = [];
  for (const item of items) {
    const { image, file, line, context } = item;
    const where = `${file}:${line}`;
    const managed =
      context === "from" || context === "copy" || context === "service";
    if (managed && !image.digest && !isAllowedOnHub(file)) {
      errors.push({
        file,
        line,
        context,
        message: `${where}: ${item.reference} is not pinned to a digest`,
      });
    }
    if (context === "driver" && !image.onMirror && requireMirror) {
      errors.push({
        file,
        line,
        context,
        message: `${where}: ${item.reference} must come from the mirror`,
      });
    }
    if (requireMirror && !image.onMirror && !isAllowedOnHub(file)) {
      errors.push({
        file,
        line,
        context,
        message: `${where}: ${item.reference} pulls from Docker Hub; use ${mirrorReference(image)}`,
      });
    }
  }
  return errors;
}

function resolveWithDocker(reference) {
  return execFileSync(
    "docker",
    [
      "buildx",
      "imagetools",
      "inspect",
      reference,
      "--format",
      "{{.Manifest.Digest}}",
    ],
    { encoding: "utf8" }
  ).trim();
}

/**
 * For each pinned, tagged reference, look up the digest the mirror's floating
 * tag points to now. Returns the references that would move.
 */
export function bump(items, resolve = resolveWithDocker) {
  const cache = new Map();
  const changes = [];
  for (const item of items) {
    const { image } = item;
    if (
      !(image.digest && image.tag) ||
      image.tag.startsWith(MIRROR_TAG_PREFIX)
    ) {
      continue;
    }
    const floating = `${image.mirror}:${image.tag}`;
    if (!cache.has(floating)) {
      cache.set(floating, resolve(floating));
    }
    const latest = cache.get(floating);
    if (!DIGEST.test(latest)) {
      throw new Error(`Unexpected digest for ${floating}: ${latest}`);
    }
    if (latest !== image.digest) {
      changes.push({ ...item, from: image.digest, to: latest });
    }
  }
  return changes;
}

/** Rewrite the digest on the lines `bump` found. */
export function applyBump(root, changes) {
  const byFile = Map.groupBy(changes, (change) => change.file);
  for (const [file, fileChanges] of byFile) {
    const path = join(root, file);
    const lines = readFileSync(path, "utf8").split("\n");
    for (const change of fileChanges) {
      const text = lines[change.line - 1];
      if (!text.includes(change.from)) {
        throw new Error(
          `${change.file}:${change.line} no longer holds ${change.from}`
        );
      }
      lines[change.line - 1] = text.replace(change.from, change.to);
    }
    writeFileSync(path, lines.join("\n"));
  }
}

function parseArguments(argv) {
  const options = {
    roots: [],
    owner: null,
    json: false,
    requireMirror: false,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      index += 1;
      options.roots.push(argv[index]);
    } else if (argument === "--owner") {
      index += 1;
      options.owner = argv[index];
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--require-mirror") {
      options.requireMirror = true;
    } else if (argument === "--apply") {
      options.apply = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.roots.length === 0) {
    options.roots.push(".");
  }
  options.owner = (
    options.owner ??
    process.env.GITHUB_REPOSITORY_OWNER ??
    DEFAULT_OWNER
  ).toLowerCase();
  return options;
}

function formatList(entries) {
  return entries
    .map((entry) => {
      const where = entry.sources.map(
        (source) => `${source.file}:${source.line}`
      );
      return `${entry.upstream}${entry.tag ? `:${entry.tag}` : ""}${entry.digest ? `@${entry.digest}` : ""}\n  -> ${mirrorReference(entry)}\n  ${where.join("\n  ")}`;
    })
    .join("\n");
}

export function main(argv) {
  const [command, ...rest] = argv;
  const options = parseArguments(rest);
  const items = options.roots.flatMap((root) => scanRoot(root, options.owner));
  if (command === "list") {
    const entries = inventory(items);
    console.log(
      options.json ? JSON.stringify(entries, null, 2) : formatList(entries)
    );
    return 0;
  }
  if (command === "plan") {
    console.log(
      JSON.stringify(
        {
          owner: options.owner,
          operations: plan(inventory(items), options.owner),
        },
        null,
        2
      )
    );
    return 0;
  }
  if (command === "check") {
    const errors = check(items, { requireMirror: options.requireMirror });
    for (const error of errors) {
      console.error(error.message);
    }
    return errors.length === 0 ? 0 : 1;
  }
  if (command === "bump") {
    const [root] = options.roots;
    const changes = bump(items);
    for (const change of changes) {
      console.log(
        `${change.file}:${change.line} ${change.from} -> ${change.to}`
      );
    }
    if (options.apply) {
      applyBump(root, changes);
    }
    return 0;
  }
  console.error(
    "Usage: base-images.mjs list|plan|check|bump [--root DIR] [--owner O] [--json] [--require-mirror] [--apply]"
  );
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
