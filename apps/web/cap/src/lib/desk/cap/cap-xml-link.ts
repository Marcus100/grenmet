/**
 * Where the CAP 1.2 XML for one alert is read: the public feed route on this
 * host (`/feeds/alerts/<identifier>.xml`), which proxies FastAPI. The identifier
 * is encoded as one path segment, so it cannot add a segment or a dot-dot.
 */
export function capXmlPath(identifier: string): string {
  return `/feeds/alerts/${encodeURIComponent(identifier)}.xml`;
}
