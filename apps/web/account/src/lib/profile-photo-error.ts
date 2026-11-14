/** Shown when the API gave no readable reason. */
const FALLBACK = "The photo could not be saved. Try again.";

/** Statuses whose `detail` is written for the person (size, format, dimensions, storage). */
const SHOWN_STATUSES = new Set([413, 415, 422, 503]);

/**
 * The reason the API gave for a refused photo, for the person to read.
 * The generated client throws a ResponseError with `status` and the parsed
 * body in `data`; only a plain string `detail` is shown, never a list or an
 * object (those are validation internals).
 */
export function profilePhotoErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) return FALLBACK;
  const status: unknown = "status" in error ? error.status : undefined;
  if (status === 401 || status === 403) {
    return "Sign in again to change your photo.";
  }
  if (typeof status !== "number" || !SHOWN_STATUSES.has(status)) {
    return FALLBACK;
  }
  const data: unknown = "data" in error ? error.data : undefined;
  if (typeof data === "object" && data !== null && "detail" in data) {
    const { detail } = data;
    if (typeof detail === "string" && detail.trim() !== "") return detail;
  }
  return FALLBACK;
}
