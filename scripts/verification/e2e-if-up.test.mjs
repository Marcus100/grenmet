import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { APPS, planE2e, portIsOpen } from "./e2e-if-up.mjs";

const SCRIPT = fileURLToPath(new URL("./e2e-if-up.mjs", import.meta.url));
const SKIP_LINE = /SKIP gms e2e: nothing is listening on :3003/u;
const REQUIRE_MESSAGE = /--require was given/u;

test("only apps whose server is up are run; the rest are skipped", () => {
  const plan = planE2e(APPS, { 3001: false, 3003: true });
  assert.deepEqual(
    plan.run.map((a) => a.name),
    ["gms"]
  );
  assert.deepEqual(
    plan.skip.map((a) => a.name),
    ["gaa-admin"]
  );
  assert.deepEqual(planE2e(APPS, {}).run, []);
});

test("portIsOpen sees a listening port and a closed one", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  assert.equal(await portIsOpen(port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await portIsOpen(port), false);
});

test("with no dev servers the CLI skips cleanly and exits 0; --require fails", async (t) => {
  // Skip when a developer really has one of the servers running.
  if ((await portIsOpen(3003)) || (await portIsOpen(3001))) {
    t.skip("a dev server is running on this machine");
    return;
  }
  const skipped = spawnSync("node", [SCRIPT], { encoding: "utf8" });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, SKIP_LINE);
  const required = spawnSync("node", [SCRIPT, "--require"], {
    encoding: "utf8",
  });
  assert.equal(required.status, 1);
  assert.match(required.stderr, REQUIRE_MESSAGE);
});
