// Renders each environment's real Compose model in CI with synthetic secrets, so a
// scope, image or required-secret mistake fails before any runner delivery. The
// host-side checks in core.sh still run against live credentials.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  appServices,
  migrationServices,
  validateComposeScope,
  webImages,
} from "../ci/release-scope.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dockerDir = join(root, "infra/docker");
const renderScript = join(root, "scripts/production/render-env.py");
const PLACEHOLDER = "ci-placeholder-";
const IMAGE_TAG = /:(staging|production)-sha-[0-9a-f]{40}$/u;
const SHARED_API_SERVICES = ["api", "worker", "nhc-worker", "prestart"];

// Keys whose format render-env.py validates need a well-formed synthetic value.
const FORMATTED_VALUES = {
  CORE_POSTGRES_IMAGE: `postgres:17@sha256:${"a".repeat(64)}`,
  CORE_REDIS_IMAGE: `redis:7-alpine@sha256:${"b".repeat(64)}`,
  CORE_PRIVATE_IP: "10.0.0.5",
  DEPLOY_IMAGE_TAG: `sha-${"c".repeat(40)}`,
  // Staging-only Traefik basic auth: htpasswd bcrypt lines.
  STAGING_BASIC_AUTH_USERS: `reviewer:$2y$05$${"d".repeat(53)}`,
  ADMINER_BASIC_AUTH_USERS: `dba:$2y$05$${"e".repeat(53)}`,
};

const baseEnvironment = Object.fromEntries(
  ["PATH", "HOME", "DOCKER_CONFIG", "XDG_CONFIG_HOME", "TMPDIR"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]])
);

const dockerAvailable =
  spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;

function requiredSecretNames() {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import importlib.util, json, sys; s = importlib.util.spec_from_file_location('r', sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.REQUIRED_SECRETS))",
      renderScript,
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const secretNames = requiredSecretNames();

function syntheticSecrets(omit) {
  const secrets = Object.fromEntries(
    secretNames.map((name) => [name, `${PLACEHOLDER}${name}`.padEnd(40, "x")])
  );
  Object.assign(secrets, FORMATTED_VALUES);
  if (omit) delete secrets[omit];
  return secrets;
}

function render(environment, directory, omit) {
  const destination = join(directory, `${environment}.env.local`);
  const result = spawnSync(
    "python3",
    [renderScript, `${environment}.env`, destination],
    {
      cwd: dockerDir,
      env: { ...baseEnvironment, ...syntheticSecrets(omit) },
      encoding: "utf8",
    }
  );
  return { result, destination };
}

function composeModel(environment, rendered) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      `${environment}.env`,
      "--env-file",
      rendered,
      "-f",
      "docker-compose.deploy.yml",
      "-p",
      "preflight",
      "config",
      "--format",
      "json",
    ],
    { cwd: dockerDir, env: baseEnvironment, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function withDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), "deploy-preflight-"));
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const skip = dockerAvailable
  ? false
  : "docker compose is unavailable; CI runs this check";

test("CI must be able to render the deployment model", () => {
  if (process.env.CI) assert.ok(dockerAvailable, "docker compose is required");
});

for (const environment of ["staging", "production"]) {
  test(`${environment} deployment model matches the release registry`, {
    skip,
  }, () => {
    withDirectory((directory) => {
      const { result, destination } = render(environment, directory);
      assert.equal(result.status, 0, result.stderr);
      const model = composeModel(environment, destination);
      validateComposeScope(model);

      const services = model.services;
      for (const name of appServices)
        assert.ok(services[name].healthcheck, `${name} has no healthcheck`);
      for (const name of migrationServices)
        assert.ok(services[name], `${name} is missing`);

      for (const image of webImages) {
        const name =
          image.app === "cms-migrate" ? "cms-migrate" : `web-${image.app}`;
        const reference = services[name].image;
        assert.ok(
          reference.startsWith("ghcr.io/") &&
            reference.includes(`barrelsgd-${image.image}:`),
          `${name} does not use ${image.image}: ${reference}`
        );
        assert.match(reference, IMAGE_TAG);
        assert.ok(reference.includes(`:${environment}-sha-`));
      }

      const apiImages = new Set(
        SHARED_API_SERVICES.map((name) => services[name].image)
      );
      assert.equal(apiImages.size, 1, "API and workers must share one image");
      assert.match([...apiImages][0], IMAGE_TAG);
    });
  });

  test(`${environment} scope validation rejects a missing or unregistered service`, {
    skip,
  }, () => {
    withDirectory((directory) => {
      const { destination } = render(environment, directory);
      const model = composeModel(environment, destination);
      for (const name of appServices) {
        const { [name]: _removed, ...rest } = model.services;
        assert.throws(() => validateComposeScope({ services: rest }), name);
      }
      assert.throws(() =>
        validateComposeScope({ services: { ...model.services, surface: {} } })
      );
    });
  });
}

test("a missing required secret is rejected by name, without printing any value", () => {
  withDirectory((directory) => {
    for (const name of secretNames) {
      const { result } = render("staging", directory, name);
      assert.notEqual(result.status, 0, `${name} should be required`);
      assert.ok(result.stderr.includes(name), `${name} not named`);
      assert.equal(
        `${result.stdout}${result.stderr}`.includes(PLACEHOLDER),
        false,
        "a secret value was printed"
      );
    }
  });
});

test("every required secret is passed to the delivery step", () => {
  const workflow = readFileSync(
    join(root, ".github/workflows/deploy.yml"),
    "utf8"
  );
  for (const name of secretNames) {
    const passed = new RegExp(
      `^\\s+${name}: \\$\\{\\{ (secrets|vars)\\.`,
      "mu"
    );
    assert.match(workflow, passed, `${name} is not passed in deploy.yml`);
  }
});
