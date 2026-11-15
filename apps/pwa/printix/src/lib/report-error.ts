/** The event a future error service listens for. Its detail holds two fields only. */
export const ERROR_REPORT_EVENT = "printix:error";

/**
 * The error's class name. Read from the `name` property rather than with
 * `instanceof Error`, which misses a DOMException from another realm.
 */
function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error;
    if (typeof name === "string" && name.length > 0) {
      return name;
    }
  }
  return typeof error;
}

/**
 * Records an error that the screen turned into a fallback. This app has no
 * error service wired in yet, so the report is a window event carrying the area
 * and the error's class name, never the message, a pairing secret, a scanned
 * value or a request. Nothing is printed to the console.
 */
export function reportError(error: unknown, area: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(ERROR_REPORT_EVENT, {
      detail: { area, name: errorName(error) },
    })
  );
}
