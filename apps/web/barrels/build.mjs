import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { argv } from "node:process";

const directory = new URL("./", import.meta.url);
const foundation = readFileSync(
  new URL("../../../packages/ui/src/styles/globals.css", directory),
  "utf8"
);
const tokens = foundation.match(/:root\s*\{([\s\S]*?)\n {2}\}/)?.[1];
if (!tokens) throw new Error("Shared UI token declarations were not found");
const output = new URL("dist/", directory);
mkdirSync(output, { recursive: true });

// Pages are source HTML. Shared partials are included at build time so the
// header, footer and privacy card are written once.
const PAGES = [
  "index.html",
  "services/index.html",
  "contact/index.html",
  "subscribe/status/index.html",
];
const partials = Object.fromEntries(
  ["site-header", "site-footer", "privacy"].map((name) => [
    name,
    readFileSync(new URL(`partials/${name}.html`, directory), "utf8").trimEnd(),
  ])
);
for (const page of PAGES) {
  const html = readFileSync(new URL(page, directory), "utf8").replace(
    /<!-- @include ([\w-]+) -->/g,
    (_, name) => {
      if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
      return partials[name];
    }
  );
  const target = new URL(page, output);
  mkdirSync(new URL("./", target), { recursive: true });
  writeFileSync(target, html);
}
// Turnstile site key (public), the first argument: vercel.json passes
// $NEXT_PUBLIC_TURNSTILE_SITE_KEY from the Vercel project. Empty or absent
// builds a site with no widget and no token.
const siteKey = (argv[2] ?? "").trim();
writeFileSync(
  new URL("turnstile-config.mjs", output),
  `export const TURNSTILE_SITE_KEY = ${JSON.stringify(siteKey)};\n`
);
for (const file of ["style.css", "analytics.mjs", "forms.mjs"])
  copyFileSync(new URL(file, directory), new URL(file, output));

// Reuse the public apps' consent policy and Google transport without a framework.
const library = new URL("../../../packages/ui/src/lib/", directory);
const catalogue = JSON.parse(
  readFileSync(new URL("service-catalogue.json", library), "utf8")
);
catalogue.services = catalogue.services.filter(
  (service) => service.id === "barrels"
);
for (const module of ["analytics-policy", "google-analytics"]) {
  const source = readFileSync(new URL(`${module}.ts`, library), "utf8").replace(
    'import catalogue from "./service-catalogue.json";',
    `const catalogue = ${JSON.stringify(catalogue)};`
  );
  writeFileSync(new URL(`${module}.js`, output), stripTypeScriptTypes(source));
}
writeFileSync(new URL("tokens.css", output), `:root {${tokens}\n}\n`);
writeFileSync(new URL("robots.txt", output), "User-agent: *\nAllow: /\n");
