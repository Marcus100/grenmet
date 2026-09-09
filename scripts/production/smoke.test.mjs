const authFailure = /auth.staging.example.test/;

import assert from "node:assert/strict";
import test from "node:test";
import { check, checkDeployment, validPage } from "./smoke.mjs";

test("deployment probes the real sign-in route and requires its form", async () => {
  const urls = [];
  const fetcher = (url) => {
    urls.push(url);
    const { hostname, pathname } = new URL(url);
    if (hostname.startsWith("auth.")) {
      return Promise.resolve(
        new Response("<form>Sign in</form>", {
          status: pathname === "/" ? 200 : 404,
        })
      );
    }
    return Promise.resolve(
      new Response(
        '<main>{"docs":[],"ready":true,"data":[],"products":[]}</main>'
      )
    );
  };
  await checkDeployment("staging.example.test", fetcher);
  assert.ok(urls.includes("https://auth.staging.example.test/"));
  await assert.rejects(
    checkDeployment("staging.example.test", (url) =>
      new URL(url).hostname.startsWith("auth.")
        ? Promise.resolve(new Response("<html>Empty shell</html>"))
        : fetcher(url)
    ),
    authFailure
  );
});

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

test("CAP and product storage failures block release rather than reading as empty feeds", async () => {
  for (const failedPath of ["/api/cap/latest-active", "/api/public/products"]) {
    await assert.rejects(
      checkDeployment("staging.example.test", (url) =>
        Promise.resolve(
          new Response(
            new URL(url).pathname === failedPath
              ? "Unavailable"
              : '<main><form>{"docs":[],"ready":true,"data":[],"products":[]}</form></main>',
            { status: new URL(url).pathname === failedPath ? 503 : 200 }
          )
        )
      )
    );
  }
});
