const functionalFailure = /Functional smoke failed/;
const cmsFailure = /CMS sign-in destination failed/;
const authFailure = /auth.staging.example.test/;

import assert from "node:assert/strict";
import test from "node:test";
import { check, checkCmsSignIn, checkDeployment, validPage } from "./smoke.mjs";

test("deployment probes the real sign-in route and requires its form", async () => {
  const urls = [];
  const fetcher = (url) => {
    urls.push(url);
    const { hostname, pathname } = new URL(url);
    if (pathname === "/auth/start")
      return Promise.resolve(cmsHandoff("staging.example.test"));
    if (pathname === "/signin")
      return Promise.resolve(new Response(cmsLink("staging.example.test")));
    if (hostname.startsWith("auth.")) {
      return Promise.resolve(
        new Response("<form>Sign in</form>", {
          status: ["/", "/continue"].includes(pathname) ? 200 : 404,
        })
      );
    }
    return Promise.resolve(
      new Response(
        '<main>{"status":"ok","deskUpdates":{},"docs":[],"ready":true,"data":[],"products":[]}</main>'
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
              : '<main><form>{"status":"ok","deskUpdates":{},"docs":[],"ready":true,"data":[],"products":[]}</form></main>',
            { status: new URL(url).pathname === failedPath ? 503 : 200 }
          )
        )
      )
    );
  }
});

test("deployment smoke no longer probes the retired Hono API", async () => {
  const urls = [];
  await checkDeployment("example.test", (url) => {
    urls.push(url);
    if (new URL(url).pathname === "/auth/start")
      return Promise.resolve(cmsHandoff("example.test"));
    if (new URL(url).pathname === "/signin")
      return Promise.resolve(new Response(cmsLink("example.test")));
    return Promise.resolve(
      new Response(
        '<main><form>{"deskUpdates":{},"docs":[],"ready":true,"data":[],"products":[]}</form></main>'
      )
    );
  });
  assert.ok(!urls.some((url) => new URL(url).hostname.startsWith("hapi.")));
  // The CMS check uses the homepage feed GMS reads, not a removed collection.
  assert.ok(urls.includes("https://cms.example.test/api/public/home"));
  assert.ok(!urls.some((url) => new URL(url).pathname === "/api/content"));
});

function cmsLink() {
  return '<a href="/auth/start?returnTo=%2Fadmin">Sign in with GMS</a>';
}

function cmsHandoff(domain, overrides = {}) {
  return new Response(null, {
    status: 307,
    headers: {
      location: `https://auth.${domain}/continue?app=cms&state=${"a".repeat(32)}`,
    },
    ...overrides,
  });
}

function cmsFetcher(domain, body = cmsLink(), handoff = cmsHandoff(domain)) {
  return (url) => {
    const path = new URL(url).pathname;
    if (path === "/signin") return Promise.resolve(new Response(body));
    if (path === "/auth/start") return Promise.resolve(handoff);
    return Promise.resolve(new Response("<form>Sign in</form>"));
  };
}

test("CMS sign-in follows the local SSO start route to the matching auth environment", async () => {
  const domain = "staging.example.test";
  const requests = [];
  const fetcher = cmsFetcher(domain);
  await checkCmsSignIn(domain, (url, options) => {
    requests.push({ url, redirect: options.redirect });
    return fetcher(url, options);
  });
  assert.deepEqual(
    requests.map(({ redirect }) => redirect),
    ["follow", "manual", "follow"]
  );
  assert.equal(
    requests[1].url,
    `https://cms.${domain}/auth/start?returnTo=%2Fadmin`
  );
});

test("CMS sign-in rejects obsolete links, unsafe return paths and render failures", async () => {
  const domain = "staging.example.test";
  for (const body of [
    '<a href="http://localhost:3000/?app=gms-cms">Sign in</a>',
    '<a href="https://auth.staging.example.test/?app=gms-cms">Sign in</a>',
    '<a href="https://cms.example.test/auth/start?returnTo=%2Fadmin">Sign in</a>',
    '<a href="/auth/start?returnTo=https%3A%2F%2Fother.example.test">Sign in</a>',
    '<a href="/auth/start?returnTo=%2F">Sign in</a>',
    `<script>${cmsLink()}</script>Application error:`,
    "<main>Sign in</main>",
  ]) {
    await assert.rejects(
      checkCmsSignIn(domain, cmsFetcher(domain, body)),
      cmsFailure
    );
  }
  await assert.rejects(
    checkCmsSignIn(
      domain,
      async () => new Response(cmsLink(), { status: 500 })
    ),
    cmsFailure
  );
});

test("CMS handoff rejects wrong origin, app, path, missing state and non-redirects", async () => {
  const domain = "staging.example.test";
  const correct = cmsHandoff(domain).headers.get("location");
  for (const location of [
    correct.replace("staging.example.test", "example.test"),
    correct.replace("https:", "http:"),
    correct.replace("/continue?", "/?"),
    correct.replace("app=cms", "app=events"),
    correct.split("&state=")[0],
    "not-a-url",
  ]) {
    await assert.rejects(
      checkCmsSignIn(
        domain,
        cmsFetcher(
          domain,
          cmsLink(),
          cmsHandoff(domain, { headers: { location } })
        )
      ),
      cmsFailure
    );
  }
  for (const status of [200, 404, 500]) {
    await assert.rejects(
      checkCmsSignIn(
        domain,
        cmsFetcher(domain, cmsLink(), cmsHandoff(domain, { status }))
      ),
      cmsFailure
    );
  }
});

test("CMS handoff requires a working auth sign-in form", async () => {
  const domain = "staging.example.test";
  const fetcher = cmsFetcher(domain);
  await assert.rejects(
    checkCmsSignIn(domain, (url, options) =>
      new URL(url).pathname === "/continue"
        ? Promise.resolve(new Response("<main>Unavailable</main>"))
        : fetcher(url, options)
    ),
    functionalFailure
  );
});
