// Copies the barcode reader's WebAssembly file into public/zxing so the app
// serves it itself. The library's default is a public CDN, which would break
// offline use and send every gate phone to a third party.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fromApp = createRequire(resolve(app, "package.json"));
const fromDetector = createRequire(fromApp.resolve("barcode-detector"));
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
