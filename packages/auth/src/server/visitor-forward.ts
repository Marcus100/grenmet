// Pure helper (no server-only import) so it can be unit tested.
import { isIP } from "node:net";

/**
 * The visitor address from x-forwarded-for, counted from the right: each proxy
 * in front of this host appends the peer it saw, so `hops` entries from the end
 * is the visitor. Entries further left are visitor-controlled and never read.
 */
export function visitorAddressFromForwardedFor(
  forwardedFor: string | null,
  hops: number
): string | null {
  const entries = forwardedFor?.split(",").map((entry) => entry.trim()) ?? [];
  const picked = entries.at(-Math.max(hops, 1));
  return picked && isIP(picked) ? picked : null;
}
