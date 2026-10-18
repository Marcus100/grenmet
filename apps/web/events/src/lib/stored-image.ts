/** Same-origin path for a stored organiser or listing image; see `app/files`. */
export function storedImageUrl(fileId: string): string {
  return `/files/${fileId}`;
}

/** Limits shown to organisers; the API enforces the same ones. */
export const IMAGE_RULES = {
  "listing-image": { maxBytes: 5 * 1024 * 1024, label: "5 MB" },
  "organiser-logo": { maxBytes: 2 * 1024 * 1024, label: "2 MB" },
} as const;

export const IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
