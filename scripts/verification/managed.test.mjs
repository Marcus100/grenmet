import assert from "node:assert/strict";
import test from "node:test";
import { verifyManaged } from "./managed.mjs";

const PROJECT = /^grenmet-verify-[a-f0-9]{32}$/;
function harness(failAt, address = "127.0.0.1:15432") {
  const calls = [];
  const messages = [];
  const run = (command, args, env, _capture, cleanup) => {
    calls.push({ command, args, env, cleanup });
    if (failAt?.(command, args))
      return Promise.reject(new Error("injected failure"));
    return Promise.resolve(args.includes("port") ? address : "");
  };
  return {
    calls,
    messages,
    options: {
      run,
      env: {
        POSTGRES_SERVER: "production.example",
        VERIFY_DB_BASE: "production",
      },
      inContainer: false,
      log: (m) => messages.push(m),
    },
  };
}
function assertCleanup(h) {
  const docker = h.calls.filter((c) => c.args[0] === "compose");
  const project = docker[0].args[2];
  assert.match(project, PROJECT);
  assert.ok(docker.every((c) => c.args[2] === project));
  const last = h.calls.at(-1);
  assert.ok(last.args.includes("down"));
  assert.equal(last.cleanup, true);
  return project;
}
test("success cleans up before reporting pass and overwrites application targets", async () => {
  const h = harness();
  await verifyManaged("release", h.options);
  assertCleanup(h);
  const backend = h.calls.find(
    (c) => c.args[0] === "scripts/verification/backend.sh"
  );
  assert.equal(backend.env.POSTGRES_SERVER, "127.0.0.1");
  assert.equal(backend.env.VERIFY_DB_BASE, "verification");
  assert.ok(h.messages.at(-1).startsWith("PASS:"));
});
for (const stage of ["up", "backend.sh", "down"]) {
  test(`${stage} failure cannot report success and still attempts cleanup`, async () => {
    const h = harness((_command, args) =>
      args.some((a) => a === stage || a.endsWith(`/${stage}`))
    );
    await assert.rejects(verifyManaged("backend", h.options));
    assertCleanup(h);
    assert.ok(h.messages.every((m) => !m.startsWith("PASS:")));
  });
}
test("unsafe published address aborts before tests and cleans its own stack", async () => {
  const h = harness(undefined, "0.0.0.0:5432");
  await assert.rejects(verifyManaged("backend", h.options));
  assertCleanup(h);
  assert.ok(h.calls.every((c) => c.command !== "bash"));
});
test("missing tools and devcontainers fail before creating infrastructure", async () => {
  for (const inContainer of [false, true]) {
    const h = harness(() => true);
    await assert.rejects(
      verifyManaged("storage", { ...h.options, inContainer })
    );
    assert.ok(h.calls.every((c) => !c.args.includes("compose")));
  }
});
test("simultaneous invocations own different projects", async () => {
  const one = harness();
  const two = harness();
  await Promise.all([
    verifyManaged("backend", one.options),
    verifyManaged("backend", two.options),
  ]);
  assert.notEqual(assertCleanup(one), assertCleanup(two));
});

test("release stops on portfolio drift before provisioning databases", async () => {
  const h = harness(
    (command, args) => command === "pnpm" && args[0] === "docs:check-portfolio"
  );
  await assert.rejects(verifyManaged("release", h.options), {
    message: "injected failure",
  });
  assert.ok(h.calls.every((call) => !call.args.includes("up")));
  assert.ok(h.messages.every((message) => !message.startsWith("PASS:")));
});
