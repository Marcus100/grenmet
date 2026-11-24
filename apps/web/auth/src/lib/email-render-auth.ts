import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Whether the presented email render secret equals the configured one, in
 * constant time. Both sides are hashed first, so `timingSafeEqual` always gets
 * equal-length buffers and the comparison reveals neither the content nor the
 * length of the secret.
 */
export function renderSecretMatches(
  presented: string | null,
  expected: string
): boolean {
  if (presented === null) {
    return false;
  }
  return timingSafeEqual(digest(presented), digest(expected));
}
