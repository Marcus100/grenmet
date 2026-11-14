/**
 * What the camera read, tidied for display. This week the scanner only shows
 * the value so we can learn what a Printix barcode holds; nothing is sent
 * anywhere.
 */
const MAX_LENGTH = 200;
const REPEAT_WINDOW_MS = 2500;

const FORMAT_LABELS: Record<string, string> = {
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  codabar: "Codabar",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  itf: "Interleaved 2 of 5",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  qr_code: "QR code",
};

/** The value with invisible characters removed, or null when nothing is left. */
export function cleanScan(raw: string): string | null {
  const text = Array.from(raw)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
  if (!text || text.length > MAX_LENGTH) {
    return null;
  }
  return text;
}

/** A name a person can read back to the printer, such as "Code 128". */
export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format.replaceAll("_", " ");
}

export interface LastScan {
  readonly at: number;
  readonly value: string;
}

/**
 * The camera sees the same ticket many times a second. Report a value again
 * only after it has been out of view for a moment.
 */
export function isRepeat(
  last: LastScan | null,
  value: string,
  now: number
): boolean {
  return (
    last !== null && last.value === value && now - last.at < REPEAT_WINDOW_MS
  );
}
