import { describe, expect, it, vi } from "vitest";
import {
  type BarcodeDetectorCtor,
  createBarcodeReader,
  TICKET_FORMATS,
} from "@/lib/barcode-reader";

function fakeDetector(
  supported: readonly string[] | Error,
  value: string
): BarcodeDetectorCtor {
  return class {
    static getSupportedFormats(): Promise<readonly string[]> {
      return supported instanceof Error
        ? Promise.reject(supported)
        : Promise.resolve(supported);
    }
    readonly rawValue = value;
    detect() {
      return Promise.resolve([{ format: "code_128", rawValue: this.rawValue }]);
    }
  };
}

const video = {} as HTMLVideoElement;

describe("createBarcodeReader", () => {
  it("uses the browser when it reads every ticket format", async () => {
    const loadLibrary = vi.fn();
    const reader = await createBarcodeReader({
      browser: fakeDetector(TICKET_FORMATS, "from-browser"),
      loadLibrary,
    });
    expect(reader.source).toBe("browser");
    expect(loadLibrary).not.toHaveBeenCalled();
    expect((await reader.detect(video))[0]?.rawValue).toBe("from-browser");
  });

  it("uses the library when the browser has no decoder", async () => {
    const reader = await createBarcodeReader({
      browser: null,
      loadLibrary: () => Promise.resolve(fakeDetector([], "from-library")),
    });
    expect(reader.source).toBe("library");
    expect((await reader.detect(video))[0]?.rawValue).toBe("from-library");
  });

  it("uses the library when the browser reads only some formats", async () => {
    const reader = await createBarcodeReader({
      browser: fakeDetector(["qr_code"], "from-browser"),
      loadLibrary: () => Promise.resolve(fakeDetector([], "from-library")),
    });
    expect(reader.source).toBe("library");
  });

  it("uses the library when the browser cannot list its formats", async () => {
    const reader = await createBarcodeReader({
      browser: fakeDetector(new Error("not allowed"), "from-browser"),
      loadLibrary: () => Promise.resolve(fakeDetector([], "from-library")),
    });
    expect(reader.source).toBe("library");
  });
});
