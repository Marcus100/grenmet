import type { BarcodeDetectorCtor } from "./barcode-reader";

/**
 * Loads the bundled decoder on demand (it is large) and points it at the
 * WebAssembly file the app serves from /zxing. Every app that scans runs
 * `pwa-kit-copy-zxing` before dev and build to put the file there.
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
