import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test, { before } from "node:test";
import { NOINDEX_ROBOTS } from "./build.mjs";

// Every test below reads dist/, so build it first (with no Turnstile key, the
// default state) instead of relying on a previous run having left it behind.
before(() => {
  execFileSync("node", [new URL("./build.mjs", import.meta.url).pathname, ""]);
});

const HIDDEN_PRIVACY_CARD = /<section[^>]*hidden[^>]*id="analytics-settings"/su;
const PRIVACY_DIALOG = /<section[^>]*role="dialog"/su;
const OVERCLAIM = /certified|ISO\s?\d|Microsoft Partner|Google Partner/iu;
const ELEMENT_ID = /\sid="([\w-]+)"/gu;
const WHITESPACE = /\s+/u;
const LOCAL_SRC = /src="\/[^"]+"/u;
const DESCRIBED_BY = /aria-describedby="([^"]+)"/gu;
const SCRIPT_OPEN = /<script\b([^>]*)>/giu;
const SCRIPT_SRC = /<script[^>]*src="([^"]+)"/giu;
const STYLE_BLOCK = /<style\b/u;
const STYLE_ATTRIBUTE = /\sstyle="/u;
const EVENT_ATTRIBUTE = /\son[a-z]+="/iu;
const H1_TAG = /<h1>/gu;
const CSS_VARIABLE = /var\((--[\w-]+)\)/gu;
const NEWSLETTER_LABEL = /<label for="newsletter-email">/u;
const GOOGLE_TAG_MANAGER = /googletagmanager/iu;
const CLOUDFLARE_CHALLENGES = /challenges\.cloudflare\.com/iu;
const NOT_FOUND_TITLE = /<h1>Page not found<\/h1>/u;
const COMING_SOON_LIST =
  /<h[23][^>]*id="(?:soon-products|soon-title)"[^>]*>Coming soon<\/h[23]>[\s\S]*?<\/ul>/u;
const HREF_ATTRIBUTE = /href=/u;
const BABYDOLL_NAME = /babydoll/iu;
const CONTACT_FIELD = /"(telephone|email|address)"/u;
const TITLE_TAG = /<title>([^<]+)<\/title>/u;
const TITLE_TAG_PRESENT = /<title>[^<]+<\/title>/u;
const DESCRIPTION_TAG = /<meta\s+content="([^"]+)"\s+name="description"/u;
const DESCRIPTION_TAG_LONG =
  /<meta\s+content="[^"]{40,}"\s+name="description"/u;
const VAGUE_LINK = /<a[^>]*>\s*(here|click here|read more|more)\s*<\/a>/iu;
const CARD_RULE = /\.card \{[^}]*\}/u;
const TEXT_PRIMARY_DECL = /color: var\(--brand-text-primary\)/u;
const PANEL_BG_DECL = /background: var\(--brand-surface-panel\)/u;
const CANONICAL_LINK = /<link href="([^"]+)" rel="canonical">/u;

const PAGES = [
  "index.html",
  "services/index.html",
  "products/index.html",
  "contact/index.html",
  "subscribe/status/index.html",
  // Served with status 404 by Cloudflare Pages (and Vercel) for unknown paths.
  "404.html",
];

const read = (path) =>
  readFileSync(new URL(`./dist/${path}`, import.meta.url), "utf8");

// Hosts of every absolute or protocol-relative URL in a text, parsed with
// `new URL` so a host is compared exactly instead of matched as a substring.
const URL_IN_TEXT = /(?:https?:)?\/\/[^\s"'<>()]+/gu;
const hostsIn = (text) =>
  (text.match(URL_IN_TEXT) ?? [])
    .filter((candidate) => URL.canParse(candidate, "https://base.invalid"))
    .map((candidate) => new URL(candidate, "https://base.invalid").hostname);

// Whether any URL in a text has exactly this host.
const mentionsHost = (text, host) =>
  hostsIn(text).some((found) => found === host);

// Source tokens of one CSP directive (name in lower case), e.g. connect-src -> ["https://a.example", ...].
const directiveSources = (csp, name) => {
  const part = csp
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.split(WHITESPACE)[0].toLowerCase() === name);
  return part ? part.split(WHITESPACE).slice(1) : [];
};
// Whether a CSP source list allows exactly this origin (scheme, host and port).
const allowsOrigin = (sources, origin) =>
  sources.some(
    (source) => URL.canParse(source) && new URL(source).origin === origin
  );

test("holding page ships accessible content and only local analytics wiring", () => {
  const html = read("index.html");
  assert.ok(html.includes('<html lang="en">'));
  assert.ok(html.includes("<main") && html.includes("<h1>"));
  assert.ok(html.includes('href="https://eugine.me/"'));
  assert.ok(html.includes("Built by Eugine Whint"));
  assert.ok(html.includes('src="/analytics.mjs"'));
  // Positive control: the URL parser must still find the links it should.
  assert.ok(
    mentionsHost(html, "eugine.me"),
    "URL parser finds the byline link"
  );
  assert.ok(
    !(
      mentionsHost(html, "googletagmanager.com") ||
      mentionsHost(html, "www.googletagmanager.com")
    ),
    "holding page never loads Google Tag Manager directly"
  );
  // Loose guard: no mention of the name at all, however it is written.
  assert.doesNotMatch(html, GOOGLE_TAG_MANAGER);
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

const SERVICE_CARD = /<li class="card">([\s\S]*?)<\/li>/gu;
const CARD_HEADING = /<h2>([^<]+)<\/h2>/u;
const SUITED = /<span>Suited to:<\/span>/u;
const EXPECTED_SERVICES = [
  "Web and Software",
  "Website Care",
  "Business Software (Barrels Business)",
  "Systems and Payment Integrations",
  "Digital Marketing and Design",
  "Data and Business Analysis",
  "Consulting and Digital Strategy",
  "AI and Automation",
  "Managed IT",
  "Cloud and Security",
  "Backup and Disaster Recovery",
  "Networking, Wi-Fi and CCTV",
  "Training and Workshops (Barrels Academy)",
  "Weather, Aviation and Climate Data",
  "Research and Reports",
];

test("services page lists the service catalogue, each with a Suited to line", () => {
  const html = read("services/index.html");
  const cards = [...html.matchAll(SERVICE_CARD)].map(([, body]) => body);
  assert.equal(cards.length, EXPECTED_SERVICES.length, "service cards");
  const headings = cards.map((body) => body.match(CARD_HEADING)?.[1]);
  assert.deepEqual(headings, EXPECTED_SERVICES);
  for (const body of cards)
    assert.match(
      body,
      SUITED,
      `card has a Suited to line: ${body.slice(0, 60)}`
    );
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
    for (const [, tag] of html.matchAll(SCRIPT_OPEN)) {
      // Structured data is a non-executing JSON block, so CSP does not apply to it.
      if (tag.includes('type="application/ld+json"')) continue;
      assert.match(tag, LOCAL_SRC, `${page} inline script`);
    }
    assert.ok(!STYLE_BLOCK.test(html), `${page} inline style block`);
    assert.ok(!STYLE_ATTRIBUTE.test(html), `${page} inline style attribute`);
    assert.ok(!EVENT_ATTRIBUTE.test(html), `${page} inline event handler`);
  }
});

// The CONTACT_URL template literal: `${API_ORIGIN}<path>`.
const CONTACT_URL_TEMPLATE = /const CONTACT_URL = `\$\{API_ORIGIN\}([^`]*)`;/u;
const DEPRECATED_CONTACT_PATH = "/api/v1/contact/messages";
const CONTACT_SITE_PATH = "/api/v1/contact/public/barrels/messages";

test("contact form targets the per-site barrels route, not the deprecated one", () => {
  const forms = read("forms.mjs");
  const match = forms.match(CONTACT_URL_TEMPLATE);
  assert.ok(match, "CONTACT_URL is API_ORIGIN plus a constant path");
  const path = match[1];
  assert.ok(!path.includes("${"), "contact path has no interpolated values");
  // Parse the path (never substring-match it), with a placeholder origin.
  const contact = new URL(path, "https://api.invalid");
  assert.equal(
    contact.origin,
    "https://api.invalid",
    "path stays on the API origin"
  );
  assert.equal(contact.search, "", "no query string carries visitor data");
  assert.equal(contact.hash, "", "no fragment carries visitor data");
  assert.equal(contact.pathname, CONTACT_SITE_PATH);
  assert.notEqual(contact.pathname, DEPRECATED_CONTACT_PATH);
  // Positive control: the deprecated path is still a valid URL path to parse.
  assert.equal(
    new URL(DEPRECATED_CONTACT_PATH, "https://api.invalid").pathname,
    DEPRECATED_CONTACT_PATH
  );
  // The body no longer names the site; the path does.
  assert.ok(
    !forms.includes('site: "barrels"'),
    "contact body has no site field"
  );
  // Production API origin is parsed exactly.
  const origins = [...forms.matchAll(/"(https?:\/\/[^"]+)"/gu)].map(
    ([, candidate]) => new URL(candidate)
  );
  assert.ok(
    origins.some((url) => url.origin === "https://api.barrels.gd"),
    "production API origin is present"
  );
});

test("forms post JSON to FastAPI with the barrels list, never a native submit", () => {
  const forms = read("forms.mjs");
  assert.ok(forms.includes("/api/v1/subscriptions"));
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
    allowsOrigin(
      directiveSources(csp, "connect-src"),
      "https://api.barrels.gd"
    ),
    "connect-src allows the Barrels API origin"
  );
  // GA4 measurement hits (/g/collect) go to this host; without it the homepage
  // analytics are blocked by the policy.
  assert.ok(
    allowsOrigin(
      directiveSources(csp, "connect-src"),
      "https://www.google.com"
    ),
    "connect-src allows the GA4 measurement host"
  );
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(!csp.includes("unsafe-inline"));
});

test("CSP allows the cookieless Cloudflare Web Analytics beacon the edge injects", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  assert.ok(
    allowsOrigin(
      directiveSources(csp, "script-src"),
      "https://static.cloudflareinsights.com"
    ),
    "script-src allows the beacon script"
  );
  assert.ok(
    allowsOrigin(
      directiveSources(csp, "connect-src"),
      "https://cloudflareinsights.com"
    ),
    "connect-src allows the beacon endpoint"
  );
});

test("CSP allows Cloudflare Turnstile for scripts, frames and connections only", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  for (const name of ["script-src", "frame-src", "connect-src"])
    assert.ok(
      allowsOrigin(
        directiveSources(csp, name),
        "https://challenges.cloudflare.com"
      ),
      `${name} allows Turnstile`
    );
  const styleSources = directiveSources(csp, "style-src");
  assert.ok(styleSources.length > 0, "style-src directive is present");
  assert.ok(!styleSources.some((source) => source.includes("cloudflare")));
  assert.ok(csp.includes("default-src 'none'"));
});

test("forms send a Turnstile token only when a site key is configured", () => {
  const forms = read("forms.mjs");
  assert.ok(forms.includes('from "./turnstile-config.mjs"'));
  assert.ok(forms.includes("turnstile_token"));
  const turnstileScripts = (forms.match(URL_IN_TEXT) ?? [])
    .filter((candidate) => URL.canParse(candidate))
    .map((candidate) => new URL(candidate))
    .filter((url) => url.pathname === "/turnstile/v0/api.js");
  assert.ok(turnstileScripts.length > 0, "Turnstile script URL is present");
  for (const url of turnstileScripts) {
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "challenges.cloudflare.com");
  }
  assert.ok(forms.includes("render=explicit"));
  // The script is loaded from forms.mjs, never from a page.
  for (const page of PAGES) {
    const html = read(page);
    assert.ok(!mentionsHost(html, "challenges.cloudflare.com"), page);
    assert.doesNotMatch(html, CLOUDFLARE_CHALLENGES, page);
  }
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

test("Cloudflare Pages serves the same response headers as vercel.json", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const lines = read("_headers").split("\n");
  assert.equal(lines[0], "/*");
  for (const header of config.headers[0].headers) {
    assert.ok(
      lines.includes(`  ${header.key}: ${header.value}`),
      `${header.key} is missing from _headers`
    );
  }
});

test("unknown paths get a real not-found page, not the homepage", () => {
  const html = read("404.html");
  assert.match(html, NOT_FOUND_TITLE);
  assert.ok(html.includes('href="/"'), "links back to the homepage");
  assert.ok(html.includes('content="noindex"'), "kept out of search results");
});

// Product links: parsed hosts, never substring matches.
const LIVE_PRODUCT_HOSTS = [
  "events.barrels.gd",
  "bookings.barrels.gd",
  "signal.barrels.gd",
  "elections.barrels.gd",
];
// Hosts that are not Barrels products: the apex, and the Babydoll client site
// named in "Our work" (an approved client example, not a product link).
const NON_PRODUCT_HOSTS = [
  "barrels.gd",
  "www.barrels.gd",
  "babydoll.barrels.gd",
];
const COMING_SOON = [
  "Barrels Business",
  "Barrels Shop",
  "Barrels Jobs",
  "Barrels Education",
];
test("product links on the home page and products page are exactly the four live hosts", () => {
  for (const page of ["index.html", "products/index.html"]) {
    const html = read(page);
    const found = hostsIn(html).filter((host) => host.endsWith(".barrels.gd"));
    const products = found.filter((host) => !NON_PRODUCT_HOSTS.includes(host));
    assert.deepEqual(
      [...new Set(products)].sort(),
      [...LIVE_PRODUCT_HOSTS].sort(),
      page
    );
    for (const host of LIVE_PRODUCT_HOSTS)
      assert.ok(
        html.includes(`href="https://${host}/"`),
        `${page} links ${host}`
      );
  }
});

test("coming-soon products are labelled and carry no links", () => {
  for (const page of ["index.html", "products/index.html"]) {
    const html = read(page);
    const section = html.match(COMING_SOON_LIST)?.[0];
    assert.ok(section, `${page} has a coming-soon list`);
    assert.equal(
      (section.match(/status-soon/gu) ?? []).length,
      4,
      `${page} four coming-soon items`
    );
    assert.ok(
      !HREF_ATTRIBUTE.test(section),
      `${page} coming-soon items have no link`
    );
    for (const name of COMING_SOON)
      assert.ok(
        section.includes(
          `<h${page.startsWith("products") ? 3 : 4}>${name}</h${page.startsWith("products") ? 3 : 4}>`
        ),
        `${page} lists ${name}`
      );
  }
});

test("header links to the services and products pages on every page", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.ok(html.includes('href="/services/"'), `${page} links services`);
    assert.ok(html.includes('href="/products/"'), `${page} links products`);
  }
});

test("only the home page names a client by brand (Babydoll, owner-approved)", () => {
  for (const page of PAGES) {
    const named = BABYDOLL_NAME.test(read(page));
    assert.equal(named, page === "index.html", `${page} client naming`);
  }
  assert.ok(
    mentionsHost(read("index.html"), "babydoll.barrels.gd"),
    "Babydoll links to its site"
  );
});

// Parse every JSON-LD block; a syntax error fails the test.
const JSON_LD = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu;
const jsonLd = (page) =>
  [...read(page).matchAll(JSON_LD)].map(([, body]) => JSON.parse(body));

test("structured data parses and describes the company and services", () => {
  const [home] = jsonLd("index.html");
  const graph = home["@graph"];
  const org = graph.find(
    (node) => node["@id"] === "https://barrels.gd/#organization"
  );
  assert.deepEqual([...org["@type"]].sort(), [
    "Organization",
    "ProfessionalService",
  ]);
  assert.equal(org.name, "Barrels Grenada");
  assert.equal(org.url, "https://barrels.gd/");
  assert.equal(org.areaServed.name, "Grenada");
  // Never invent contact details: none may appear in the data.
  const text = JSON.stringify(graph);
  assert.ok(!CONTACT_FIELD.test(text), "no contact or address fields");
  const [catalog] = jsonLd("services/index.html");
  assert.equal(catalog["@type"], "OfferCatalog");
  const names = catalog.itemListElement.map((offer) => offer.itemOffered.name);
  assert.deepEqual(names, [...EXPECTED_SERVICES]);
  const headings = [
    ...read("services/index.html").matchAll(/<h2>([^<]+)<\/h2>/gu),
  ]
    .map(([, name]) => name)
    .filter((name) => EXPECTED_SERVICES.includes(name));
  assert.deepEqual(
    names,
    headings,
    "structured data matches the visible service names"
  );
});

test("titles and descriptions are unique and every page sets Open Graph and Twitter tags", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of PAGES) {
    const html = read(page);
    if (html.includes('content="noindex"')) continue;
    const title = html.match(TITLE_TAG)?.[1];
    const description = html.match(DESCRIPTION_TAG)?.[1];
    assert.ok(!titles.has(title), `${page} title is unique`);
    assert.ok(!descriptions.has(description), `${page} description is unique`);
    titles.add(title);
    descriptions.add(description);
    assert.ok(
      description.length <= 170,
      `${page} description fits a search snippet`
    );
    for (const tag of [
      'property="og:title"',
      'property="og:description"',
      'property="og:url"',
      'property="og:site_name"',
      'name="twitter:card"',
      'name="twitter:title"',
      'name="twitter:description"',
    ])
      assert.ok(html.includes(tag), `${page} has ${tag}`);
    assert.ok(!html.includes("og:image"), `${page} has no invented image`);
  }
});

test("headings never skip a level, and links say where they go", () => {
  for (const page of PAGES) {
    const levels = [...read(page).matchAll(/<h([1-6])[\s>]/gu)].map(
      ([, level]) => Number(level)
    );
    for (let i = 1; i < levels.length; i++)
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `${page} heading level ${levels[i]} after ${levels[i - 1]}`
      );
    assert.doesNotMatch(read(page), VAGUE_LINK, `${page} vague link text`);
  }
});

test("every light panel sets its own dark text colour (known .package regression)", () => {
  const css = read("style.css");
  const card = css.match(CARD_RULE)?.[0];
  assert.ok(card, ".card rule exists");
  assert.match(card, TEXT_PRIMARY_DECL);
  assert.match(card, PANEL_BG_DECL);
});

// WCAG 2.x contrast. Pairs are token names from tokens.css; each rule states
// the minimum (4.5 for body-size text, 3 for large text and focus rings).
const TOKEN_VALUE = /--([\w-]+):\s*(#[0-9a-f]{6});/giu;
const srgbChannel = (value) => {
  const channel = value / 255;
  return channel <= 0.039_28
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) =>
    srgbChannel(Number.parseInt(hex.slice(index, index + 2), 16))
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test("text and focus pairs meet WCAG AA", () => {
  const tokens = Object.fromEntries(
    [...read("tokens.css").matchAll(TOKEN_VALUE)].map(([, name, value]) => [
      name,
      value,
    ])
  );
  const pairs = [
    ["page and lead text", "brand-text-inverse", "brand-text-primary", 4.5],
    [
      "eyebrow and subheading accent",
      "brand-accent",
      "brand-text-primary",
      4.5,
    ],
    [
      "notes, hints and location label",
      "brand-border",
      "brand-text-primary",
      4.5,
    ],
    ["chip text", "brand-text-inverse", "brand-text-primary", 4.5],
    ["message and error text", "brand-text-inverse", "brand-text-primary", 4.5],
    ["button label", "brand-text-primary", "brand-text-inverse", 4.5],
    ["button hover", "brand-text-primary", "brand-accent", 4.5],
    ["quiet button text", "brand-text-inverse", "brand-text-primary", 4.5],
    [
      "panel heading and body text",
      "brand-text-primary",
      "brand-surface-panel",
      4.5,
    ],
    [
      "panel description and suited-to text",
      "brand-text-secondary",
      "brand-surface-panel",
      4.5,
    ],
    ["panel link hover", "brand-text-primary", "brand-surface-panel", 4.5],
    ["panel focus ring", "brand-primary", "brand-surface-panel", 3],
    ["live status pill", "brand-text-inverse", "brand-primary", 4.5],
    [
      "coming-soon status pill",
      "brand-text-primary",
      "brand-surface-muted",
      4.5,
    ],
    ["form field text", "brand-text-primary", "brand-surface-secondary", 4.5],
    ["page focus ring", "brand-accent", "brand-text-primary", 3],
    ["field invalid border", "status-negative", "brand-surface-secondary", 3],
    ["privacy card text", "brand-text-inverse", "brand-text-primary", 4.5],
    ["privacy open button", "brand-text-primary", "brand-surface", 4.5],
  ];
  for (const [label, foreground, background, minimum] of pairs) {
    const ratio = contrast(tokens[foreground], tokens[background]);
    assert.ok(
      ratio >= minimum,
      `${label}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`
    );
  }
  // Positive control: the contrast function separates light from dark.
  assert.ok(contrast("#ffffff", "#111827") > 15);
  assert.ok(
    contrast("#cc0033", "#111827") < 4.5,
    "red text on navy is too low for body text"
  );
});

test("sitemap lists exactly the indexable pages and robots.txt points to it", () => {
  const sitemap = read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
    ([, url]) => url
  );
  assert.deepEqual(locs, [
    "https://barrels.gd/",
    "https://barrels.gd/services/",
    "https://barrels.gd/products/",
    "https://barrels.gd/contact/",
  ]);
  assert.ok(
    !sitemap.includes("subscribe"),
    "subscription status page is not listed"
  );
  assert.ok(!sitemap.includes("404"), "not-found page is not listed");
  assert.equal(
    read("robots.txt").includes("Sitemap: https://barrels.gd/sitemap.xml"),
    true
  );
});

test("every indexable page has a title, description and its own barrels.gd canonical", () => {
  for (const page of PAGES) {
    const html = read(page);
    if (html.includes('content="noindex"')) continue;
    assert.match(html, TITLE_TAG_PRESENT, `${page} title`);
    assert.match(html, DESCRIPTION_TAG_LONG, `${page} description`);
    const canonical = html.match(CANONICAL_LINK)?.[1];
    assert.ok(
      canonical?.startsWith("https://barrels.gd/"),
      `${page} canonical ${canonical}`
    );
  }
});

// Module-level patterns for the review checks below.
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/gu;
const CLASS_SELECTOR = /\.[\w-]+/gu;
const TYPE_SELECTOR = /(?:^|\s)[a-z][\w-]*/giu;
const CHIPS_LIST = /<ul class="chips">([\s\S]*?)<\/ul>/u;
const CHIP_ITEM = /<li>([^<]+)<\/li>/gu;
const PARENTHETICAL = / \(.*\)$/u;

// Specificity as classes times 10 plus type selectors (enough for these rules).
const specificity = (selector) =>
  (selector.match(CLASS_SELECTOR) ?? []).length * 10 +
  (selector.match(TYPE_SELECTOR) ?? []).length;

test("the live and coming-soon pills win the cascade over the panel paragraph rule", () => {
  const css = read("style.css");
  const rules = [...css.matchAll(CSS_RULE)].map(([, selector, body]) => ({
    selector: selector.trim(),
    body,
  }));
  const panelText = rules.find((rule) => rule.selector === ".card p");
  assert.ok(panelText, ".card p rule exists");
  assert.ok(panelText.body.includes("var(--brand-text-secondary)"));
  for (const [name, colour] of [
    [".card .status-live", "var(--brand-text-inverse)"],
    [".card .status-soon", "var(--brand-text-primary)"],
  ]) {
    const pill = rules.find((rule) => rule.selector === name);
    assert.ok(pill, `${name} rule exists`);
    assert.ok(pill.body.includes(`color: ${colour}`), `${name} sets ${colour}`);
    assert.ok(
      specificity(pill.selector) > specificity(panelText.selector),
      `${name} (${specificity(pill.selector)}) must beat .card p (${specificity(panelText.selector)})`
    );
  }
});

test("the same services in the same order on the home chips, home JSON-LD and services page", () => {
  const home = read("index.html");
  const chips = [
    ...(home.match(CHIPS_LIST)?.[1] ?? "").matchAll(CHIP_ITEM),
  ].map(([, name]) => name);
  const short = EXPECTED_SERVICES.map((name) =>
    name.replace(PARENTHETICAL, "")
  );
  assert.deepEqual(chips, short, "home chips follow the services order");
  const [homeGraph] = jsonLd("index.html");
  const org = homeGraph["@graph"].find(
    (node) => node["@id"] === "https://barrels.gd/#organization"
  );
  assert.deepEqual(
    org.makesOffer.map((offer) => offer.itemOffered.name),
    EXPECTED_SERVICES,
    "home JSON-LD follows the services order"
  );
});

test("the services page JSON-LD provider names and links the organisation on its own", () => {
  const [catalog] = jsonLd("services/index.html");
  assert.equal(catalog.provider.name, "Barrels Grenada");
  assert.equal(catalog.provider.url, "https://barrels.gd/");
});

test("noindex is found in either attribute order and any case, and only there", () => {
  for (const tag of [
    '<meta content="noindex" name="robots">',
    '<meta name="robots" content="noindex">',
    '<meta NAME="Robots" CONTENT="NoIndex, nofollow">',
    "<meta content='noindex' name='robots'>",
  ])
    assert.ok(NOINDEX_ROBOTS.test(tag), `detects ${tag}`);
  for (const tag of [
    '<meta name="robots" content="index, follow">',
    '<meta name="description" content="noindex is not a robots tag">',
  ])
    assert.ok(!NOINDEX_ROBOTS.test(tag), `ignores ${tag}`);
});

test("the CSP lets the site load its own favicon and images", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const csp = config.headers[0].headers.find(
    (header) => header.key === "Content-Security-Policy"
  ).value;
  // The favicon is an image request: img-src must allow the same origin.
  assert.ok(
    directiveSources(csp, "img-src").includes("'self'"),
    "img-src allows 'self' so /favicon.ico loads"
  );
});

test("every page links the favicon, and the built site ships it as an ICO", () => {
  for (const page of PAGES) {
    assert.ok(
      read(page).includes('<link href="/favicon.ico" rel="icon" sizes="any">'),
      `${page} links /favicon.ico`
    );
  }
  const icon = readFileSync(new URL("./dist/favicon.ico", import.meta.url));
  // ICO header: reserved 0, type 1 (icon), at least one image.
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0]);
});

test("security headers: HSTS without subdomains or preload, frame and permissions limits", () => {
  const config = JSON.parse(
    readFileSync(new URL("./vercel.json", import.meta.url), "utf8")
  );
  const headers = Object.fromEntries(
    config.headers[0].headers.map((header) => [header.key, header.value])
  );
  assert.equal(
    headers["Strict-Transport-Security"],
    "max-age=31536000",
    "HSTS is one year with no includeSubDomains and no preload"
  );
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(
    headers["Permissions-Policy"],
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  // The static host copies the same lines (checked above), so the policy
  // cannot drift between the Vercel and Cloudflare Pages outputs.
  const lines = read("_headers").split("\n");
  assert.ok(lines.includes("  Strict-Transport-Security: max-age=31536000"));
});
