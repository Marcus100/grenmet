// The business logo: the limits shown to the person (the API enforces the same
// ones and has the last word) and the same-origin address a stored logo is shown
// from. Plain functions only, so Client Components and tests can use them.

/** Limits shown to the person; `storage/uploads.py` enforces the same. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_LABEL = "2 MB";
export const LOGO_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const LOGO_ACCEPT = LOGO_TYPES.join(",");

const FILE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SVG = /\.svg$/iu;

/** A stored file id from the API, or false for anything else. */
export function isLogoFileId(value: string): boolean {
  return FILE_ID.test(value);
}

/** Same-origin path for a stored logo (`app/files/[id]` proxies the API redirect). */
export function logoSrc(fileId: string): string {
  return `/files/${fileId}`;
}

/** Why this file cannot be uploaded as a logo, or null when it can. */
export function logoProblem(file: {
  name?: string;
  size: number;
  type: string;
}): string | null {
  if (!LOGO_TYPES.includes(file.type)) {
    if (file.type === "image/svg+xml" || SVG.test(file.name ?? "")) {
      return "SVG files cannot be used. Export the logo as a PNG with a transparent background, then upload that.";
    }
    return "Choose a JPEG, PNG or WebP image.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return `That image is larger than ${LOGO_MAX_LABEL}. Save a smaller copy and try again.`;
  }
  return null;
}
