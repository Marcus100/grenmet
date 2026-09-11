import { mkdirSync, readFileSync } from "node:fs";

// Runs on the host before mounting; only creates missing directories, never
// removes or changes ownership of existing host dependencies or build output.
const paths = readFileSync(
  new URL("./dependency-volumes.txt", import.meta.url),
  "utf8"
)
  .trim()
  .split("\n");
for (const relative of paths) {
  mkdirSync(new URL(`../${relative}/`, import.meta.url), { recursive: true });
}
