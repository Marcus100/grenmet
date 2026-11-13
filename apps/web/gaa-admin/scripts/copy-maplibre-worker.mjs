#!/usr/bin/env node
// Copy MapLibre's web worker into public/ so the browser can load it from
// /maplibre-gl-worker.mjs (see src/lib/maplibre-worker.ts).
//
// MapLibre 6 ships its worker as a separate file and finds it from
// `import.meta.url`. Inside a Next.js bundle that is not an http(s) URL, so
// MapLibre gets an empty worker address, the worker never starts and no
// GeoJSON layer (the parishes) is ever drawn. Runs from `dev`, `build` and
// the Dockerfile (the last because a Turbo cache hit skips `build`).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKER_FILE = "maplibre-gl-worker.mjs";

export function copyMapLibreWorker(appDir, publicDir = join(appDir, "public")) {
  const require = createRequire(join(appDir, "package.json"));
  const source = require.resolve(`maplibre-gl/dist/${WORKER_FILE}`);
  const target = join(publicDir, WORKER_FILE);
  mkdirSync(publicDir, { recursive: true });
  if (
    !(existsSync(target) && readFileSync(target).equals(readFileSync(source)))
  ) {
    copyFileSync(source, target);
  }
  return target;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  console.log(`maplibre worker: ${copyMapLibreWorker(appDir)}`);
}
