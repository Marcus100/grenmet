/**
 * The offline list's barcode hashes, made on the phone exactly as the server
 * makes them (`offline_barcode_hash` in apps/api/fastapi/src/printix): HMAC
 * SHA-256 of the cleaned value, keyed with the list's `hash_key`, hex, cut to
 * 32 characters. Web Crypto needs a secure (https) page.
 */
export const OFFLINE_HASH_HEX_LENGTH = 32;

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/** A hasher for one list's key; the key is imported once and reused. */
export function createBarcodeHasher(
  key: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle
): (value: string) => Promise<string> {
  const imported = subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return async (value) => {
    const signature = await subtle.sign(
      "HMAC",
      await imported,
      encoder.encode(value)
    );
    return hex(signature).slice(0, OFFLINE_HASH_HEX_LENGTH);
  };
}

/**
 * A short fingerprint of the pairing secret, so data saved for one pairing is
 * never used or sent by another. Never the secret itself.
 */
export async function pairingTag(
  secret: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<string> {
  const digest = await subtle.digest("SHA-256", encoder.encode(secret));
  return hex(digest).slice(0, 16);
}
