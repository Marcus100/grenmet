// The visitor address a Next server forwards to the API so rate limits key on
// the visitor, not on this server. The API honours the pair only when the
// secret matches its TRUSTED_WEB_SECRET. Server only: never import in client code.

import { isIP } from "node:net";

interface HeaderReader {
  get: (name: string) => string | null;
}

/**
 * The visitor address from x-forwarded-for, counted from the right: each proxy
 * in front of this server appends the peer it saw, so with `hops` trusted
 * proxies the visitor is `hops` entries from the end. Entries to the left can
 * be forged by the visitor and are ignored. null when absent or not an IP.
 * x-real-ip is deliberately not consulted: nothing here vouches for it.
 */
export function visitorAddress(
  incoming: HeaderReader,
  hops = 1
): string | null {
  const entries = incoming
    .get("x-forwarded-for")
    ?.split(",")
    .map((entry) => entry.trim());
  const picked = entries?.at(-hops);
  return picked && isIP(picked) ? picked : null;
}

export function visitorHeaders(
  incoming: HeaderReader,
  secret: string | undefined,
  hops = 1
): Record<string, string> {
  const address = visitorAddress(incoming, hops);
  if (!(secret && address)) {
    return {};
  }
  return { "X-Visitor-IP": address, "X-Visitor-Secret": secret };
}
