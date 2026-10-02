import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./build.mjs";

test("holding page ships accessible content and a real personal-site link without scripts", () => {
  const html = readFileSync(
    new URL("./dist/index.html", import.meta.url),
    "utf8"
  );
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes("<main>") && html.includes("<h1>"));
  assert.ok(html.includes('href="https://eugine.me/"'));
  assert.ok(html.includes("Built by Eugine Whint"));
  assert.ok(!html.includes("<script"));
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
