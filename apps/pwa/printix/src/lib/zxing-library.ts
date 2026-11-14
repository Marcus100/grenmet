import type { BarcodeDetectorCtor } from "@/lib/barcode-reader";

/**
 * Loads the bundled decoder on demand (it is large) and points it at the
 * WebAssembly file this app serves from /zxing (scripts/copy-wasm.mjs).
 */
export async function loadZxingLibrary(): Promise<BarcodeDetectorCtor> {
  const library = await import("barcode-detector/ponyfill");
  library.prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? `/zxing/${path}` : `${prefix}${path}`,
    },
  });
  return library.BarcodeDetector as unknown as BarcodeDetectorCtor;
}
