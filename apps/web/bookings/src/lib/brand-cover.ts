// The business cover photo: the limits shown to the person (the API enforces the
// same ones, plus 8 megapixels, and has the last word). Plain functions only.

import { LOGO_TYPES } from "@/lib/brand-logo";

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MAX_LABEL = "5 MB";
export const COVER_ACCEPT = LOGO_TYPES.join(",");

/** Why this file cannot be uploaded as a cover photo, or null when it can. */
export function coverProblem(file: {
  size: number;
  type: string;
}): string | null {
  if (!LOGO_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }
  if (file.size > COVER_MAX_BYTES) {
    return `That image is larger than ${COVER_MAX_LABEL}. Save a smaller copy and try again.`;
  }
  return null;
}
