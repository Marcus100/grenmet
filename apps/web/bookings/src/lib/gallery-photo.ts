// A gallery photograph of the business's work: the limits shown to the person
// (the API enforces the same ones, plus 8 megapixels, and has the last word) and
// how many photographs a business may show. Plain functions only, so Client
// Components and tests share them.

import { LOGO_TYPES } from "@/lib/brand-logo";

/** One gallery photograph as the Studio section and its actions pass it around. */
export interface GalleryPhotoView {
  fileId: string;
  id: string;
}

export const GALLERY_MAX_BYTES = 5 * 1024 * 1024;
export const GALLERY_MAX_LABEL = "5 MB";
export const GALLERY_ACCEPT = LOGO_TYPES.join(",");
/** `src/bookings/gallery.py` refuses a further one. */
export const GALLERY_MAX_PHOTOS = 12;

/** Why this file cannot be uploaded as a gallery photograph, or null when it can. */
export function galleryPhotoProblem(file: {
  size: number;
  type: string;
}): string | null {
  if (!LOGO_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }
  if (file.size > GALLERY_MAX_BYTES) {
    return `That image is larger than ${GALLERY_MAX_LABEL}. Save a smaller copy and try again.`;
  }
  return null;
}

/** The list with the photograph at `index` moved one place towards `by`. */
export function moved<T>(photos: readonly T[], index: number, by: -1 | 1): T[] {
  const next = [...photos];
  const target = index + by;
  const photo = next[index];
  if (photo === undefined || target < 0 || target >= next.length) {
    return next;
  }
  next.splice(index, 1);
  next.splice(target, 0, photo);
  return next;
}
