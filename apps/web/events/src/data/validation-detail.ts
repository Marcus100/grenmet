/** The fixed `detail` of the documented request-validation 422. */
const VALIDATION_FALLBACK = "Validation error";

/**
 * The text a caller should show for an API error body. A string `detail` is
 * used as it is, except the request-validation fallback, which is replaced by
 * the messages of its `errors` list. Any other body gives null.
 */
export function detailOfData(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const { detail } = data;
  const errors: unknown = "errors" in data ? data.errors : undefined;
  if (detail === VALIDATION_FALLBACK) {
    const messages = Array.isArray(errors)
      ? errors
          .map((item: unknown) =>
            typeof item === "object" && item !== null && "msg" in item
              ? item.msg
              : undefined
          )
          .filter((msg): msg is string => typeof msg === "string")
      : [];
    return messages.length > 0 ? messages.join("; ") : null;
  }
  return typeof detail === "string" ? detail : null;
}
