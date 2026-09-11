const cmsFailure = /CMS sign-in destination failed/;
const authFailure = /auth.staging.example.test/;
const honoFailure = /Functional smoke failed: hapi/;

import assert from "node:assert/strict";
import test from "node:test";
import { check, checkCmsSignIn, checkDeployment, validPage } from "./smoke.mjs";

test("deployment probes the real sign-in route and requires its form", async () => {
  const urls = [];
  const fetcher = (url) => {
    urls.push(url);
    const { hostname, pathname } = new URL(url);
    if (pathname === "/signin")
      return Promise.resolve(new Response(cmsLink("staging.example.test")));
    if (hostname.startsWith("auth.")) {
      return Promise.resolve(
        new Response("<form>Sign in</form>", {
          status: pathname === "/" ? 200 : 404,
        })
      );
    }
    return Promise.resolve(
      new Response(
        '<main>{"status":"ok","docs":[],"ready":true,"data":[],"products":[]}</main>'
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
              : '<main><form>{"status":"ok","docs":[],"ready":true,"data":[],"products":[]}</form></main>',
            { status: new URL(url).pathname === failedPath ? 503 : 200 }
          )
        )
      )
    );
  }
});

for (const domain of ["staging.example.test", "example.test"]) {
  test(`Hono HTTPS health gates deployment to ${domain}`, async () => {
    const healthUrl = `https://hapi.${domain}/health`;
    const urls = [];
    const healthy = (url) => {
      urls.push(url);
      if (new URL(url).pathname === "/signin")
        return Promise.resolve(new Response(cmsLink(domain)));
      return Promise.resolve(
        new Response(
          url === healthUrl
            ? '{"status":"ok","service":"api-hono"}'
            : '<main><form>{"docs":[],"ready":true,"data":[],"products":[]}</form></main>'
        )
      );
    };
    await checkDeployment(domain, healthy);
    assert.ok(urls.includes(healthUrl));
    for (const response of [
      new Response('{"status":"ok"}', { status: 503 }),
      new Response('{"status":"unhealthy"}'),
      new Response("<html>Proxy fallback</html>"),
    ]) {
      await assert.rejects(
        checkDeployment(domain, (url) =>
          url === healthUrl ? Promise.resolve(response) : healthy(url)
        ),
        honoFailure
      );
    }
    const tlsFailure = new Error("self-signed certificate");
    await assert.rejects(
      checkDeployment(domain, (url) =>
        url === healthUrl ? Promise.reject(tlsFailure) : healthy(url)
      ),
      (error) => error === tlsFailure
    );
  });
}

function cmsLink(domain) {
  return `<a href="https://auth.${domain}/?app=gms-cms&amp;returnTo=${encodeURIComponent(`https://cms.${domain}/admin`)}">Sign in with GMS</a>`;
}

test("CMS sign-in rejects build defaults and cross-environment destinations", async () => {
  const domain = "staging.example.test";
  await checkCmsSignIn(domain, async () => new Response(cmsLink(domain)));
  for (const body of [
    '<a href="http://localhost:3000/?app=gms-cms&amp;returnTo=http%3A%2F%2Flocalhost%3A3006%2Fadmin">Sign in</a>',
    cmsLink("example.test"),
    cmsLink(domain).replace(
      encodeURIComponent(`https://cms.${domain}/admin`),
      encodeURIComponent("https://other.example.test/admin")
    ),
    `<script>${cmsLink(domain)}</script>Application error:`,
    "<main>Sign in</main>",
  ]) {
    await assert.rejects(
      checkCmsSignIn(domain, async () => new Response(body)),
      cmsFailure
    );
  }
  await assert.rejects(
    checkCmsSignIn(
      domain,
      async () => new Response(cmsLink(domain), { status: 500 })
    ),
    cmsFailure
  );
});
