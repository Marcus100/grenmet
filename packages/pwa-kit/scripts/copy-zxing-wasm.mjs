#!/usr/bin/env node
// Copies the barcode reader's WebAssembly file into the calling app's
// public/zxing, so the app serves it itself. The library's default is a public
// CDN, which would break offline use and send every phone to a third party.
// Run from the app folder: `pwa-kit-copy-zxing && next build`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const kit = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = process.cwd();
const fromKit = createRequire(resolve(kit, "package.json"));
const fromDetector = createRequire(fromKit.resolve("barcode-detector"));
// Walk up from the library's entry file to the folder that holds the file.
const wasm = "dist/reader/zxing_reader.wasm";
let zxingRoot = dirname(fromDetector.resolve("zxing-wasm"));
while (
  !existsSync(resolve(zxingRoot, wasm)) &&
  dirname(zxingRoot) !== zxingRoot
) {
  zxingRoot = dirname(zxingRoot);
}
const source = resolve(zxingRoot, wasm);
if (!existsSync(source)) {
  throw new Error(`zxing-wasm reader file not found at ${source}`);
}
const target = resolve(app, "public/zxing");
mkdirSync(target, { recursive: true });
copyFileSync(source, resolve(target, "zxing_reader.wasm"));
console.log("Copied zxing_reader.wasm to public/zxing/");
