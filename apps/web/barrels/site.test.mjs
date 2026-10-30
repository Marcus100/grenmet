import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import "./build.mjs";

const HIDDEN_PRIVACY_CARD = /<section[^>]*hidden[^>]*id="analytics-settings"/su;
const PRIVACY_DIALOG = /<section[^>]*role="dialog"/su;
const OVERCLAIM = /certified|ISO\s?\d|Microsoft Partner|Google Partner/iu;
const ELEMENT_ID = /\sid="([\w-]+)"/gu;
const WHITESPACE = /\s+/u;
const LOCAL_SRC = /src="\/[^"]+"/u;
const DESCRIBED_BY = /aria-describedby="([^"]+)"/gu;
const SCRIPT_OPEN = /<script\b([^>]*)>/gu;
const SCRIPT_SRC = /<script[^>]*src="([^"]+)"/gu;
const STYLE_BLOCK = /<style\b/u;
const STYLE_ATTRIBUTE = /\sstyle="/u;
const EVENT_ATTRIBUTE = /\son[a-z]+="/iu;
const PACKAGE_HEADING = /<h2 id="package-[\w-]+">([^<]+)<\/h2>/gu;
const H1_TAG = /<h1>/gu;
const CSS_VARIABLE = /var\((--[\w-]+)\)/gu;
const NEWSLETTER_LABEL = /<label for="newsletter-email">/u;
const PAGES = [
  "index.html",
  "services/index.html",
  "contact/index.html",
  "subscribe/status/index.html",
];

const read = (path) =>
  readFileSync(new URL(`./dist/${path}`, import.meta.url), "utf8");

test("holding page ships accessible content and only local analytics wiring", () => {
  const html = read("index.html");
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes("<main") && html.includes("<h1>"));
  assert.ok(html.includes('href="https://eugine.me/"'));
  assert.ok(html.includes("Built by Eugine Whint"));
  assert.ok(html.includes('src="/analytics.mjs"'));
  assert.ok(!html.includes("googletagmanager.com"));
  // Privacy popup starts hidden; analytics.mjs reveals it only where
  // optional analytics is configured.
  assert.ok(html.includes('aria-label="Privacy settings"'));
  assert.match(html, HIDDEN_PRIVACY_CARD);
  assert.match(html, PRIVACY_DIALOG);
});

test("every page is built from the shared partials and exists in dist", () => {
  for (const page of PAGES) {
    assert.ok(existsSync(new URL(`./dist/${page}`, import.meta.url)), page);
    const html = read(page);
    assert.ok(!html.includes("@include"), `${page} has an unresolved include`);
    assert.ok(html.includes('class="skip-link"'), `${page} skip link`);
    assert.ok(html.includes('aria-label="Main"'), `${page} main navigation`);
    assert.ok(html.includes('class="site-footer"'), `${page} footer`);
    assert.match(html, HIDDEN_PRIVACY_CARD, `${page} privacy card`);
    assert.equal((html.match(H1_TAG) ?? []).length, 1, `${page} one h1`);
  }
});

test("home page says who Barrels is and keeps the client boundary accurate", () => {
  const html = read("index.html");
  assert.ok(html.includes("software-led technology company"));
  assert.ok(html.includes("Grenada Airports Authority"));
  assert.ok(html.includes("Grenada Meteorological Service"));
  assert.ok(html.includes("They are not Barrels products."));
  assert.ok(!OVERCLAIM.test(html));
});

test("services page lists exactly the four first-catalogue packages", () => {
  const html = read("services/index.html");
  const headings = [...html.matchAll(PACKAGE_HEADING)].map((match) => match[1]);
  assert.deepEqual(headings, [
    "Web and Software",
    "Managed IT",
    "AI and Data",
    "Cloud and Security",
  ]);
  assert.ok(html.includes("DRAFT COPY"), "services copy is marked as draft");
  assert.ok(!OVERCLAIM.test(html));
});

test("contact form is labelled, validated in place and posts to the barrels site", () => {
  const html = read("contact/index.html");
  assert.ok(html.includes('id="contact-form"'));
  assert.ok(html.includes('method="post"'));
  for (const field of ["name", "email", "subject", "message"]) {
    assert.ok(
      html.includes(`<label for="contact-${field}">`),
      `label for ${field}`
    );
    assert.ok(
      html.includes(`id="contact-${field}-error"`),
      `error for ${field}`
    );
  }
  assert.ok(html.includes('type="email"'));
  assert.ok(html.includes('name="website"'), "honeypot field present");
  assert.ok(html.includes('aria-live="polite"'), "status region announced");
  assert.ok(html.includes("<noscript>"), "no-JavaScript notice");
});

test("newsletter form has a labelled email field and the honeypot", () => {
  const html = read("index.html");
  assert.ok(html.includes('id="newsletter-form"'));
  assert.match(html, NEWSLETTER_LABEL);
  assert.ok(html.includes('id="newsletter-email"'));
  assert.ok(html.includes('name="website"'));
  assert.ok(html.includes("novalidate"));
});

test("every described field refers to an element that exists", () => {
  for (const page of PAGES) {
    const html = read(page);
    const ids = new Set([...html.matchAll(ELEMENT_ID)].map((m) => m[1]));
    for (const [, refs] of html.matchAll(DESCRIBED_BY))
      for (const ref of refs.split(WHITESPACE))
        assert.ok(ids.has(ref), `${page} describes missing #${ref}`);
  }
});

test("pages keep to the CSP: no inline script, style or event handlers", () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const [, tag] of html.matchAll(SCRIPT_OPEN))
      assert.match(tag, LOCAL_SRC, `${page} inline script`);
    assert.ok(!STYLE_BLOCK.test(html), `${page} inline style block`);
    assert.ok(!STYLE_ATTRIBUTE.test(html), `${page} inline style attribute`);
    assert.ok(!EVENT_ATTRIBUTE.test(html), `${page} inline event handler`);
  }
});

test("forms post JSON to FastAPI with the barrels site and list, never a native submit", () => {
  const forms = read("forms.mjs");
  assert.ok(forms.includes("/api/v1/contact/messages"));
  assert.ok(forms.includes("/api/v1/subscriptions"));
  assert.ok(forms.includes('site: "barrels"'));
  assert.ok(forms.includes('list_key: "barrels"'));
  assert.ok(forms.includes("event.preventDefault()"));
  assert.ok(forms.includes('"Content-Type": "application/json"'));
  // Honeypot: a filled field is never sent.
  assert.ok(forms.includes('input[name="website"]'));
});

test("subscription status page maps the API result values", () => {
  const html = read("subscribe/status/index.html");
  assert.ok(html.includes('id="status-text"'));
  assert.ok(html.includes('content="noindex"'));
  const forms = read("forms.mjs");
  for (const result of ["confirmed", "unsubscribed", "invalid"])
    assert.ok(forms.includes(`${result}:`), `status text for ${result}`);
});

test("no third-party script is loaded by the forms or the status page", () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const [, src] of html.matchAll(SCRIPT_SRC))
      assert.ok(src.startsWith("/"), `${page} loads ${src}`);
  }
});

test("all stylesheet tokens resolve from the shared foundation", () => {
  const css = read("style.css");
  const tokens = read("tokens.css");
  for (const [, token] of css.matchAll(CSS_VARIABLE))
    assert.ok(tokens.includes(`${token}:`), `Missing ${token}`);
});

test("static modules share the reader policy and CSP permits only the required endpoints", () => {
  const policy = read("analytics-policy.js");
  assert.ok(policy.includes('"id":"barrels"'));
  assert.ok(!policy.includes('"id":"gms"'));
  const transport = read("google-analytics.js");
  assert.ok(transport.includes("dataLayer.push(arguments)"));
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  assert.ok(csp.includes("script-src 'self' https://www.googletagmanager.com"));
  assert.ok(
    csp.includes("connect-src") && csp.includes("https://api.barrels.gd")
  );
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(!csp.includes("unsafe-inline"));
});

test("CSP allows Cloudflare Turnstile for scripts, frames and connections only", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  const directive = (name) =>
    csp.split(";").find((part) => part.trim().startsWith(`${name} `)) ?? "";
  for (const name of ["script-src", "frame-src", "connect-src"])
    assert.ok(
      directive(name).includes("https://challenges.cloudflare.com"),
      `${name} allows Turnstile`
    );
  assert.ok(!directive("style-src").includes("cloudflare"));
  assert.ok(csp.includes("default-src 'none'"));
});

test("forms send a Turnstile token only when a site key is configured", () => {
  const forms = read("forms.mjs");
  assert.ok(forms.includes('from "./turnstile-config.mjs"'));
  assert.ok(forms.includes("turnstile_token"));
  assert.ok(forms.includes("challenges.cloudflare.com/turnstile/v0/api.js"));
  assert.ok(forms.includes("render=explicit"));
  // The script is loaded from forms.mjs, never from a page.
  for (const page of PAGES)
    assert.ok(!read(page).includes("challenges.cloudflare.com"), page);
});

test("the site key is written at build time and defaults to none", () => {
  const build = (key) =>
    execFileSync("node", [
      new URL("./build.mjs", import.meta.url).pathname,
      key,
    ]);
  try {
    build("0xTESTKEY");
    assert.equal(
      read("turnstile-config.mjs"),
      'export const TURNSTILE_SITE_KEY = "0xTESTKEY";\n'
    );
  } finally {
    build("");
  }
  assert.equal(
    read("turnstile-config.mjs"),
    'export const TURNSTILE_SITE_KEY = "";\n'
  );
});
