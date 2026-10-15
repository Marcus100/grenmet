// Fails when a web app's port disagrees between docs/ports.md and the files
// that must repeat it (see "Where each web-app port lives" in docs/ports.md).
// Usage: node scripts/ci/check-ports.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SECTION_END = /\n#{2,3} /;
const SERVICE_START = /^ {2}\S/;
const PORT_FLAG = /--port (\d+)/;
const EXPOSE_LINE = /^EXPOSE (\d+)/m;
const ENV_PORT_LINE = /^ENV PORT=(\d+)/m;
const AGENTS_PORT_HEADER = /^Port \*\*(\d+)\*\*/m;
const HEALTHCHECK_PORT = /127\.0\.0\.1:(\d+)/;
const defaultRoot = fileURLToPath(new URL("../..", import.meta.url));
const PORT_PATTERN = "(\\d{4,5})";

const read = (root, path) => readFileSync(join(root, path), "utf8");
const maybeRead = (root, path) =>
  existsSync(join(root, path)) ? read(root, path) : null;

function section(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) return "";
  const rest = markdown.slice(start + heading.length);
  const end = rest.search(SECTION_END);
  return end === -1 ? rest : rest.slice(0, end);
}

/** `| events | `@barrelsgd/web-events` | 3009 |` rows of the web-app table. */
export function parseWebApps(markdown) {
  const rows = section(markdown, "## Web apps");
  const apps = new Map();
  for (const match of rows.matchAll(
    /^\|\s*([a-z0-9-]+)\s*\|\s*`([^`]+)`\s*\|\s*(\d{4,5})\s*\|/gm
  )) {
    apps.set(match[1], { pkg: match[2], port: Number(match[3]) });
  }
  return apps;
}

/** `| 3008 | `@barrelsgd/web-shop` (...) | Reserved |` rows. */
export function parseReserved(markdown) {
  const rows = section(markdown, "### Reserved and planned");
  const reserved = new Map();
  for (const match of rows.matchAll(/^\|\s*(\d{4,5})\s*\|\s*`([^`]+)`/gm)) {
    reserved.set(Number(match[1]), match[2]);
  }
  return reserved;
}

function expectPort(errors, label, actual, expected) {
  if (actual === null || actual === undefined) {
    errors.push(`${label}: no port found, expected ${expected}`);
  } else if (Number(actual) !== expected) {
    errors.push(`${label}: ${actual}, but docs/ports.md says ${expected}`);
  }
}

function serviceBlock(compose, service) {
  const lines = compose.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`  ${service}:`));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (SERVICE_START.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function checkApp(root, errors, dir, { port }) {
  const base = `apps/web/${dir}`;
  const pkg = JSON.parse(read(root, `${base}/package.json`));
  for (const script of ["dev", "start"]) {
    const found = pkg.scripts?.[script]?.match(PORT_FLAG)?.[1];
    expectPort(errors, `${base}/package.json scripts.${script}`, found, port);
  }
  const dockerfile = maybeRead(root, `${base}/Dockerfile`);
  if (dockerfile !== null) {
    const expose = dockerfile.match(EXPOSE_LINE)?.[1];
    const env = dockerfile.match(ENV_PORT_LINE)?.[1];
    expectPort(errors, `${base}/Dockerfile EXPOSE`, expose, port);
    expectPort(errors, `${base}/Dockerfile ENV PORT`, env, port);
  }
  const agents = maybeRead(root, `${base}/AGENTS.md`);
  if (agents !== null) {
    const header = agents.match(AGENTS_PORT_HEADER)?.[1];
    expectPort(errors, `${base}/AGENTS.md "Port" header`, header, port);
  }
}

async function checkDeployed(root, errors, apps) {
  const scopePath = join(root, "scripts/ci/release-scope.mjs");
  if (!existsSync(scopePath)) return;
  const { webImages } = await import(
    `${pathToFileURL(scopePath).href}?root=${encodeURIComponent(root)}`
  );
  const compose = maybeRead(root, "infra/docker/docker-compose.deploy.yml");
  for (const image of webImages) {
    if (image.port === undefined) continue;
    const dir = image.path.replace("apps/web/", "");
    const documented = apps.get(dir);
    if (!documented) {
      errors.push(
        `release-scope.mjs: ${image.app} (${dir}) is not in docs/ports.md`
      );
      continue;
    }
    expectPort(
      errors,
      `release-scope.mjs ${image.app}`,
      image.port,
      documented.port
    );
    if (compose === null) continue;
    const label = `docker-compose.deploy.yml web-${image.app}`;
    const traefik = compose.match(
      new RegExp(
        `traefik\\.http\\.services\\.web-${image.app}\\$\\{ROUTER_SUFFIX\\}\\.loadbalancer\\.server\\.port=${PORT_PATTERN}`
      )
    )?.[1];
    expectPort(errors, `${label} Traefik port`, traefik, documented.port);
    const block = serviceBlock(compose, `web-${image.app}`);
    const health = block?.match(HEALTHCHECK_PORT)?.[1];
    expectPort(errors, `${label} healthcheck`, health, documented.port);
  }
}

/** Returns a list of human-readable problems; empty means the ports agree. */
export async function checkPorts(root = defaultRoot) {
  const errors = [];
  const markdown = read(root, "docs/ports.md");
  const apps = parseWebApps(markdown);
  const reserved = parseReserved(markdown);

  const seen = new Map();
  for (const [dir, { pkg, port }] of apps) {
    if (seen.has(port)) {
      errors.push(
        `docs/ports.md: port ${port} is used by both ${seen.get(port)} and ${dir}`
      );
    }
    seen.set(port, dir);
    const owner = reserved.get(port);
    if (owner !== undefined && owner !== pkg) {
      errors.push(
        `docs/ports.md: port ${port} is reserved for ${owner}, not ${pkg}`
      );
    }
    if (existsSync(join(root, `apps/web/${dir}/package.json`))) {
      checkApp(root, errors, dir, { port });
    } else {
      errors.push(`docs/ports.md: ${dir} has no apps/web/${dir}/package.json`);
    }
  }

  // Any app that serves on a port must be documented.
  for (const dir of readdirSync(join(root, "apps/web"))) {
    const path = `apps/web/${dir}/package.json`;
    if (!existsSync(join(root, path)) || apps.has(dir)) continue;
    const pkg = JSON.parse(read(root, path));
    if (PORT_FLAG.test(pkg.scripts?.dev ?? "")) {
      errors.push(
        `${path}: serves on a port but ${dir} is not in docs/ports.md`
      );
    }
  }

  await checkDeployed(root, errors, apps);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = await checkPorts();
  if (errors.length > 0) {
    console.error(`Port check failed:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(
    "Ports agree across docs/ports.md and the files that repeat them."
  );
}
