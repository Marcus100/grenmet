import QRCode from "qrcode";

/**
 * The pairing link a gate phone scans: `https://<this origin>/#pair=<secret>`
 * (see src/lib/pairing.ts). The secret stays in the fragment.
 */
export function pairingLink(origin: string, secret: string): string {
  return `${origin}/#pair=${secret}`;
}

export interface QrMatrix {
  /** One SVG path drawing every dark module, in module units. */
  readonly path: string;
  readonly size: number;
}

/**
 * The QR code's dark modules as one SVG path. React draws it inline, so no
 * markup is injected and no image is loaded (the page's CSP needs nothing new).
 */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const parts: string[] = [];
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) {
        parts.push(`M${x} ${y}h1v1h-1z`);
      }
    }
  }
  return { path: parts.join(""), size: modules.size };
}
