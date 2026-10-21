import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  checkPorts,
  composeHostLabels,
  parseFixedPorts,
  parseRanges,
  parseReserved,
  parseReservedNames,
  parseReservedRows,
  parseRetired,
  parseRetiredHosts,
  parseServedHosts,
  parseWebApps,
} from "./check-ports.mjs";

const PORTS_MD = `# Port allocation

## Web apps (\`30xx\`)

| App | Package | Port |
| --- | --- | --- |
| alpha | \`@barrelsgd/web-alpha\` | 3000 |
| beta | \`@barrelsgd/web-beta\` | 3001 |

### Reserved and planned

| Port | App | Status |
| --- | --- | --- |
| 3008 | \`@barrelsgd/web-shop\` (shop) | Reserved |

## APIs
`;

const DOMAIN_VAR = ["$", "{BASE_DOMAIN}"].join("");
const has = (errors, text) => errors.some((e) => e.includes(text));

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function appFiles(root, dir, port) {
  write(
    root,
    `apps/web/${dir}/package.json`,
    JSON.stringify({
      scripts: {
        dev: `next dev --port ${port}`,
        start: `next start --port ${port}`,
      },
    })
  );
  write(
    root,
    `apps/web/${dir}/Dockerfile`,
    `EXPOSE ${port}\nENV PORT=${port}\n`
  );
  write(
    root,
    `apps/web/${dir}/AGENTS.md`,
    `# ${dir}\n\nPort **${port}**. App.\n`
  );
}

function composeFor(apps) {
  const services = apps
    .map(
      ({ app, port }) => `  web-${app}:
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:${port}/api/health')"]
    labels:
      - "traefik.http.services.web-${app}\${ROUTER_SUFFIX}.loadbalancer.server.port=${port}"
`
    )
    .join("");
  return `services:\n${services}`;
}

function scopeFor(apps) {
  const entries = apps.map(
    ({ app, port }) =>
      `{ app: "${app}", image: "web-${app}", path: "apps/web/${app}", port: ${port} }`
  );
  return `export const webImages = [${entries.join(",")}];\n`;
}

/** A consistent two-app repo; each test breaks exactly one thing. */
function fixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "check-ports-"));
  const apps = [
    { app: "alpha", port: 3000 },
    { app: "beta", port: 3001 },
  ];
  write(root, "docs/ports.md", PORTS_MD);
  for (const { app, port } of apps) appFiles(root, app, port);
  write(root, "infra/docker/docker-compose.deploy.yml", composeFor(apps));
  write(root, "scripts/ci/release-scope.mjs", scopeFor(apps));
  mutate?.(root);
  return root;
}

async function problems(mutate) {
  const root = fixture(mutate);
  try {
    return await checkPorts(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("parses the web-app and reserved tables", () => {
  assert.deepEqual(
    [...parseWebApps(PORTS_MD)],
    [
      ["alpha", { pkg: "@barrelsgd/web-alpha", port: 3000 }],
      ["beta", { pkg: "@barrelsgd/web-beta", port: 3001 }],
    ]
  );
  assert.deepEqual(
    [...parseReserved(PORTS_MD)],
    [[3008, "@barrelsgd/web-shop"]]
  );
});

test("a consistent repo passes", async () => {
  assert.deepEqual(await problems(), []);
});

test("flags a package.json port that disagrees", async () => {
  const errors = await problems((root) =>
    write(
      root,
      "apps/web/beta/package.json",
      JSON.stringify({
        scripts: {
          dev: "next dev --port 3099",
          start: "next start --port 3001",
        },
      })
    )
  );
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("apps/web/beta/package.json scripts.dev: 3099"));
});

test("flags a Dockerfile, AGENTS.md or compose port that disagrees", async () => {
  const errors = await problems((root) => {
    write(root, "apps/web/alpha/Dockerfile", "EXPOSE 3000\nENV PORT=4000\n");
    write(root, "apps/web/alpha/AGENTS.md", "Port **3500**. App.\n");
    write(
      root,
      "infra/docker/docker-compose.deploy.yml",
      composeFor([
        { app: "alpha", port: 3000 },
        { app: "beta", port: 3999 },
      ])
    );
  });
  assert.ok(has(errors, "Dockerfile ENV PORT: 4000"));
  assert.ok(has(errors, 'AGENTS.md "Port" header: 3500'));
  assert.ok(has(errors, "web-beta Traefik port: 3999"));
  assert.ok(has(errors, "web-beta healthcheck: 3999"));
});

test("flags a release-scope port that disagrees", async () => {
  const errors = await problems((root) =>
    write(
      root,
      "scripts/ci/release-scope.mjs",
      scopeFor([
        { app: "alpha", port: 3000 },
        { app: "beta", port: 3002 },
      ])
    )
  );
  assert.ok(has(errors, "release-scope.mjs beta: 3002"));
});

test("flags duplicate and reserved ports", async () => {
  const errors = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      PORTS_MD.replace("| 3001 |", "| 3008 |").replace(
        "| alpha | `@barrelsgd/web-alpha` | 3000 |",
        "| alpha | `@barrelsgd/web-alpha` | 3008 |"
      )
    )
  );
  assert.ok(has(errors, "port 3008 is used by both alpha and beta"));
  assert.ok(has(errors, "port 3008 is reserved for @barrelsgd/web-shop"));
});

test("flags an app that serves on a port but is undocumented", async () => {
  const errors = await problems((root) => appFiles(root, "gamma", 3002));
  assert.ok(has(errors, "gamma is not in docs/ports.md"));
});

const RANGES_MD = `${PORTS_MD}
## Port ranges

| Range | Category | Notes |
| --- | --- | --- |
| \`3000–3019\` | Legacy | frozen |
| \`3020–3029\` | Platform | x |
| \`4000–4099\` | Retired | never reuse |
| \`8000–8019\` | Python | x |

### Retired ports

| Port | What it was | Status |
| --- | --- | --- |
| \`3011\` | Never used | Never assign |
| \`4000–4099\` | Hono | Retired |

## Infrastructure & dev tools

| Service | Port |
|---|---|
| Postgres | 5432 |

## Vendored ops apps

| Service | Port(s) | Source |
|---|---|---|
| wis2box metrics | 8001 | x |
| grafana | 3100 | x |

### Vendored exceptions inside Barrels ranges

| Port | Service | Inside range |
| --- | --- | --- |
| 8001 | wis2box metrics | \`8000–8019\` |
`;

const HOSTS_MD = `${PORTS_MD}
### Served by the DigitalOcean stack (Traefik)

| Service | Local dev | Container port | Staging | Production | Health check |
| --- | --- | --- | --- | --- | --- |
| alpha | x | 3000 | \`alpha.staging.barrels.gd\` | \`alpha.barrels.gd\` | / |
| beta | x | 3001 | \`beta.staging.barrels.gd\` | \`beta.barrels.gd\` | / |

### Retired hostnames

| Hostname | Replaced by | Status |
| --- | --- | --- |
| \`old.*\`, \`older.*\` | beta | Retired |
| \`later.*\` | beta | Retiring: after the cutover |

## Reserved names

- **Hosts:** alpha, beta, old, older, later.
- **Misc:** www, api.
`;

const withCompose = (labels) => (root) =>
  write(
    root,
    "infra/docker/docker-compose.deploy.yml",
    composeFor([
      { app: "alpha", port: 3000 },
      { app: "beta", port: 3001 },
    ]) +
      labels
        .map((l) => `      - "x.rule=Host(\`${l}.\${BASE_DOMAIN}\`)"\n`)
        .join("")
  );

test("parses ranges, retired rows, fixed ports and exceptions", () => {
  assert.deepEqual(
    parseRanges(RANGES_MD).map((r) => [r.lo, r.hi]),
    [
      [3000, 3019],
      [3020, 3029],
      [4000, 4099],
      [8000, 8019],
    ]
  );
  assert.deepEqual(parseRetired(RANGES_MD), [
    { lo: 3011, hi: 3011 },
    { lo: 4000, hi: 4099 },
  ]);
  assert.deepEqual(
    parseFixedPorts(RANGES_MD).map((f) => f.port),
    [5432, 8001, 3100]
  );
});

test("parses hosts, retired hosts and reserved names", () => {
  assert.deepEqual(parseServedHosts(HOSTS_MD), {
    production: ["alpha", "beta"],
    staging: ["alpha", "beta"],
    badStaging: [],
  });
  assert.deepEqual(
    parseRetiredHosts(HOSTS_MD).map((h) => h.label),
    ["old", "older", "later"]
  );
  assert.ok(parseReservedNames(HOSTS_MD).has("later"));
  assert.deepEqual(
    [...composeHostLabels(`Host(\`a.${DOMAIN_VAR}\`) Host(\`b.example.com\`)`)],
    ["a"]
  );
});

test("ranges: consistent doc passes, overlaps and bad ports fail", async () => {
  const pass = (md) => (root) => write(root, "docs/ports.md", md);
  assert.deepEqual(await problems(pass(RANGES_MD)), []);

  const overlap = await problems(
    pass(RANGES_MD.replace("3020–3029", "3015–3029"))
  );
  assert.ok(has(overlap, "overlaps"));

  const retiredUse = await problems(
    pass(
      RANGES_MD.replace(
        "| beta | `@barrelsgd/web-beta` | 3001 |",
        "| beta | `@barrelsgd/web-beta` | 3011 |"
      )
    )
  );
  assert.ok(has(retiredUse, "uses retired port 3011"));

  const outside = await problems(
    pass(RANGES_MD.replace("| 3008 |", "| 3500 |"))
  );
  assert.ok(has(outside, "port 3500 is in no listed range"));
});

test("ranges: a vendored port inside a Barrels range needs an exception", async () => {
  const errors = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      RANGES_MD.replace("| 8001 | wis2box metrics | `8000–8019` |\n", "")
    )
  );
  assert.ok(has(errors, "vendored port 8001"));
});

test("ranges: a fixed port colliding with an app is flagged", async () => {
  const errors = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      RANGES_MD.replace("| Postgres | 5432 |", "| Postgres | 3001 |")
    )
  );
  assert.ok(has(errors, "infrastructure port 3001 (Postgres) collides"));
});

test("hosts: compose and the domain table agree", async () => {
  const set = (md, labels) => (root) => {
    write(root, "docs/ports.md", md);
    withCompose(labels)(root);
  };
  assert.deepEqual(await problems(set(HOSTS_MD, ["alpha", "beta"])), []);

  const missingInDocs = await problems(
    set(HOSTS_MD, ["alpha", "beta", "zeta"])
  );
  assert.ok(has(missingInDocs, "routes Host(zeta.*)"));

  const missingInCompose = await problems(set(HOSTS_MD, ["alpha"]));
  assert.ok(has(missingInCompose, "lists beta.barrels.gd"));

  const retiredRouted = await problems(set(HOSTS_MD, ["alpha", "beta", "old"]));
  assert.ok(has(retiredRouted, "routes retired host old"));

  const retiringOk = await problems(set(HOSTS_MD, ["alpha", "beta", "later"]));
  assert.ok(!has(retiringOk, "retired host later"));
});

test("hosts: staging infix, single-level and reserved names are enforced", async () => {
  const set = (md) => (root) => {
    write(root, "docs/ports.md", md);
    withCompose(["alpha", "beta"])(root);
  };
  const threeLevel = await problems(
    set(
      HOSTS_MD.replace(
        "`beta.staging.barrels.gd`",
        "`beta.x.staging.barrels.gd`"
      )
    )
  );
  assert.ok(has(threeLevel, "must be <label>.staging.barrels.gd"));
  assert.ok(has(threeLevel, "beta has a production host but no beta.staging"));

  const unreserved = await problems(
    set(HOSTS_MD.replace("- **Hosts:** alpha, beta,", "- **Hosts:** alpha,"))
  );
  assert.ok(has(unreserved, 'host beta is not in "Reserved names"'));
});

test("reserved rows: duplicate ports and packages are flagged", async () => {
  const dupPort = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      PORTS_MD.replace(
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |",
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |\n| 3008 | `@barrelsgd/web-other` | Reserved |"
      )
    )
  );
  assert.ok(has(dupPort, "port 3008 is reserved twice"));

  const dupPkg = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      PORTS_MD.replace(
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |",
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |\n| 3009 | `@barrelsgd/web-shop` (again) | Reserved |"
      )
    )
  );
  assert.ok(has(dupPkg, "package @barrelsgd/web-shop is reserved on both"));

  const appClash = await problems((root) =>
    write(
      root,
      "docs/ports.md",
      PORTS_MD.replace(
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |",
        "| 3008 | `@barrelsgd/web-shop` (shop) | Reserved |\n| 3009 | `@barrelsgd/web-alpha` | Reserved |"
      )
    )
  );
  assert.ok(has(appClash, "package @barrelsgd/web-alpha (alpha) is on 3000"));
});

test("required sections: real-repo mode fails when a section is missing", async () => {
  const root = fixture();
  try {
    assert.deepEqual(await checkPorts(root), []);
    const errors = await checkPorts(root, { requireSections: true });
    for (const heading of [
      "## Port ranges",
      "### Retired ports",
      "### Served by the DigitalOcean stack",
      "### Retired hostnames",
      "## Reserved names",
    ]) {
      assert.ok(has(errors, `section "${heading}" is missing`), heading);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("compose hosts: three-level hosts are flagged and comments ignored", async () => {
  const hostLine = (l) => `Host(\`${l}.${DOMAIN_VAR}\`)`;
  assert.deepEqual(
    [
      ...composeHostLabels(
        `# - "x.rule=${hostLine("ghost")}"\n - "y=${hostLine("real")}"`
      ),
    ],
    ["real"]
  );
  const errors = await problems((root) => {
    write(root, "docs/ports.md", HOSTS_MD);
    withCompose(["alpha", "beta", "docs.weather"])(root);
  });
  assert.ok(has(errors, "multi-level host docs.weather"));
});

test("the real repo's ports agree and every section parses", async () => {
  const markdown = readFileSync(
    new URL("../../docs/ports.md", import.meta.url),
    "utf8"
  );
  assert.ok(parseRanges(markdown).length > 0);
  assert.ok(parseRetired(markdown).length > 0);
  assert.ok(parseServedHosts(markdown).production.length > 0);
  assert.ok(parseRetiredHosts(markdown).length > 0);
  assert.ok(parseReservedNames(markdown).size > 0);
  assert.ok(parseReservedRows(markdown).length > 0);
  assert.deepEqual(await checkPorts(), []);
});
