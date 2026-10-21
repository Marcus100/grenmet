// Fails when a web app's port disagrees between docs/ports.md and the files
// that must repeat it (see "Where each web-app port lives" in docs/ports.md),
// when port ranges overlap or a vendored port sits inside a Barrels range
// without an exception row, when a retired port is in use, and when the
// hostnames in the ports.md domain table disagree with the Host() rules in
// docker-compose.deploy.yml. The range, retired and hostname checks run only
// when docs/ports.md has the matching section.
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

/** Rows of a markdown table section as trimmed cells (rule rows dropped, header kept). */
function tableRows(markdown, heading) {
  return section(markdown, heading)
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(TABLE_EDGE_LEFT, "")
        .replace(TABLE_EDGE_RIGHT, "")
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((cells) => !cells.every((cell) => TABLE_RULE.test(cell)));
}

const TABLE_EDGE_LEFT = /^\|/;
const TABLE_EDGE_RIGHT = /\|$/;
const TABLE_RULE = /^:?-+:?$/;
const BULLET_NAMES = /^- \*\*[^*]+:\*\*\s*(.+)$/;
const TRAILING_DOT = /\.$/;
const RANGE_CELL = /^`(\d{4,5})[–-](\d{4,5})`$/;
const SINGLE_CELL = /^`?(\d{4,5})`?$/;
const PORT_NUMBER = /\b(\d{2,5})\b/g;
const STAGING_HOST = /^([a-z0-9-]+)\.staging\.barrels\.gd$/;
const BARRELS_HOST = /`([a-z0-9-]+)(?:\.staging)?\.barrels\.gd`/g;
const COMPOSE_HOST = /Host\(`([^`$.]+)\.\$\{BASE_DOMAIN\}`\)/g;

/** `| `3000–3019` | Legacy, frozen | ... |` rows of "## Port ranges". */
export function parseRanges(markdown) {
  const ranges = [];
  for (const cells of tableRows(markdown, "## Port ranges")) {
    const match = cells[0]?.match(RANGE_CELL);
    if (match) {
      ranges.push({
        lo: Number(match[1]),
        hi: Number(match[2]),
        name: cells[1] ?? "",
      });
    }
  }
  return ranges;
}

/** `| 3011 | ...` and `| `4000–4099` | ...` rows of "### Retired ports". */
export function parseRetired(markdown) {
  const retired = [];
  for (const cells of tableRows(markdown, "### Retired ports")) {
    const single = cells[0]?.match(SINGLE_CELL);
    const range = cells[0]?.match(RANGE_CELL);
    if (single) {
      retired.push({ lo: Number(single[1]), hi: Number(single[1]) });
    } else if (range) {
      retired.push({ lo: Number(range[1]), hi: Number(range[2]) });
    }
  }
  return retired;
}

/** Infrastructure, API and vendored ports (every number in the port column). */
export function parseFixedPorts(markdown) {
  const tables = {
    "## APIs": "API",
    "## Infrastructure & dev tools": "infrastructure",
    "## Vendored ops apps": "vendored",
  };
  const fixed = [];
  for (const [heading, kind] of Object.entries(tables)) {
    for (const cells of tableRows(markdown, heading).slice(1)) {
      for (const match of (cells[1] ?? "").matchAll(PORT_NUMBER)) {
        fixed.push({ kind, label: cells[0], port: Number(match[1]) });
      }
    }
  }
  return fixed;
}

/** Ports in "### Vendored exceptions inside Barrels ranges". */
export function parseVendoredExceptions(markdown) {
  const ports = new Set();
  const heading = "### Vendored exceptions inside Barrels ranges";
  for (const cells of tableRows(markdown, heading)) {
    const match = cells[0]?.match(SINGLE_CELL);
    if (match) ports.add(Number(match[1]));
  }
  return ports;
}

/** Production and staging labels of "### Served by the DigitalOcean stack". */
export function parseServedHosts(markdown) {
  const rows = tableRows(markdown, "### Served by the DigitalOcean stack");
  const header = rows[0] ?? [];
  const stagingAt = header.indexOf("Staging");
  const productionAt = header.indexOf("Production");
  if (stagingAt === -1 || productionAt === -1) return null;
  const hosts = { production: [], staging: [], badStaging: [] };
  for (const cells of rows.slice(1)) {
    for (const match of (cells[productionAt] ?? "").matchAll(BARRELS_HOST)) {
      hosts.production.push(match[1]);
    }
    for (const match of (cells[stagingAt] ?? "").matchAll(/`([^`]+)`/g)) {
      const staging = match[1].match(STAGING_HOST);
      if (staging) {
        hosts.staging.push(staging[1]);
      } else {
        hosts.badStaging.push(match[1]);
      }
    }
  }
  return hosts;
}

/** Labels (and status cells) of the "### Retired hostnames" table. */
export function parseRetiredHosts(markdown) {
  const hosts = [];
  for (const cells of tableRows(markdown, "### Retired hostnames")) {
    for (const match of (cells[0] ?? "").matchAll(/`([a-z0-9-]+)\.\*`/g)) {
      hosts.push({ label: match[1], status: cells[2] ?? "" });
    }
  }
  return hosts;
}

/** Labels in the planned-hosts and Vercel tables. */
function parsePlannedHosts(markdown) {
  const labels = [];
  const tables = [
    ["### Planned host changes and new hosts", 0],
    ["### Hosted on Vercel", 1],
  ];
  for (const [heading, column] of tables) {
    for (const cells of tableRows(markdown, heading).slice(1)) {
      for (const match of (cells[column] ?? "").matchAll(BARRELS_HOST)) {
        labels.push(match[1]);
      }
    }
  }
  return labels;
}

/** Every comma-separated name in the bullets of "## Reserved names". */
export function parseReservedNames(markdown) {
  const names = new Set();
  for (const line of section(markdown, "## Reserved names").split("\n")) {
    const match = line.match(BULLET_NAMES);
    if (!match) continue;
    for (const name of match[1].replace(TRAILING_DOT, "").split(",")) {
      names.add(name.trim());
    }
  }
  return names;
}

/** Labels of every ``Host(`<label>.${BASE_DOMAIN}`)`` rule in the deploy compose. */
export function composeHostLabels(compose) {
  return new Set([...compose.matchAll(COMPOSE_HOST)].map((match) => match[1]));
}

const inRange = (port, { lo, hi }) => port >= lo && port <= hi;

function checkRangeShapes(ranges, errors) {
  for (const range of ranges) {
    if (range.lo > range.hi) {
      errors.push(`docs/ports.md: range ${range.lo}-${range.hi} is backwards`);
    }
  }
  for (const [i, a] of ranges.entries()) {
    for (const b of ranges.slice(i + 1)) {
      if (a.lo <= b.hi && b.lo <= a.hi) {
        errors.push(
          `docs/ports.md: range ${a.lo}-${a.hi} (${a.name}) overlaps ${b.lo}-${b.hi} (${b.name})`
        );
      }
    }
  }
}

function checkFixedPorts(markdown, errors, { ranges, retired, registry }) {
  const exceptions = parseVendoredExceptions(markdown);
  const seenFixed = new Map();
  for (const { kind, label, port } of parseFixedPorts(markdown)) {
    const clash = registry.find((entry) => entry.port === port);
    if (clash) {
      errors.push(
        `docs/ports.md: ${kind} port ${port} (${label}) collides with ${clash.label}`
      );
    }
    if (retired.some((range) => inRange(port, range))) {
      errors.push(
        `docs/ports.md: ${kind} port ${port} (${label}) is in a retired range`
      );
    }
    const earlier = seenFixed.get(port);
    if (earlier !== undefined && earlier !== label) {
      errors.push(
        `docs/ports.md: port ${port} is listed for both ${earlier} and ${label}`
      );
    }
    seenFixed.set(port, label);
    // Vendored software cannot move, so a vendored port inside a Barrels range
    // must be acknowledged. Barrels' own fixed ports are not held to this.
    const insideRange = ranges.some((range) => inRange(port, range));
    if (kind === "vendored" && insideRange && !exceptions.has(port)) {
      errors.push(
        `docs/ports.md: vendored port ${port} (${label}) is inside a Barrels range and not in "Vendored exceptions inside Barrels ranges"`
      );
    }
  }
}

function checkRanges(markdown, errors, registry) {
  const ranges = parseRanges(markdown);
  if (ranges.length === 0) return;
  checkRangeShapes(ranges, errors);
  const retired = parseRetired(markdown);
  for (const { port, label } of registry) {
    if (!ranges.some((range) => inRange(port, range))) {
      errors.push(`docs/ports.md: ${label} port ${port} is in no listed range`);
    }
    if (retired.some((range) => inRange(port, range))) {
      errors.push(`docs/ports.md: ${label} uses retired port ${port}`);
    }
  }
  checkFixedPorts(markdown, errors, { ranges, retired, registry });
}

function isRetiredNow(retiredHosts, label) {
  const row = retiredHosts.find((host) => host.label === label);
  return row !== undefined && !row.status.startsWith("Retiring");
}

function checkServedTable(errors, served) {
  const seen = new Set();
  for (const label of served.production) {
    if (seen.has(label)) {
      errors.push(
        `docs/ports.md: host ${label} is listed twice in the domain table`
      );
    }
    seen.add(label);
    if (!served.staging.includes(label)) {
      errors.push(
        `docs/ports.md: ${label} has a production host but no ${label}.staging.barrels.gd`
      );
    }
  }
  for (const host of served.badStaging) {
    errors.push(
      `docs/ports.md: staging host ${host} must be <label>.staging.barrels.gd (single level)`
    );
  }
  return seen;
}

function checkCompose(compose, errors, listed, retiredHosts) {
  const routed = composeHostLabels(compose);
  for (const label of routed) {
    if (!listed.has(label)) {
      errors.push(
        `docker-compose.deploy.yml routes Host(${label}.*) but the docs/ports.md domain table does not list it`
      );
    }
    if (isRetiredNow(retiredHosts, label)) {
      errors.push(`docker-compose.deploy.yml routes retired host ${label}.*`);
    }
  }
  for (const label of listed) {
    if (!routed.has(label)) {
      errors.push(
        `docs/ports.md lists ${label}.barrels.gd but docker-compose.deploy.yml has no Host() rule for it`
      );
    }
  }
}

function checkReservedNames(markdown, errors, listed, retiredHosts) {
  const reservedNames = parseReservedNames(markdown);
  if (reservedNames.size === 0) return;
  const planned = parsePlannedHosts(markdown);
  const everyHost = new Set([
    ...listed,
    ...planned,
    ...retiredHosts.map((host) => host.label),
  ]);
  for (const label of everyHost) {
    if (!reservedNames.has(label)) {
      errors.push(`docs/ports.md: host ${label} is not in "Reserved names"`);
    }
  }
  for (const label of [...listed, ...planned]) {
    if (isRetiredNow(retiredHosts, label)) {
      errors.push(
        `docs/ports.md: retired host ${label} is also listed as live or planned`
      );
    }
  }
}

function checkHosts(root, markdown, errors) {
  const served = parseServedHosts(markdown);
  if (served === null) return;
  const listed = checkServedTable(errors, served);
  const retiredHosts = parseRetiredHosts(markdown);
  const compose = maybeRead(root, "infra/docker/docker-compose.deploy.yml");
  if (compose !== null) {
    checkCompose(compose, errors, listed, retiredHosts);
  }
  checkReservedNames(markdown, errors, listed, retiredHosts);
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

  const registry = [
    ...[...apps].map(([dir, { port }]) => ({ label: `app ${dir}`, port })),
    ...[...reserved].map(([port, pkg]) => ({ label: `reserved ${pkg}`, port })),
  ];
  checkRanges(markdown, errors, registry);
  checkHosts(root, markdown, errors);

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
