// Cloudflare proxy tooling (docs/operations/cloudflare-proxy.md): the vendored
// range list, the origin firewall plan and the cache rules. No network, no
// Cloudflare or DigitalOcean account: the scripts run offline here.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const RANGES = "infra/cloudflare/ip-ranges.txt";
const FIREWALL = "scripts/production/cloudflare-origin-firewall.py";
const CACHE = "scripts/production/cloudflare-cache-rules.py";
const CIDR_LINE = /^[0-9a-f:.]+\/\d+$/;
const OVERSIZED = /^refused .*more than 16384 bytes/;
const FETCHED_LINE = /^# Fetched: \d{4}-\d{2}-\d{2}$/m;
const UNTOUCHED_PORT = /ports:(22|5432)\b/;
const ROUTER_HOST = /Host\(`([a-z0-9-]+)\.\$\{BASE_DOMAIN\}`\)/g;
const COOKIE_DEFAULT = /_SESSION_COOKIE_NAME:[\s\S]*?\.default\(\s*"([^"]+)"/g;

function python(args, options = {}) {
  return spawnSync("python3", args, { encoding: "utf8", ...options });
}

// parse() from cloudflare_ranges.py on arbitrary text: [ok, value-or-message].
function parse(text) {
  const result = python(
    [
      "-c",
      "import json, sys; sys.path.insert(0, 'scripts/production'); import cloudflare_ranges as c\ntry: print(json.dumps([True, [str(n) for n in c.parse(sys.stdin.read())]]))\nexcept ValueError as e: print(json.dumps([False, str(e)]))",
    ],
    { input: text }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const vendored = readFileSync(RANGES, "utf8")
  .split("\n")
  .filter((line) => CIDR_LINE.test(line));

test("the vendored list parses, covers both families and names its source", () => {
  const [ok, ranges] = parse(readFileSync(RANGES, "utf8"));
  assert.ok(ok, ranges);
  assert.deepEqual(ranges, vendored);
  assert.ok(
    ranges.some((range) => !range.includes(":")),
    "IPv4"
  );
  assert.ok(
    ranges.some((range) => range.includes(":")),
    "IPv6"
  );
  const text = readFileSync(RANGES, "utf8");
  assert.ok(text.includes("https://www.cloudflare.com/ips-v4"));
  assert.ok(text.includes("https://www.cloudflare.com/ips-v6"));
  assert.match(text, FETCHED_LINE);
});

test("range parsing refuses entries that would trust too much", () => {
  const v6 = "2606:4700::/32";
  for (const [bad, reason] of [
    [`0.0.0.0/0\n${v6}`, "broader"],
    [`104.0.0.0/8\n${v6}`, "broader"],
    [`104.16.0.0/12\n${v6}`, "broader than /13"],
    ["104.16.0.0/13\n2a06:98c0::/28", "broader than /29"],
    [`10.1.0.0/16\n${v6}`, "public"],
    [`192.168.1.0/24\n${v6}`, "public"],
    [`104.16.0.1/13\n${v6}`, "CIDR"],
    [`not-a-range\n${v6}`, "CIDR"],
    ["104.16.0.0/13", "IPv6"],
    [v6, "IPv4"],
  ]) {
    const [ok, message] = parse(bad);
    assert.equal(ok, false, bad);
    assert.ok(message.includes(reason), `${bad}: ${message}`);
  }
  const [ok, ranges] = parse(
    `# comment\n\n104.16.0.0/13\n${v6}\n104.16.0.0/13\n`
  );
  assert.ok(ok);
  assert.deepEqual(ranges, ["104.16.0.0/13", v6]);
});

test("fetching refuses an oversized answer instead of parsing it", () => {
  const result = python([
    "-c",
    [
      "import sys; sys.path.insert(0, 'scripts/production'); import cloudflare_ranges as c",
      "class Answer:",
      "    def __init__(self, body): self.body = body",
      "    def __enter__(self): return self",
      "    def __exit__(self, *args): return False",
      "    def read(self, size=-1): return self.body[:size] if size >= 0 else self.body",
      "def opener(body): return lambda request, timeout: Answer(body)",
      "ok = c.fetch(opener(b'104.16.0.0/13\\n2606:4700::/32\\n'))",
      "print(len(ok))",
      "try: c.fetch(opener(b'104.16.0.0/13\\n' * 5000))",
      "except ValueError as e: print('refused', e)",
    ].join("\n"),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const [count, refused] = result.stdout.trim().split("\n");
  // Both sources answer the same body here, so duplicates collapse to two ranges.
  assert.equal(count, "2");
  assert.match(refused, OVERSIZED);
});

// ── Origin firewall ──────────────────────────────────────────────────────────

const SSH = {
  protocol: "tcp",
  ports: "22",
  sources: { addresses: ["192.0.2.10/32"] },
};
const DATABASE = {
  protocol: "tcp",
  ports: "5432",
  sources: { tags: ["weather-staging"] },
};
const ICMP = {
  protocol: "icmp",
  sources: { addresses: ["0.0.0.0/0", "::/0"] },
};
const open = (port) => ({
  protocol: "tcp",
  ports: port,
  sources: { addresses: ["0.0.0.0/0", "::/0"] },
});
const cloudflareOnly = (port) => ({
  protocol: "tcp",
  ports: port,
  sources: { addresses: vendored },
});

function firewall(inbound, extra = []) {
  const directory = mkdtempSync(join(tmpdir(), "cf-firewall-"));
  try {
    const listing = join(directory, "firewalls.json");
    writeFileSync(
      listing,
      JSON.stringify([
        {
          id: "fw-1",
          name: "core-staging",
          droplet_ids: [1],
          inbound_rules: inbound,
        },
        {
          id: "fw-2",
          name: "core-production",
          droplet_ids: [2],
          inbound_rules: [],
        },
      ])
    );
    return python([
      FIREWALL,
      "--firewall",
      "core-staging",
      "--current-json",
      listing,
      ...extra,
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const lines = (output, verb) =>
  output.split("\n").filter((line) => line.trim().startsWith(`${verb} `));

test("the firewall plan narrows 80/443 to Cloudflare and leaves every other rule alone", () => {
  const result = firewall([SSH, open("80"), open("443"), DATABASE, ICMP]);
  assert.equal(result.status, 0, result.stderr);
  const added = lines(result.stdout, "add");
  const removed = lines(result.stdout, "remove");
  assert.equal(added.length, 2);
  assert.equal(removed.length, 2);
  for (const port of ["80", "443"]) {
    const add = added.find((line) => line.includes(`ports:${port},`));
    assert.ok(add, `adds ${port}`);
    for (const range of vendored) assert.ok(add.includes(`address:${range}`));
    assert.equal(add.includes("0.0.0.0/0"), false);
    assert.ok(
      removed.some((line) =>
        line.includes(`ports:${port},address:0.0.0.0/0,address:::/0`)
      )
    );
  }
  for (const line of [...added, ...removed])
    assert.equal(
      UNTOUCHED_PORT.test(line) || line.includes("icmp"),
      false,
      line
    );
  assert.ok(
    result.stdout.includes(
      "kept as is: protocol:tcp,ports:22,address:192.0.2.10/32"
    )
  );
  assert.ok(result.stdout.includes("Dry run: nothing changed"));
  // Added before removed: the ports never close during the change.
  assert.ok(
    result.stdout.indexOf("  add ") < result.stdout.indexOf("  remove ")
  );
});

test("the firewall plan is a no-op once applied, and rollback reopens to everyone", () => {
  const applied = firewall([SSH, cloudflareOnly("80"), cloudflareOnly("443")]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.ok(applied.stdout.includes("No change"));

  const rollback = firewall(
    [SSH, cloudflareOnly("80"), cloudflareOnly("443")],
    ["--restore-open"]
  );
  assert.equal(rollback.status, 0, rollback.stderr);
  const added = lines(rollback.stdout, "add");
  assert.deepEqual(
    added.map((line) => line.trim()),
    [
      "add    protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0",
      "add    protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0",
    ]
  );
  assert.equal(lines(rollback.stdout, "remove").length, 2);
});

test("the firewall script refuses wide port ranges, unknown firewalls and offline apply", () => {
  const wide = firewall([
    SSH,
    {
      protocol: "tcp",
      ports: "1-65535",
      sources: { addresses: ["0.0.0.0/0"] },
    },
  ]);
  assert.notEqual(wide.status, 0);
  assert.ok(wide.stderr.includes("split it"));

  const all = firewall([
    { protocol: "tcp", ports: "0", sources: { addresses: ["0.0.0.0/0"] } },
  ]);
  assert.notEqual(all.status, 0);

  const offlineApply = firewall([SSH, open("80"), open("443")], ["--apply"]);
  assert.notEqual(offlineApply.status, 0);
  assert.ok(offlineApply.stderr.includes("--apply needs the live firewall"));

  const directory = mkdtempSync(join(tmpdir(), "cf-firewall-"));
  try {
    const listing = join(directory, "firewalls.json");
    writeFileSync(listing, "[]");
    const missing = python([
      FIREWALL,
      "--firewall",
      "core-staging",
      "--current-json",
      listing,
    ]);
    assert.notEqual(missing.status, 0);
    assert.ok(missing.stderr.includes("found 0"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the firewall script warns when the firewall has no SSH rule", () => {
  const result = firewall([open("80"), open("443")]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("WARNING: no inbound SSH (22) rule"));
});

// ── Cache rules ──────────────────────────────────────────────────────────────

function cacheRules(environment) {
  const result = python([CACHE, "--environment", environment, "--print"]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function classes() {
  const result = python([
    "-c",
    "import importlib.util, json, sys; s = importlib.util.spec_from_file_location('c', sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([m.PUBLIC_HOSTS, m.PRIVATE_HOSTS, m.SESSION_COOKIE_MARKERS]))",
    CACHE,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("every routed host is classified exactly once as public or private", () => {
  const [publicHosts, privateHosts] = classes();
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  const routed = new Set(
    [...compose.matchAll(ROUTER_HOST)].map((match) => match[1])
  );
  assert.ok(routed.size >= 14, `found ${routed.size} routers`);
  for (const host of routed) {
    const count = [publicHosts, privateHosts].filter((list) =>
      list.includes(host)
    ).length;
    assert.equal(count, 1, `${host} must be in exactly one host list`);
  }
  for (const host of ["api", "auth", "admin", "gms", "cms"])
    assert.ok(privateHosts.includes(host), `${host} is never cached`);
});

test("every app's session cookie default carries a marker the bypass rule matches", () => {
  const [, , markers] = classes();
  const names = [];
  for (const app of readdirSync("apps/web")) {
    for (const file of [
      `apps/web/${app}/src/lib/env.ts`,
      `apps/web/${app}/src/env.ts`,
    ]) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const match of text.matchAll(COOKIE_DEFAULT)) names.push(match[1]);
    }
  }
  assert.ok(names.length >= 10, `found ${names.length} cookie names`);
  for (const name of [...names, "payload-token"])
    assert.ok(
      markers.some((marker) => name.includes(marker)),
      `${name} would be cached`
    );
});

test("cache rules: default no-cache, then static assets on public hosts, then the bypass wins", () => {
  for (const [environment, domain] of [
    ["staging", "staging.barrels.gd"],
    ["production", "barrels.gd"],
  ]) {
    const rules = cacheRules(environment);
    assert.deepEqual(
      rules.map((rule) => rule.ref),
      [
        `grenmet-${environment}-default-no-cache`,
        `grenmet-${environment}-static-assets`,
        `grenmet-${environment}-never-cache-private`,
      ]
    );
    const [first, staticRule, bypass] = rules;
    assert.equal(first.action_parameters.cache, false);
    assert.equal(bypass.action_parameters.cache, false);
    assert.equal(staticRule.action_parameters.cache, true);
    // Only what the origin marks cacheable: no Cache-Control means no cache.
    assert.equal(
      staticRule.action_parameters.edge_ttl.mode,
      "bypass_by_default"
    );
    assert.equal(
      staticRule.action_parameters.browser_ttl.mode,
      "bypass_by_default"
    );
    assert.equal(
      staticRule.action_parameters.cache_key.cache_deception_armor,
      true
    );
    assert.ok(
      staticRule.expression.includes(
        'starts_with(http.request.uri.path, "/_next/static/")'
      )
    );
    for (const document of ["pdf", "csv", "xlsx", "json", "html"])
      assert.equal(
        staticRule.expression.includes(`"${document}"`),
        false,
        document
      );
    for (const host of ["api", "auth", "admin", "gms", "cms"]) {
      assert.equal(
        staticRule.expression.includes(`"${host}.${domain}"`),
        false
      );
      assert.ok(bypass.expression.includes(`"${host}.${domain}"`));
    }
    assert.ok(bypass.expression.includes('http.cookie contains "_session"'));
    assert.ok(
      bypass.expression.includes('http.cookie contains "payload-token"')
    );
    assert.ok(
      bypass.expression.includes('starts_with(http.request.uri.path, "/api/")')
    );
    // Rules stay inside their own environment's hostnames.
    if (environment === "production")
      for (const rule of rules)
        assert.equal(rule.expression.includes("staging."), false);
  }
  // Both environments share the barrels.gd zone: 6 of the free plan's 10 rules.
  assert.ok(
    cacheRules("staging").length + cacheRules("production").length <= 10
  );
});

test("the cache-rule script needs the token and zone from the environment and never echoes them", () => {
  const env = {
    PATH: process.env.PATH,
    CLOUDFLARE_API_TOKEN: "DO-NOT-ECHO-token",
    CLOUDFLARE_ZONE_ID: "not-a-zone",
  };
  const result = python([CACHE, "--environment", "staging"], { env });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("CLOUDFLARE_ZONE_ID"));
  assert.equal(
    `${result.stdout}${result.stderr}`.includes("DO-NOT-ECHO"),
    false
  );
  const missing = python([CACHE, "--environment", "staging"], {
    env: { PATH: process.env.PATH },
  });
  assert.notEqual(missing.status, 0);
});

// ── Origin secret header (Transform Rule) ─────────────────────────────────────

const HEADER_SCRIPT = "scripts/production/cloudflare-origin-header.py";

function moduleValues(path, names) {
  const result = python([
    "-c",
    `import importlib.util, json, sys; s = importlib.util.spec_from_file_location('m', sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([getattr(m, n) if not hasattr(getattr(m, n), 'pattern') else getattr(m, n).pattern for n in sys.argv[2:]]))`,
    path,
    ...names,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("the origin header rule sets the secret on every host of its environment, masked when printed", () => {
  for (const [environment, domain] of [
    ["staging", "staging.barrels.gd"],
    ["production", "barrels.gd"],
  ]) {
    const result = python([
      HEADER_SCRIPT,
      "--environment",
      environment,
      "--print",
    ]);
    assert.equal(result.status, 0, result.stderr);
    const [rule, ...others] = JSON.parse(result.stdout);
    assert.deepEqual(others, []);
    assert.equal(rule.ref, `grenmet-${environment}-origin-secret`);
    assert.equal(rule.action, "rewrite");
    assert.deepEqual(rule.action_parameters.headers, {
      "X-Barrels-Origin": {
        operation: "set",
        value: "<CLOUDFLARE_ORIGIN_SECRET>",
      },
    });
    for (const host of [...classes()[0], ...classes()[1]])
      assert.ok(rule.expression.includes(`"${host}.${domain}"`), host);
    if (environment === "production")
      assert.equal(rule.expression.includes("staging."), false);
  }
});

test("the origin header name and secret format match Traefik's gate and its strip middleware", () => {
  const [scriptHeader, scriptPattern] = moduleValues(HEADER_SCRIPT, [
    "ORIGIN_HEADER",
    "ORIGIN_SECRET",
  ]);
  const [renderHeader, renderPattern] = moduleValues(
    "scripts/production/render-env.py",
    ["ORIGIN_HEADER", "ORIGIN_SECRET"]
  );
  assert.equal(scriptHeader, renderHeader);
  assert.equal(scriptPattern, renderPattern);
  const compose = readFileSync(
    "infra/docker/docker-compose.deploy.yml",
    "utf8"
  );
  assert.ok(
    compose.includes(`.headers.customrequestheaders.${renderHeader}="`)
  );
});

test("the origin header script refuses a missing or malformed secret without echoing it", () => {
  for (const secret of [
    "",
    "short-DO-NOT-ECHO",
    `${"a".repeat(40)} DO-NOT-ECHO`,
  ]) {
    const result = python([HEADER_SCRIPT, "--environment", "staging"], {
      env: {
        PATH: process.env.PATH,
        CLOUDFLARE_ORIGIN_SECRET: secret,
        CLOUDFLARE_API_TOKEN: "DO-NOT-ECHO-token",
        CLOUDFLARE_ZONE_ID: "0".repeat(32),
      },
    });
    assert.notEqual(result.status, 0, secret);
    assert.ok(result.stderr.includes("CLOUDFLARE_ORIGIN_SECRET"));
    assert.equal(
      `${result.stdout}${result.stderr}`.includes("DO-NOT-ECHO"),
      false
    );
  }
});
