import type { EregisterValidationError } from "@barrelsgd/api-client";

/**
 * True for the 422 body a SYNOP that fails validation answers with
 * (save, correct or accept): `detail` carries a summary and every issue.
 * The same status also answers `{ detail: "<string>" }` for a missing reason
 * and the request validation body for a malformed request, so narrow first.
 */
export function isSynopRefusal(
  error: unknown
): error is EregisterValidationError {
  if (!error || typeof error !== "object" || !("detail" in error)) {
    return false;
  }
  const { detail } = error;
  return (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof detail.message === "string" &&
    "issues" in detail &&
    Array.isArray(detail.issues)
  );
}
