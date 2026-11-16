import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createApp,
  portsWithApp,
  readOptions,
  solidPng,
  textOn,
  UsageError,
} from "./new-app.mjs";

const CAMERA_ALLOWED = /camera=\(self\)/u;
const WASM_ALLOWED_QUOTED = /'wasm-unsafe-eval'/u;
const PLACEHOLDER = /__[A-Z]+__/u;
const DOCKER_COPY =
  /^COPY apps\/pwa\/trial\/package\.json apps\/pwa\/trial\/$/mu;
const VOLUME_MODULES = /^apps\/pwa\/trial\/node_modules$/mu;
const VOLUME_NEXT = /^apps\/pwa\/trial\/\.next$/mu;
const CAMERA_OFF = /camera=\(\)/u;
const WASM_ALLOWED = /wasm-unsafe-eval/u;
const COPIES_ZXING = /copy-zxing/u;
const DEV_SCRIPT = /^pwa-kit-copy-zxing && next dev .*--port 3099$/u;
const PORT_HEADER = /^Port \*\*3099\*\*/mu;
const ROOT_SCRIPT =
  /"dev:pwa:trial": "turbo run dev --filter=@barrelsgd\/pwa-trial"/u;
const MAP_ROW = /^\| `apps\/pwa\/<app>\/AGENTS\.md` \|.*, trial \|$/mu;
const PORT_ROW = /^\| 3099 \| `@barrelsgd\/pwa-trial` /mu;
const TAKEN_OVER_ROW =
  /^\| 3061 \| `@barrelsgd\/pwa-janitor` .*Built, dev only/mu;
const ROW_IN_ORDER =
  /3061 .*\n\| 3063 \| `@barrelsgd\/pwa-janitor`.*\n\| 3064 /u;

/** The Dev Containers variable, spelled out as the config file holds it. */
const LOCAL_FOLDER = ["$", "{localWorkspaceFolder}"].join("");

const repo = fileURLToPath(new URL("../../", import.meta.url));

/** A copy of just the files the command edits, so the real repo is untouched. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "new-pwa-"));
  for (const path of [
    "package.json",
    "AGENTS.md",
    "docs/ports.md",
    ".devcontainer/devcontainer.json",
    ".devcontainer/dependency-volumes.txt",
    ...globSync("apps/web/*/Dockerfile", { cwd: repo }),
  ]) {
    cpSync(join(repo, path), join(root, path));
  }
  return root;
}

const plan = (root, extra = []) =>
  readOptions([
    "trial",
    "--port",
    "3099",
    "--title",
    "Trial App",
    "--root",
    root,
    ...extra,
  ]);

test("refuses a bad name, a missing title or a port outside 3000-3099", () => {
  assert.throws(
    () => readOptions(["Bus", "--port", "3099", "--title", "x"]),
    UsageError
  );
  assert.throws(() => readOptions(["bus", "--port", "3099"]), UsageError);
  assert.throws(
    () => readOptions(["bus", "--port", "8080", "--title", "x"]),
    UsageError
  );
  assert.throws(
    () =>
      readOptions([
        "bus",
        "--port",
        "3099",
        "--title",
        "x",
        "--accent",
        "blue",
      ]),
    UsageError
  );
});

test("refuses a name that would break the generated code", () => {
  for (const title of ['GAA "Bus"', "Bus\\", "Bus {1}", "<Bus>", "Bus`"]) {
    assert.throws(
      () => readOptions(["bus", "--port", "3099", "--title", title]),
      UsageError,
      title
    );
  }
  assert.throws(
    () =>
      readOptions([
        "bus",
        "--port",
        "3099",
        "--title",
        "Bus",
        "--short",
        "B's",
      ]),
    UsageError
  );
});

test("creates the app and registers it everywhere workspaces are listed", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  createApp(plan(root, ["--scanner"]));

  const app = join(root, "apps/pwa/trial");
  for (const file of [
    "package.json",
    "AGENTS.md",
    "public/_headers",
    "public/icons/icon-512.png",
    "src/app/manifest.ts",
    "src/components/home.tsx",
    "src/styles/app.css",
  ]) {
    assert.ok(existsSync(join(app, file)), file);
  }
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.equal(manifest.name, "@barrelsgd/pwa-trial");
  assert.match(manifest.scripts.dev, DEV_SCRIPT);
  assert.match(readFileSync(join(app, "AGENTS.md"), "utf8"), PORT_HEADER);
  const headers = readFileSync(join(app, "public/_headers"), "utf8");
  assert.match(headers, CAMERA_ALLOWED);
  assert.match(headers, WASM_ALLOWED_QUOTED);
  assert.doesNotMatch(
    readFileSync(join(app, "src/app/layout.tsx"), "utf8"),
    PLACEHOLDER,
    "every placeholder is filled"
  );

  const root_ = (path) => readFileSync(join(root, path), "utf8");
  assert.match(root_("package.json"), ROOT_SCRIPT);
  for (const dockerfile of globSync("apps/web/*/Dockerfile", { cwd: root })) {
    assert.match(root_(dockerfile), DOCKER_COPY, dockerfile);
  }
  const volumes = root_(".devcontainer/dependency-volumes.txt");
  assert.match(volumes, VOLUME_MODULES);
  assert.match(volumes, VOLUME_NEXT);
  const devcontainer = root_(".devcontainer/devcontainer.json");
  for (const target of [
    "target=/workspace/apps/pwa/trial/node_modules,",
    `target=${LOCAL_FOLDER}/apps/pwa/trial/node_modules,`,
    "target=/workspace/apps/pwa/trial/.next,",
    `target=${LOCAL_FOLDER}/apps/pwa/trial/.next,`,
  ]) {
    assert.equal(devcontainer.split(target).length - 1, 1, target);
  }
  assert.match(root_("docs/ports.md"), PORT_ROW);
  assert.match(
    root_("AGENTS.md"),
    MAP_ROW,
    "the root instruction map names the app"
  );

  assert.throws(
    () => createApp(plan(root)),
    UsageError,
    "a second run refuses"
  );
});

test("a non-scanning app keeps the camera and WebAssembly switched off", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  createApp(plan(root));
  const app = join(root, "apps/pwa/trial");
  const headers = readFileSync(join(app, "public/_headers"), "utf8");
  assert.match(headers, CAMERA_OFF);
  assert.doesNotMatch(headers, WASM_ALLOWED);
  const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  assert.doesNotMatch(manifest.scripts.build, COPIES_ZXING);
});

test("takes over a Reserved port row and refuses a port already built", () => {
  const ports = [
    "## Web apps",
    "",
    "| events | `@barrelsgd/web-events` | 3009 |",
    "",
    "### Reserved and planned",
    "",
    "| Port | App | Status |",
    "| --- | --- | --- |",
    "| 3061 | `@barrelsgd/web-janitor` (janitor PWA) | Reserved (client) |",
    "| 3064 | `@barrelsgd/pwa-printix` (scanner) | Built, dev only; not deployed (client) |",
    "",
    "### Retired ports",
  ].join("\n");
  const base = { name: "janitor", title: "Janitor" };
  assert.match(portsWithApp(ports, { ...base, port: 3061 }), TAKEN_OVER_ROW);
  assert.match(
    portsWithApp(ports, { ...base, port: 3063 }),
    ROW_IN_ORDER,
    "a new port goes in number order"
  );
  assert.throws(() => portsWithApp(ports, { ...base, port: 3064 }), UsageError);
  assert.throws(() => portsWithApp(ports, { ...base, port: 3009 }), UsageError);
});

test("placeholder icons are valid PNGs and accent text stays readable", () => {
  const png = solidPng(4, "#1d4ed8");
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
  assert.equal(png.readUInt32BE(16), 4);
  assert.equal(textOn("#1d4ed8"), "#ffffff");
  assert.equal(textOn("#7ed321"), "#000000");
});
