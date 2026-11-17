import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createBarcodeHasher,
  OFFLINE_HASH_HEX_LENGTH,
  pairingTag,
} from "@/lib/offline-hash";
import { HASH_KEY, OFFLINE_LIST, SECRET } from "@/test/fixtures";

describe("createBarcodeHasher", () => {
  it("makes the server's hash: HMAC SHA-256 hex, cut to 32 characters", async () => {
    const hash = createBarcodeHasher(HASH_KEY);
    const expected = createHmac("sha256", HASH_KEY)
      .update("PX-0000000101")
      .digest("hex")
      .slice(0, OFFLINE_HASH_HEX_LENGTH);
    expect(await hash("PX-0000000101")).toBe(expected);
    expect(await hash("PX-0000000101")).toBe(
      OFFLINE_LIST.tickets[0]?.barcode_hash
    );
  });

  it("gives different hashes for different keys", async () => {
    const one = await createBarcodeHasher(HASH_KEY)("PX-0000000101");
    const two = await createBarcodeHasher(`${HASH_KEY}0`)("PX-0000000101");
    expect(one).not.toBe(two);
  });
});

describe("pairingTag", () => {
  it("is a short fingerprint that never contains the secret", async () => {
    const tag = await pairingTag(SECRET);
    expect(tag).toMatch(HEX_16);
    expect(tag).not.toContain(SECRET.slice(0, 8));
    expect(await pairingTag(SECRET)).toBe(tag);
    expect(await pairingTag(`${SECRET}x`)).not.toBe(tag);
  });
});

const HEX_16 = /^[0-9a-f]{16}$/u;
