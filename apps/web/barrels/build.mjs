import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const directory = new URL("./", import.meta.url);
const foundation = readFileSync(
  new URL("../../../packages/ui/src/styles/globals.css", directory),
  "utf8"
);
const tokens = foundation.match(/:root\s*\{([\s\S]*?)\n {2}\}/)?.[1];
if (!tokens) throw new Error("Shared UI token declarations were not found");
const output = new URL("dist/", directory);
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "style.css"])
  copyFileSync(new URL(file, directory), new URL(file, output));
writeFileSync(new URL("tokens.css", output), `:root {${tokens}\n}\n`);
writeFileSync(new URL("robots.txt", output), "User-agent: *\nAllow: /\n");
