import QRCode from "qrcode";

const TRAILING_SLASHES = /\/+$/;

/**
 * What an area's QR label encodes: a link into the janitor app when its origin
 * is configured, otherwise the bare area code (the app can still look it up).
 */
export function qrPayload(code: string, appUrl?: string): string {
  if (!appUrl) return code;
  return `${appUrl.replace(TRAILING_SLASHES, "")}/a/${encodeURIComponent(code)}`;
}

export interface QrMatrix {
  /** One SVG path drawing every dark module, in module units. */
  path: string;
  size: number;
}

/** QR modules as a single SVG path, so labels render without injected HTML. */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { path: parts.join(""), size: modules.size };
}
