import { jsonLdText } from "../lib/seo";

/**
 * Structured data for search engines, rendered as a JSON-LD script. Server
 * Component safe: no client state, no browser APIs.
 */
export function JsonLd({ data }: Readonly<{ data: Record<string, unknown> }>) {
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLdText escapes <, >, & and line separators, so the payload cannot break out of the script tag.
      dangerouslySetInnerHTML={{ __html: jsonLdText(data) }}
      type="application/ld+json"
    />
  );
}
