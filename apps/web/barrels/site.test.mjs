import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./build.mjs";

test("holding page ships accessible content and only local analytics wiring", () => {
  const html = readFileSync(
    new URL("./dist/index.html", import.meta.url),
    "utf8"
  );
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes("<main>") && html.includes("<h1>"));
  assert.ok(html.includes('href="https://eugine.me/"'));
  assert.ok(html.includes("Built by Eugine Whint"));
  assert.ok(html.includes('src="/analytics.mjs"'));
  assert.ok(!html.includes("googletagmanager.com"));
  assert.ok(html.includes("Privacy settings"));
  assert.ok(html.includes("Optional analytics is currently disabled"));
});

test("all stylesheet tokens resolve from the shared foundation", () => {
  const css = readFileSync(
    new URL("./dist/style.css", import.meta.url),
    "utf8"
  );
  const tokens = readFileSync(
    new URL("./dist/tokens.css", import.meta.url),
    "utf8"
  );
  for (const [, token] of css.matchAll(/var\((--[\w-]+)\)/g))
    assert.ok(tokens.includes(`${token}:`), `Missing ${token}`);
});

test("static modules share the reader policy and CSP permits only the required tag endpoints", () => {
  const policy = readFileSync(
    new URL("./dist/analytics-policy.js", import.meta.url),
    "utf8"
  );
  assert.ok(policy.includes('"id":"barrels"'));
  assert.ok(!policy.includes('"id":"gms"'));
  const transport = readFileSync(
    new URL("./dist/google-analytics.js", import.meta.url),
    "utf8"
  );
  assert.ok(transport.includes("dataLayer.push(arguments)"));
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  assert.ok(csp.includes("script-src 'self' https://www.googletagmanager.com"));
  assert.ok(!csp.includes("unsafe-inline"));
});
