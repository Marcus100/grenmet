import assert from "node:assert/strict";
import test from "node:test";
import { check, validPage } from "./smoke.mjs";

test("rejects streamed 200 render failures", () => {
  assert.equal(
    validPage({ ok: true }, "<main>Application error:</main>", "<main"),
    false
  );
  assert.equal(
    validPage({ ok: true }, '<main></main>{"digest":"12345"}', "<main"),
    false
  );
  assert.equal(validPage({ ok: true }, "<main>Ready</main>", "<main"), true);
});
test("requires meaningful content and rejects HTTP errors", () => {
  assert.equal(
    validPage({ ok: true }, "<html>proxy error</html>", "<main"),
    false
  );
  assert.equal(
    validPage({ ok: false }, "<main>Failure</main>", "<main"),
    false
  );
  assert.equal(
    validPage({ ok: true }, '{"docs":[],"totalDocs":0}', '"docs":'),
    true
  );
});
test("propagates network failures", async () => {
  await assert.rejects(
    check("https://cms.example.test", '"docs":', () =>
      Promise.reject(new Error("network unavailable"))
    )
  );
});
