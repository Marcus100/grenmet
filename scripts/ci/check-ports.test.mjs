import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkPorts, parseReserved, parseWebApps } from "./check-ports.mjs";

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

test("the real repo's ports agree", async () => {
  assert.deepEqual(await checkPorts(), []);
});
