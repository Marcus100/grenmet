import QRCode from "qrcode";

export interface QrMatrix {
  /** One SVG path drawing every dark module, in module units. */
  readonly path: string;
  readonly size: number;
}

/** QR modules as a single SVG path, so tickets render without injected HTML. */
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
