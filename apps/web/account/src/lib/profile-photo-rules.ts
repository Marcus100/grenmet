/** The API refuses anything over 5 MB (413); checking first saves the upload. */
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Formats the API accepts (415 otherwise). The bytes are read again on the server. */
export const PROFILE_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProfilePhotoType = (typeof PROFILE_PHOTO_TYPES)[number];

export const PROFILE_PHOTO_ACCEPT = PROFILE_PHOTO_TYPES.join(",");

/** The accepted type a file declares, narrowed, or null for any other type. */
export function profilePhotoType(type: string): ProfilePhotoType | null {
  switch (type) {
    case "image/jpeg":
      return "image/jpeg";
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    default:
      return null;
  }
}

/**
 * Why a chosen file cannot be uploaded, in words for the person, or null when
 * it may be sent. Only the declared type and size are checked here; the API
 * decides the real format and dimensions from the bytes.
 */
export function profilePhotoProblem(file: {
  readonly size: number;
  readonly type: string;
}): string | null {
  if (profilePhotoType(file.type) === null) {
    return "Choose a JPEG, PNG or WebP photo.";
  }
  if (file.size === 0) {
    return "That file is empty. Choose another photo.";
  }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) {
    return "That photo is larger than 5 MB. Choose a smaller one.";
  }
  return null;
}
