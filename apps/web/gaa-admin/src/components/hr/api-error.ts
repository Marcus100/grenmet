/** Keep the API's validation reason visible instead of showing only HTTP 400. */
export function hrApiErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const data = "data" in error ? error.data : undefined;
    let detail: unknown;
    if (data && typeof data === "object" && "detail" in data)
      detail = data.detail;
    else if ("detail" in error) detail = error.detail;
    const envelope = data && typeof data === "object" ? data : error;
    const errors =
      "errors" in envelope && Array.isArray(envelope.errors)
        ? envelope.errors
        : detail;
    if (Array.isArray(errors)) {
      const messages = errors.flatMap((item: unknown) => {
        if (
          !(
            item &&
            typeof item === "object" &&
            "msg" in item &&
            typeof item.msg === "string"
          )
        )
          return [];
        const field =
          "loc" in item && Array.isArray(item.loc)
            ? item.loc
                .filter(
                  (part: unknown) => typeof part === "string" && part !== "body"
                )
                .join(" ")
                .replaceAll("_", " ")
            : "";
        return [`${field ? `${field}: ` : ""}${item.msg}`];
      });
      if (messages.length) return messages.join("; ");
    }
    if (typeof detail === "string") return detail;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}
