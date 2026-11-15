import { isPairingSecretShape } from "@/lib/pairing";
import { reportError } from "@/lib/report-error";

/**
 * The only storage key this app uses. It names the app, never the secret, so a
 * key listing or a log of keys reveals nothing.
 */
export const PAIRING_STORAGE_KEY = "printix-scanner.pairing";

/** The part of the Web Storage API the pairing needs; tests pass a Map-backed fake. */
export interface PairingStorage {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

/** The phone's own storage for this origin, or null where the browser blocks it. */
export function browserStorage(): PairingStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storedSecret(parsed: unknown): string | null {
  if (typeof parsed !== "object" || parsed === null || !("secret" in parsed)) {
    return null;
  }
  const { secret } = parsed;
  return typeof secret === "string" && isPairingSecretShape(secret)
    ? secret
    : null;
}

export function loadPairingSecret(
  storage: PairingStorage | null
): string | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(PAIRING_STORAGE_KEY);
    return raw ? storedSecret(JSON.parse(raw)) : null;
  } catch (error) {
    reportError(error, "pairing-storage");
    return null;
  }
}

/** Returns false when the phone will not keep the pairing (storage blocked or full). */
export function savePairingSecret(
  storage: PairingStorage | null,
  secret: string
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(
      PAIRING_STORAGE_KEY,
      JSON.stringify({ secret, savedAt: new Date().toISOString() })
    );
    return true;
  } catch (error) {
    reportError(error, "pairing-storage");
    return false;
  }
}

export function clearPairingSecret(storage: PairingStorage | null): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(PAIRING_STORAGE_KEY);
  } catch (error) {
    reportError(error, "pairing-storage");
  }
}
