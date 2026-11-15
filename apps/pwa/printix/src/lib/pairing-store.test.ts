// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPairingSecret,
  loadPairingSecret,
  PAIRING_STORAGE_KEY,
  type PairingStorage,
  savePairingSecret,
} from "@/lib/pairing-store";
import { ERROR_REPORT_EVENT } from "@/lib/report-error";
import { SECRET } from "@/test/fixtures";

function memoryStorage(): PairingStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** Collects the error reports the storage code makes. */
function captureReports() {
  const reports: unknown[] = [];
  const listener = (event: Event) => {
    reports.push((event as CustomEvent).detail);
  };
  window.addEventListener(ERROR_REPORT_EVENT, listener);
  return {
    reports,
    stop: () => window.removeEventListener(ERROR_REPORT_EVENT, listener),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pairing storage", () => {
  it("keeps the secret under the app's own key and nothing else", () => {
    const storage = memoryStorage();
    expect(savePairingSecret(storage, SECRET)).toBe(true);
    expect([...storage.map.keys()]).toEqual([PAIRING_STORAGE_KEY]);
    expect(PAIRING_STORAGE_KEY).not.toContain(SECRET);
    expect(loadPairingSecret(storage)).toBe(SECRET);
  });

  it("forgets the pairing when cleared", () => {
    const storage = memoryStorage();
    savePairingSecret(storage, SECRET);
    clearPairingSecret(storage);
    expect(loadPairingSecret(storage)).toBeNull();
  });

  it("returns nothing for a stored value of the wrong shape", () => {
    const storage = memoryStorage();
    storage.setItem(PAIRING_STORAGE_KEY, JSON.stringify({ secret: "short" }));
    expect(loadPairingSecret(storage)).toBeNull();
    storage.setItem(PAIRING_STORAGE_KEY, JSON.stringify({ other: SECRET }));
    expect(loadPairingSecret(storage)).toBeNull();
  });

  it("treats corrupt stored data as no pairing, and reports no value from it", () => {
    const log = captureReports();
    const storage = memoryStorage();
    storage.setItem(PAIRING_STORAGE_KEY, `{"secret": "${SECRET}"`);
    expect(loadPairingSecret(storage)).toBeNull();
    log.stop();
    expect(log.reports).toEqual([
      { area: "pairing-storage", name: "SyntaxError" },
    ]);
    expect(JSON.stringify(log.reports)).not.toContain(SECRET);
  });

  it("reports a blocked storage without its value and says the pairing was not kept", () => {
    const log = captureReports();
    const storage: PairingStorage = {
      getItem: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(savePairingSecret(storage, SECRET)).toBe(false);
    log.stop();
    expect(log.reports).toEqual([
      { area: "pairing-storage", name: "QuotaExceededError" },
    ]);
    expect(JSON.stringify(log.reports)).not.toContain(SECRET);
  });

  it("does nothing when the browser gives no storage at all", () => {
    expect(loadPairingSecret(null)).toBeNull();
    expect(savePairingSecret(null, SECRET)).toBe(false);
    expect(() => clearPairingSecret(null)).not.toThrow();
  });
});
