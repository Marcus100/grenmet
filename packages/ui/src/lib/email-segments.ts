/**
 * Splits text into runs so each email address can be rendered in its own
 * element. Cloudflare Email Address Obfuscation rewrites an address in server
 * HTML, and its decode script then splits the surrounding text node. When the
 * address sits inside a longer string, React hydration fails (#418). An address
 * that is the whole content of its own element decodes cleanly (#1365).
 * Import from `@barrelsgd/ui/lib/email-segments`; render with
 * `@barrelsgd/ui/components/email-text`.
 */
export interface TextSegment {
  isEmail: boolean;
  text: string;
}

const EMAIL_ADDRESS =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gu;

/** The visible text is unchanged: the segments concatenate back to `text`. */
export function splitEmailAddresses(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(EMAIL_ADDRESS)) {
    const start = match.index ?? 0;
    if (start > last) {
      segments.push({ isEmail: false, text: text.slice(last, start) });
    }
    segments.push({ isEmail: true, text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) {
    segments.push({ isEmail: false, text: text.slice(last) });
  }
  return segments;
}
