// biome-ignore-all lint/suspicious/noTemplateCurlyInString: verify literal Dev Containers substitution variables.
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const config = JSON.parse(
  read(".devcontainer/devcontainer.json")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")
);
const projects = globSync(
  [
    "apps/web/*/package.json",
    "apps/api/honoapi/package.json",
    "packages/*/package.json",
  ],
  { cwd: root }
)
  .map(dirname)
  .sort();
const required = [
  "node_modules",
  ".venv",
  ...projects.map((path) => `${path}/node_modules`),
  ".turbo",
  ...projects
    .filter((path) => path.startsWith("apps/web/"))
    .map((path) => `${path}/.next`),
];

test("every workspace and Next cache has an isolated volume at both repository paths", () => {
  const targets = new Set();
  for (const relative of required) {
    const pair = ["/workspace", "${localWorkspaceFolder}"].map((base) => {
      const target = `${base}/${relative}`;
      const matches = config.mounts.filter((mount) =>
        mount.split(",").includes(`target=${target}`)
      );
      assert.equal(matches.length, 1, target);
      const fields = matches[0].split(",");
      assert.ok(fields.includes("type=volume"), target);
      assert.ok(fields.includes("volume-nocopy"), target);
      const source = fields.find((field) => field.startsWith("source="));
      assert.ok(
        source.includes("${devcontainerId}"),
        "separate container installations"
      );
      assert.ok(!targets.has(target), "unique mount targets");
      targets.add(target);
      return source;
    });
    assert.equal(
      pair[0],
      pair[1],
      "both aliases see the same container-only volume"
    );
  }
  assert.deepEqual(
    read(".devcontainer/dependency-volumes.txt").trim().split("\n").sort(),
    required.sort()
  );
});

test("bootstrap checks mounts before install and owns only image-declared volume roots", () => {
  assert.ok(
    config.postCreateCommand.indexOf("check-dependency-isolation.mjs") <
      config.postCreateCommand.indexOf("pnpm install --frozen-lockfile")
  );
  assert.ok(config.postStartCommand.includes("check-dependency-isolation.mjs"));
  assert.ok(
    config.initializeCommand[1].endsWith(
      "/.devcontainer/prepare-host-mountpoints.mjs"
    )
  );
  const setup = read(".devcontainer/prepare-dependencies.sh");
  assert.ok(setup.indexOf("mountpoint -q") < setup.indexOf("chown node:node"));
  assert.ok(setup.includes("/usr/local/share/grenmet-dependency-volumes.txt"));
  assert.ok(!setup.includes("chown -R"));
});

test("editor waits for Node and Python setup and uses declared SDKs", () => {
  assert.equal(config.waitFor, "postCreateCommand");
  assert.ok(
    config.postCreateCommand.includes("uv sync --frozen --package fast-back")
  );
  assert.ok(config.postCreateCommand.includes("pnpm exec turbo --version"));
  assert.ok(
    config.postCreateCommand.indexOf("check-dependency-isolation.mjs") <
      config.postCreateCommand.indexOf("uv sync")
  );
  const settings = JSON.parse(read(".vscode/settings.json"));
  assert.equal(
    settings["python.defaultInterpreterPath"],
    "${workspaceFolder}/.venv"
  );
  assert.equal(
    settings["js/ts.tsdk.path"],
    "./apps/web/gaa-admin/node_modules/typescript"
  );
  assert.equal(settings["js/ts.experimental.useTsgo"], true);
  assert.ok(
    config.customizations.vscode.extensions.includes(
      "TypeScriptTeam.native-preview"
    )
  );
  assert.equal(
    JSON.parse(read("apps/web/gaa-admin/package.json")).devDependencies
      .typescript,
    "catalog:"
  );
  assert.ok(!("typescript.tsdk" in settings));
  assert.ok(
    read(".devcontainer/Dockerfile").includes(
      "UV_PYTHON_INSTALL_DIR=/opt/uv/python"
    )
  );
});
