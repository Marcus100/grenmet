import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const directory = new URL("./", import.meta.url);
const foundation = readFileSync(
  new URL("../../../packages/ui/src/styles/globals.css", directory),
  "utf8"
);
const tokens = foundation.match(/:root\s*\{([\s\S]*?)\n {2}\}/)?.[1];
if (!tokens) throw new Error("Shared UI token declarations were not found");
const output = new URL("dist/", directory);
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "style.css", "analytics.mjs"])
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
