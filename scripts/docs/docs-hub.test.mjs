import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../apps/web/docs/", import.meta.url));
const fictionalApi = /Protocol API|api\.protocol\.chat|@example\/protocol/i;
const hurricaneRoute = /hurricane|pre-season|warning-issued|appendix/;
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const files = readdirSync(`${root}src/content`, { recursive: true }).filter(
  (file) => file.endsWith(".mdx")
);
const routes = new Set(
  files.map((file) => (file === "index.mdx" ? "/" : `/${file.slice(0, -4)}`))
);

test("every docs navigation destination has content", () => {
  const navigation = read("src/components/Navigation.tsx");
  for (const match of navigation.matchAll(/href: "([^"]+)"/g)) {
    assert.ok(routes.has(match[1]), `Missing content for ${match[1]}`);
  }
});

test("the homepage is a document catalogue with separate hurricane content", () => {
  const home = read("src/content/index.mdx");
  assert.ok(home.includes("<Guides catalogue />"));
  assert.ok(!home.includes("## Departments covered"));
  const hurricane = read("src/content/hurricane-plan.mdx");
  assert.ok(hurricane.includes("## Departments covered"));
  assert.ok(hurricane.includes("<Resources />"));
  assert.ok(routes.has("/hurricane-plan"));
  assert.ok(routes.has("/quickstart"));
  for (const file of [
    "src/components/Guides.tsx",
    "src/components/Header.tsx",
    "src/components/Footer.tsx",
  ]) {
    for (const match of read(file).matchAll(/href[:=]\s*"(\/[^"#]*)"/g)) {
      assert.ok(routes.has(match[1]), `${file}: unresolved ${match[1]}`);
    }
  }
});

test("all staff guides are discoverable in navigation and generated search", () => {
  const navigation = read("src/components/Navigation.tsx");
  const search = JSON.parse(read("src/data/sections.json"));
  for (const slug of [
    "quickstart",
    "authentication",
    "errors",
    "sdks",
    "webhooks",
    "pagination",
    "messages",
    "conversations",
    "contacts",
    "groups",
    "attachments",
  ]) {
    assert.ok(
      navigation.includes(`href: "/${slug}"`),
      `${slug} missing from navigation`
    );
    assert.ok(search[`/${slug}`]?.pageTitle, `${slug} missing from search`);
    assert.ok(
      search[`/${slug}`].sections.length,
      `${slug} has no searchable sections`
    );
    assert.ok(
      read(`src/content/${slug}.mdx`).includes(
        `# ${search[`/${slug}`].pageTitle}`
      )
    );
  }
});

test("docs contain no fictional API instructions or broken local page links", () => {
  for (const file of files) {
    const content = read(`src/content/${file}`);
    assert.doesNotMatch(content, fictionalApi, file);
    for (const match of content.matchAll(/\]\((\/[^)#]*)(?:#[^)]*)?\)/g)) {
      assert.ok(routes.has(match[1]), `${file}: unresolved ${match[1]}`);
    }
  }
});

test("staff guide and hurricane plan navigation stay separate", () => {
  const source = read("src/components/Navigation.tsx");
  const block = (name) => {
    const start = source.indexOf(`export const ${name}: NavGroup[] = [`);
    assert.ok(start >= 0, `${name} not found`);
    return source.slice(start, source.indexOf("\n];", start));
  };
  const hrefs = (text) =>
    new Set([...text.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]));
  const staff = hrefs(block("staffNavigation"));
  const hurricane = hrefs(block("hurricaneNavigation"));

  assert.ok(staff.has("/quickstart"));
  assert.ok(hurricane.has("/hurricane-plan"));
  for (const href of staff) {
    assert.ok(!hurricane.has(href), `${href} is in both sections`);
    assert.doesNotMatch(href, hurricaneRoute);
  }
});
