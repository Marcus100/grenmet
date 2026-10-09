import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const readWorkflow = (name) =>
  readFileSync(
    new URL(`../../.github/workflows/${name}`, import.meta.url),
    "utf8"
  );
const webSource = readWorkflow("ci-web.yml");
const webGate = webSource
  .split("node --input-type=module <<'JS'\n")[1]
  .split("          JS")[0];
const apiGate = readWorkflow("ci-api.yml")
  .split("      - name: Check all jobs")[1]
  .split("        run: |\n")[1];
const needsExpression = /\$\{\{ needs\.([a-z-]+)\.(result|outputs\.api) \}\}/g;

function webResults(selected = true) {
  return Object.fromEntries(
    [
      "image-selection",
      "biome",
      "type-check",
      "peer-check",
      "guardrails",
      "drift",
      "tests",
      "container-smoke",
      "storage-integration",
      "weather-images",
    ].map((name) => [
      name,
      {
        result: "success",
        outputs: {
          web: selected ? '[{"app":"auth"}]' : "[]",
          weather: selected ? '[{"name":"surface"}]' : "[]",
        },
      },
    ])
  );
}
function runWeb(results) {
  return spawnSync(process.execPath, ["--input-type=module"], {
    input: webGate,
    env: { ...process.env, RESULTS: JSON.stringify(results) },
  }).status;
}

test("web gate accepts intentional empty selection, rejects unexpected skips and failures", () => {
  assert.equal(runWeb(webResults()), 0);
  const omitted = webResults(false);
  omitted["container-smoke"].result = "skipped";
  omitted["weather-images"].result = "skipped";
  assert.equal(runWeb(omitted), 0);
  for (const name of Object.keys(webResults())) {
    for (const result of ["failure", "cancelled", "skipped"]) {
      const jobs = webResults();
      jobs[name].result = result;
      assert.notEqual(runWeb(jobs), 0, `${name}: ${result}`);
    }
  }
  omitted["image-selection"].result = "failure";
  assert.notEqual(runWeb(omitted), 0);
});

test("API gate permits only intentionally omitted Docker checks", () => {
  const run = (overrides = {}, selected = "true") => {
    const script = apiGate.replace(needsExpression, (_match, name, field) =>
      field === "outputs.api" ? selected : (overrides[name] ?? "success")
    );
    return spawnSync("bash", ["-e"], { input: script }).status;
  };
  assert.equal(run(), 0);
  assert.equal(run({ docker: "skipped" }, "false"), 0);
  assert.notEqual(run({ docker: "skipped" }), 0);
  for (const job of [
    "image-selection",
    "quality",
    "security",
    "test",
    "collectors",
    "docker",
    "docs",
  ])
    for (const result of ["failure", "cancelled", "skipped"])
      if (job !== "docker" || result !== "skipped")
        assert.notEqual(
          run({ [job]: result }, "false"),
          0,
          `${job}: ${result}`
        );
});

test("publishing follows successful smoke verification on the same builder", () => {
  for (const workflow of ["build-api-image.yml", "build-web-images.yml"]) {
    const source = readWorkflow(workflow);
    const verify = source.indexOf("- name: Build image for verification");
    const smoke = source.indexOf("- name: Smoke-test image before publishing");
    const publish = source.indexOf(
      "- name: Publish verified image from builder cache"
    );
    assert.ok(verify > 0 && smoke > verify && publish > smoke);
    const steps = source.slice(
      verify,
      source.indexOf("- name: Upload", publish)
    );
    assert.ok(!steps.includes("continue-on-error:"));
    assert.ok(!steps.includes("if:"));
    assert.ok(!steps.includes("setup-buildx-action"));
    assert.ok(source.slice(verify, smoke).includes("load: true"));
    assert.ok(source.slice(publish).includes("push: true"));
  }
});

test("deployment waits for code checks and verified core builds without cancellation", () => {
  for (const workflow of ["pipeline-staging.yml", "pipeline-prod.yml"]) {
    const source = readWorkflow(workflow);
    const deploy = source
      .split("\n  deploy:\n")[1]
      .split("\n  deploy-weather:")[0];
    assert.ok(
      deploy.includes(
        "needs: [release-scope, ci-api, ci-web, api-client, build-api, build-web]"
      )
    );
    assert.ok(source.includes("cancel-in-progress: false"));
    assert.equal(source.includes("build-weather-images.yml"), false);
    assert.equal(source.includes("deploy-weather.yml"), false);
  }
});

const NEXT_JOB = /\n {2}[a-z][a-z-]*:/;
const REGISTRY_READ = /\n {6}packages: read\n/;
const REGISTRY_WRITE = /packages: write/;

test("release callers grant registry read permission required by reusable CI", () => {
  for (const pipeline of ["pipeline-staging.yml", "pipeline-prod.yml"]) {
    const source = readWorkflow(pipeline);
    for (const job of ["ci-api", "ci-web"]) {
      const block = source.split(`  ${job}:\n`)[1]?.split(NEXT_JOB)[0];
      assert.ok(block, `${pipeline}: missing ${job}`);
      assert.match(
        block,
        REGISTRY_READ,
        `${pipeline}: ${job} must allow registry reads`
      );
      assert.doesNotMatch(
        block,
        REGISTRY_WRITE,
        `${pipeline}: CI must not publish`
      );
    }
  }
});

const DOCKERHUB_USERNAME = /username: \$\{\{ secrets\.DOCKERHUB_USERNAME \}\}/;
const DOCKERHUB_TOKEN = /password: \$\{\{ secrets\.DOCKERHUB_TOKEN \}\}/;
const BUILDX_STEP =
  /\n {6}- (?:name: Set up Docker Buildx\n {8}uses: |uses: )docker\/setup-buildx-action@/;

test("every CI and release builder authenticates before pulling the BuildKit image", () => {
  for (const workflow of [
    "ci-api.yml",
    "ci-web.yml",
    "build-api-image.yml",
    "build-web-images.yml",
    "build-weather-images.yml",
  ]) {
    const jobs = readWorkflow(workflow).split(NEXT_JOB);
    let builders = 0;
    for (const job of jobs) {
      const setup = job.search(BUILDX_STEP);
      if (setup < 0) continue;
      builders += 1;
      const login = job.indexOf("- name: Log in to Docker Hub for base images");
      assert.ok(
        login >= 0 && login < setup,
        `${workflow}: authenticate before Buildx`
      );
      const block = job.slice(login, setup);
      assert.ok(block.includes("registry: docker.io"), workflow);
      assert.match(block, DOCKERHUB_USERNAME, workflow);
      assert.match(block, DOCKERHUB_TOKEN, workflow);
      assert.ok(!block.includes("continue-on-error:"), workflow);
      if (workflow.startsWith("ci-")) {
        assert.ok(
          block.includes("github.actor != 'dependabot[bot]'"),
          workflow
        );
        assert.ok(
          block.includes(
            "github.event.pull_request.head.repo.full_name == github.repository"
          ),
          workflow
        );
      }
    }
    assert.equal(builders, workflow === "ci-web.yml" ? 2 : 1, workflow);
  }
});

test("database services authenticate during initialization before job steps run", () => {
  for (const workflow of ["ci-api.yml", "ci-web.yml"]) {
    const source = readWorkflow(workflow);
    const services = source
      .split("    services:\n")[1]
      ?.split("    steps:\n")[0];
    assert.ok(services, workflow);
    assert.ok(services.includes("        credentials:\n"), workflow);
    assert.match(services, DOCKERHUB_USERNAME, workflow);
    assert.match(services, DOCKERHUB_TOKEN, workflow);
  }
});
