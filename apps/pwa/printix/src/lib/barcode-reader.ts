/**
 * Picks how barcodes are decoded. Android Chrome has a built-in
 * `BarcodeDetector`; iPhone Safari has none, so there the bundled library
 * (zxing, WebAssembly) does the work behind the same interface.
 */
export const TICKET_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "qr_code",
] as const;

export interface DetectedBarcode {
  readonly format: string;
  readonly rawValue: string;
}

export interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

export interface BarcodeDetectorCtor {
  getSupportedFormats?: () => Promise<readonly string[]>;
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

export interface BarcodeReader {
  readonly detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
  /** Which decoder is in use; shown on screen so a tester can report it. */
  readonly source: "browser" | "library";
}

async function browserReadsEverything(
  ctor: BarcodeDetectorCtor
): Promise<boolean> {
  try {
    const supported = new Set(await ctor.getSupportedFormats?.());
    return TICKET_FORMATS.every((format) => supported.has(format));
  } catch {
    return false;
  }
}

export function browserDetector(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * The browser's own decoder when it reads every ticket format, otherwise the
 * library. A browser that reads only some formats is not trusted: a ticket it
 * cannot read would look like a bad ticket.
 */
export async function createBarcodeReader(options: {
  browser: BarcodeDetectorCtor | null;
  loadLibrary: () => Promise<BarcodeDetectorCtor>;
}): Promise<BarcodeReader> {
  const formats = [...TICKET_FORMATS];
  if (options.browser && (await browserReadsEverything(options.browser))) {
    const detector = new options.browser({ formats });
    return { source: "browser", detect: (video) => detector.detect(video) };
  }
  const Library = await options.loadLibrary();
  const detector = new Library({ formats });
  return { source: "library", detect: (video) => detector.detect(video) };
}
