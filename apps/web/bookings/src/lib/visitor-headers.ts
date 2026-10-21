// The visitor address a Next server forwards to the API so rate limits key on
// the visitor, not on this server. The API honours the pair only when the
// secret matches its TRUSTED_WEB_SECRET. Server only: never import in client code.

interface HeaderReader {
  get: (name: string) => string | null;
}

/** First address of x-forwarded-for, else x-real-ip; null when unknown. */
export function visitorAddress(incoming: HeaderReader): string | null {
  const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || incoming.get("x-real-ip")?.trim() || null;
}

export function visitorHeaders(
  incoming: HeaderReader,
  secret: string | undefined
): Record<string, string> {
  const address = visitorAddress(incoming);
  if (!(secret && address)) {
    return {};
  }
  return { "X-Visitor-IP": address, "X-Visitor-Secret": secret };
}
