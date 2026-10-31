// Static checks of the Traefik edge in the deploy compose file (no Docker needed).
// Both environments are evaluated from their committed env files, the way
// `docker compose --env-file <env>.env` interpolates them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const compose = read("infra/docker/docker-compose.deploy.yml");
const TOP_LEVEL_KEY = /^\S/;
const SERVICE_HEADER = /^ {2}([a-z0-9-]+):\s*$/;
const LIST_ITEM = /^ {6}- (.+?)\s*$/;
const SECTION = /^ {4}([a-z_]+):(.*)$/;
const VARIABLE = /\$\{([A-Z0-9_]+)(?:(:-|:\+|:\?)([^${}]*))?\}/g;
const SOCKET = "/var/run/docker.sock";
const STAGING_ONLY = ["staging-auth", "staging-noindex"];
const DASHBOARD_USER = /\$\{USERNAME\}/;
const PROFILE = /^ {4}profiles: \["([a-z]+)"\]/m;
const ROUTER_LABEL = /^traefik\.http\.routers\.([^.]+)\.(.+)$/;
const PROVIDER_SUFFIX = /@docker$/;
const SOCKET_PROXY_IMAGE =
  /^ {4}image: tecnativa\/docker-socket-proxy:v[0-9.]+@sha256:[0-9a-f]{64}$/m;
const CONTAINERS_ALLOWED = /^ {6}CONTAINERS: 1$/m;
const POST_DENIED = /^ {6}POST: 0$/m;
const INTERNAL_NETWORK =
  /^ {2}docker-api:\n {4}driver: bridge\n {4}internal: true$/m;
const READ_ONLY = /^ {4}read_only: true$/m;
const DURATION = /[=][1-9][0-9]*s$/;
const HR_LIMIT = /^MAX_DOCUMENT_BYTES = (.+)$/m;
const UPLOAD_ROUTER = /^(grenmet-api|web-cms|adminer)/;
const STAGING_PROFILE = /^ {4}profiles: \["staging"\]$/m;
const SWITCHED_FORWARDED_HEADERS =
  /\$\{TRAEFIK_FORWARDED_HEADERS:-insecure=false\}$/;

// Top-level `services:` blocks as raw text plus their list-valued sections.
function services(text) {
  const lines = text.split("\n");
  const start = lines.indexOf("services:");
  const result = new Map();
  let current = null;
  let section = null;
  for (const line of lines.slice(start + 1)) {
    if (TOP_LEVEL_KEY.test(line)) break;
    const header = line.match(SERVICE_HEADER);
    if (header) {
      current = { name: header[1], body: [], lists: {} };
      result.set(current.name, current);
      section = null;
      continue;
    }
    if (!current) continue;
    current.body.push(line);
    const key = line.match(SECTION);
    if (key) {
      section = key[1];
      current.lists[section] ??= [];
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item && section) current.lists[section].push(unquote(item[1]));
  }
  for (const service of result.values()) service.body = service.body.join("\n");
  return result;
}

function unquote(value) {
  return value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

function envFile(name) {
  const values = {};
  for (const line of read(`infra/docker/${name}.env`).split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    values[line.slice(0, index)] = unquote(line.slice(index + 1));
  }
  return values;
}

// Innermost `${...}` first, so `${A:+x${B}}` nests as Compose does.
function interpolate(value, variables) {
  let current = value;
  let previous;
  while (current !== previous) {
    previous = current;
    current = current.replace(VARIABLE, (_match, name, operator, word = "") => {
      const set = Boolean(variables[name]);
      if (operator === ":+") return set ? word : "";
      if (operator === ":-") return set ? variables[name] : word;
      return variables[name] ?? "";
    });
  }
  return current;
}

// A router's flattened middleware list; none when it has no middlewares label.
function routerMiddlewares(router, labels) {
  return router.middlewares
    ? resolve(router.middlewares.split(","), labels)
    : [];
}

function labelsOf(service, variables) {
  const labels = {};
  for (const label of service.lists.labels ?? []) {
    const resolved = interpolate(label, variables);
    const index = resolved.indexOf("=");
    labels[resolved.slice(0, index)] = resolved.slice(index + 1);
  }
  return labels;
}

const parsed = services(compose);
const proxy = parsed.get("proxy");
const socketProxy = parsed.get("traefik-socket-proxy");
const flags = proxy.lists.command;
const htpasswd = (user) => `${user}:$2y$05$${"a".repeat(53)}`;

// Variables as the deploy renders them: staging carries its basic-auth lists,
// production gets them empty (render-env.py and deploy.yml).
const ENVIRONMENTS = {
  staging: {
    ...envFile("staging"),
    STAGING_BASIC_AUTH_USERS: htpasswd("reviewer"),
    ADMINER_BASIC_AUTH_USERS: htpasswd("dba"),
  },
  production: {
    ...envFile("production"),
    STAGING_BASIC_AUTH_USERS: "",
    ADMINER_BASIC_AUTH_USERS: "",
  },
};

// Every router and middleware across all services, plus active profiles.
function edge(environment) {
  const variables = ENVIRONMENTS[environment];
  const profiles = (variables.COMPOSE_PROFILES ?? "").split(",");
  const labels = {};
  for (const service of parsed.values()) {
    const profile = service.body.match(PROFILE);
    if (profile && !profiles.includes(profile[1])) continue;
    Object.assign(labels, labelsOf(service, variables));
  }
  const routers = new Map();
  for (const [key, value] of Object.entries(labels)) {
    const match = key.match(ROUTER_LABEL);
    if (!match) continue;
    if (!routers.has(match[1])) routers.set(match[1], {});
    routers.get(match[1])[match[2]] = value;
  }
  const entrypointMiddlewares = interpolate(
    flags
      .find((flag) =>
        flag.startsWith("--entrypoints.websecure.http.middlewares=")
      )
      .split("=")[1],
    variables
  ).split(",");
  return { labels, routers, entrypointMiddlewares, variables };
}

// Expands chains (labels) into the flat list of middleware names.
function resolve(names, labels) {
  const result = [];
  for (const raw of names) {
    const name = raw.replace(PROVIDER_SUFFIX, "");
    const chain = labels[`traefik.http.middlewares.${name}.chain.middlewares`];
    if (chain) result.push(...resolve(chain.split(","), labels));
    else result.push(name);
  }
  return result;
}

function middlewareKind(name, labels) {
  const prefix = `traefik.http.middlewares.${name}.`;
  const key = Object.keys(labels).find((label) => label.startsWith(prefix));
  return key?.slice(prefix.length).split(".")[0];
}

function websecureRouters(environment) {
  const { routers } = edge(environment);
  return [...routers].filter(([, router]) =>
    (router.entrypoints ?? "").split(",").includes("websecure")
  );
}

test("only the socket proxy mounts the Docker socket, read-only and allow-listed", () => {
  assert.ok(socketProxy, "traefik-socket-proxy service exists");
  assert.match(socketProxy.body, SOCKET_PROXY_IMAGE);
  assert.deepEqual(socketProxy.lists.volumes, [`${SOCKET}:${SOCKET}:ro`]);
  assert.match(socketProxy.body, CONTAINERS_ALLOWED);
  assert.match(socketProxy.body, POST_DENIED);
  for (const denied of [
    "EXEC",
    "IMAGES",
    "NETWORKS",
    "VOLUMES",
    "INFO",
    "BUILD",
  ])
    assert.doesNotMatch(
      socketProxy.body,
      new RegExp(`^ {6}${denied}: 1$`, "m")
    );
  assert.deepEqual(socketProxy.lists.networks, ["docker-api"]);
  for (const service of parsed.values()) {
    if (service.name === "traefik-socket-proxy") continue;
    assert.equal(
      service.body.includes(SOCKET),
      false,
      `${service.name} mounts the socket`
    );
  }
});

test("the Docker API network is internal and shared only by Traefik and the socket proxy", () => {
  assert.match(compose, INTERNAL_NETWORK);
  const members = [...parsed.values()]
    .filter((service) => (service.lists.networks ?? []).includes("docker-api"))
    .map((service) => service.name)
    .sort();
  assert.deepEqual(members, ["proxy", "traefik-socket-proxy"]);
  assert.ok(
    proxy.lists.networks.includes("grenmet"),
    "proxy keeps its routing network"
  );
});

test("Traefik reads Docker through the proxy and runs with least privilege", () => {
  assert.ok(
    flags.includes(
      "--providers.docker.endpoint=tcp://traefik-socket-proxy:2375"
    )
  );
  assert.ok(flags.includes("--providers.docker.exposedbydefault=false"));
  assert.deepEqual(proxy.lists.volumes, ["traefik-certificates:/certificates"]);
  assert.deepEqual(proxy.lists.security_opt, ["no-new-privileges:true"]);
  assert.deepEqual(proxy.lists.cap_drop, ["ALL"]);
  assert.deepEqual(proxy.lists.cap_add, ["NET_BIND_SERVICE"]);
  assert.match(proxy.body, READ_ONLY);
  assert.ok(proxy.lists.tmpfs.some((entry) => entry.startsWith("/tmp")));
});

test("the dashboard is reachable only on the loopback-bound internal entrypoint", () => {
  assert.ok(flags.includes("--entrypoints.traefik.address=:8080"));
  assert.ok(flags.includes("--api.dashboard=true"));
  assert.equal(
    flags.some((flag) => flag.startsWith("--api.insecure")),
    false
  );
  const published = proxy.lists.ports.filter((port) => port.endsWith(":8080"));
  assert.deepEqual(published, ["127.0.0.1:8080:8080"]);
  for (const environment of Object.keys(ENVIRONMENTS)) {
    const internal = [...edge(environment).routers.values()].filter(
      (router) => router.service === "api@internal"
    );
    assert.equal(internal.length, 1, environment);
    for (const router of internal) {
      assert.equal(router.entrypoints, "traefik", environment);
      assert.equal(router.rule.includes("Host("), false, "no public host");
    }
  }
});

test("websecure has explicit responding timeouts", () => {
  for (const name of ["readtimeout", "writetimeout", "idletimeout"]) {
    const flag = flags.find((value) =>
      value.startsWith(
        `--entrypoints.websecure.transport.respondingtimeouts.${name}=`
      )
    );
    assert.ok(flag, name);
    assert.match(flag, DURATION);
  }
});

test("access logs are JSON on stdout without headers or query strings", () => {
  assert.ok(flags.includes("--accesslog.format=json"));
  assert.ok(flags.includes("--accesslog.fields.headers.defaultmode=drop"));
  assert.ok(
    flags.includes("--accesslog.fields.queryparameters.defaultmode=drop")
  );
  assert.equal(
    flags.some((flag) => flag.startsWith("--accesslog.filepath")),
    false
  );
});

test("secure headers add a permissions policy and COOP and keep HSTS at 30 days", () => {
  for (const environment of Object.keys(ENVIRONMENTS)) {
    const { labels, entrypointMiddlewares } = edge(environment);
    const headers = entrypointMiddlewares
      .map((name) => name.replace(PROVIDER_SUFFIX, ""))
      .find((name) => name.startsWith("secure-headers"));
    const prefix = `traefik.http.middlewares.${headers}.headers.`;
    assert.equal(
      labels[`${prefix}permissionsPolicy`],
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    assert.equal(
      labels[`${prefix}customResponseHeaders.Cross-Origin-Opener-Policy`],
      "same-origin-allow-popups"
    );
    assert.equal(labels[`${prefix}stsSeconds`], "2592000");
  }
});

test("upload routers limit request bodies, web routers stay unbuffered, every request is capped per IP", () => {
  const hrLimit = Number(
    read("apps/api/fastapi/src/hr/documents/service.py")
      .match(HR_LIMIT)[1]
      .split("*")
      .reduce((product, factor) => product * Number(factor.trim()), 1)
  );
  for (const environment of Object.keys(ENVIRONMENTS)) {
    const { labels, entrypointMiddlewares } = edge(environment);
    const inflight = entrypointMiddlewares
      .map((name) => name.replace(PROVIDER_SUFFIX, ""))
      .find((name) => middlewareKind(name, labels) === "inflightreq");
    assert.ok(inflight, `${environment} websecure entrypoint has inflightreq`);
    const prefix = `traefik.http.middlewares.${inflight}.inflightreq.`;
    assert.ok(Number(labels[`${prefix}amount`]) > 0);
    // Without an IP strategy Traefik groups by Host, not by client.
    assert.equal(labels[`${prefix}sourceCriterion.ipStrategy.depth`], "0");

    const routers = websecureRouters(environment);
    assert.ok(routers.length >= 12, `${environment} has its routers`);
    for (const [name, router] of routers) {
      const buffering = routerMiddlewares(router, labels).filter(
        (middleware) => middlewareKind(middleware, labels) === "buffering"
      );
      if (!UPLOAD_ROUTER.test(name)) {
        // Buffering also buffers responses and would break Next.js streaming.
        assert.deepEqual(buffering, [], `${name} must not buffer`);
        continue;
      }
      assert.equal(buffering.length, 1, `${name} has one body limit`);
      const limit = Number(
        labels[
          `traefik.http.middlewares.${buffering[0]}.buffering.maxRequestBodyBytes`
        ]
      );
      assert.ok(limit > hrLimit, `${name} fits a ${hrLimit}-byte upload`);
    }
    const upload = routers.filter(([name]) => UPLOAD_ROUTER.test(name));
    assert.equal(
      upload.length,
      environment === "staging" ? 3 : 2,
      `${environment} api, cms (and staging adminer) routers`
    );
  }
});

test("production web routers carry no middlewares and no empty chain", () => {
  const { labels } = edge("production");
  for (const [name, router] of websecureRouters("production")) {
    if (UPLOAD_ROUTER.test(name)) continue;
    assert.equal(router.middlewares, undefined, `${name} middlewares label`);
  }
  for (const [key, value] of Object.entries(labels)) {
    if (key.endsWith(".chain.middlewares"))
      assert.ok(value.split(",").every(Boolean), `${key} is not empty`);
    assert.notEqual(key, "", "no empty label key");
  }
});

test("staging protection never reaches production routers", () => {
  for (const [name, router] of websecureRouters("production")) {
    const { labels } = edge("production");
    const chain = routerMiddlewares(router, labels);
    for (const middleware of STAGING_ONLY)
      assert.equal(
        chain.some((entry) => entry.startsWith(middleware)),
        false,
        `${name} uses ${middleware}`
      );
  }
  assert.equal(edge("production").routers.has("adminer"), false);
});

test("staging web hosts get basic auth and noindex; the staging API only noindex", () => {
  const { labels, variables } = edge("staging");
  for (const [name, router] of websecureRouters("staging")) {
    const chain = routerMiddlewares(router, labels);
    const auth = chain.filter(
      (entry) => middlewareKind(entry, labels) === "basicauth"
    );
    const noindex = chain.find((entry) => entry.startsWith("staging-noindex"));
    assert.ok(noindex, `${name} sends X-Robots-Tag`);
    assert.equal(
      labels[
        `traefik.http.middlewares.${noindex}.headers.customResponseHeaders.X-Robots-Tag`
      ],
      "noindex, nofollow"
    );
    if (name.startsWith("grenmet-api")) {
      assert.deepEqual(auth, [], "API stays callable cross-origin");
      continue;
    }
    if (name.startsWith("adminer")) {
      assert.deepEqual(auth, ["adminer-auth-staging"], "own credentials");
      continue;
    }
    assert.deepEqual(auth, ["staging-auth-staging"], `${name} is gated`);
  }
  assert.equal(
    labels["traefik.http.middlewares.staging-auth-staging.basicauth.users"],
    variables.STAGING_BASIC_AUTH_USERS
  );
});

test("Adminer stays staging-only behind its own credentials", () => {
  const adminer = parsed.get("adminer");
  assert.match(adminer.body, STAGING_PROFILE);
  const labels = labelsOf(adminer, ENVIRONMENTS.staging);
  const users = Object.entries(labels).find(([key]) =>
    key.endsWith(".basicauth.users")
  );
  assert.equal(users[1], ENVIRONMENTS.staging.ADMINER_BASIC_AUTH_USERS);
  assert.equal(adminer.body.includes("HASHED_PASSWORD"), false);
  assert.doesNotMatch(adminer.body, DASHBOARD_USER);
  assert.ok(
    labels["traefik.http.routers.adminer-staging.middlewares"].includes(
      "adminer-auth-staging"
    )
  );
});

test("forwarded headers, the client-IP depth and the challenge come only from the Cloudflare switch", () => {
  // Off (the env files alone, as before render-env.py) is Traefik's default.
  const off = {};
  assert.deepEqual(
    flags
      .filter((flag) => flag.includes("forwardedHeaders"))
      .map((flag) => interpolate(flag, off)),
    ["--entrypoints.websecure.forwardedHeaders.insecure=false"]
  );
  assert.deepEqual(
    flags
      .filter((flag) => flag.includes("challenge"))
      .map((flag) => interpolate(flag, off)),
    ["--certificatesresolvers.letsencrypt.acme.tlschallenge=true"]
  );
  // Nothing hard-codes trust: the ranges arrive only through render-env.py.
  const items = [...parsed.values()].flatMap((service) =>
    Object.values(service.lists).flat()
  );
  assert.equal(
    items.some((item) => item.includes("trustedIPs=")),
    false
  );
  assert.equal(
    items.some((item) => item.includes("insecure=true")),
    false
  );
  for (const flag of flags.filter((item) => item.includes("forwardedHeaders")))
    assert.match(flag, SWITCHED_FORWARDED_HEADERS);
});
