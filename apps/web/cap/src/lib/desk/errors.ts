/**
 * Turns a failed desk request into words a forecaster can act on. FastAPI
 * returns `{detail: string}` for its own refusals and `{detail: [{loc, msg}]}`
 * for request validation; both 422s are listed item by item.
 */
export interface DeskError {
  /** Each problem on its own line (schema errors, validation failures). */
  items: string[];
  /** What kind of problem, so the caller can offer the right next step. */
  kind:
    | "imported-confirm"
    | "not-allowed"
    | "schema"
    | "session"
    | "state"
    | "unavailable"
    | "validation";
  status: number | null;
  title: string;
}

const SCHEMA_PREFIX =
  "CAP XML does not conform to the official CAP 1.2 schema:";
const VALIDATION_PREFIX = "Validation failed:";

function readStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const { status } = error as { status: unknown };
    return typeof status === "number" ? status : null;
  }
  return null;
}

function readDetail(error: unknown): unknown {
  if (error && typeof error === "object" && "data" in error) {
    const { data } = error as { data: unknown };
    if (data && typeof data === "object" && "detail" in data) {
      return (data as { detail: unknown }).detail;
    }
  }
  return undefined;
}

function splitList(text: string): string[] {
  return text
    .split("; ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldProblems(detail: unknown[]): string[] {
  return detail.map((item) => {
    if (item && typeof item === "object") {
      const { loc, msg } = item as { loc?: unknown; msg?: unknown };
      const where = Array.isArray(loc)
        ? loc.filter((part) => part !== "body").join(" › ")
        : "";
      const text = typeof msg === "string" ? msg : JSON.stringify(item);
      return where ? `${where}: ${text}` : text;
    }
    return String(item);
  });
}

export function describeDeskError(error: unknown): DeskError {
  const status = readStatus(error);
  const detail = readDetail(error);
  const text = typeof detail === "string" ? detail : "";

  if (status === 401) {
    return {
      items: [],
      kind: "session",
      status,
      title: "Your desk session has ended. Sign in again, then retry.",
    };
  }
  if (status === 403) {
    return {
      items: text ? [text] : [],
      kind: "not-allowed",
      status,
      title: "You do not have permission for this action.",
    };
  }
  if (status === 422 && text.startsWith(SCHEMA_PREFIX)) {
    return {
      items: splitList(text.slice(SCHEMA_PREFIX.length)),
      kind: "schema",
      status,
      title:
        "Not published: the CAP XML does not follow the official CAP 1.2 schema. Fix the alert and try again.",
    };
  }
  if (status === 422 && text.startsWith(VALIDATION_PREFIX)) {
    return {
      items: splitList(text.slice(VALIDATION_PREFIX.length)),
      kind: "validation",
      status,
      title: "The alert did not pass the CAP checks.",
    };
  }
  if (status === 422 && Array.isArray(detail)) {
    return {
      items: fieldProblems(detail),
      kind: "validation",
      status,
      title: "Some values could not be saved.",
    };
  }
  if (status === 422) {
    return {
      items: text ? [text] : [],
      kind: "validation",
      status,
      title: "The alert could not be saved as it is.",
    };
  }
  if (status === 409 && text.includes("confirm_imported")) {
    return {
      items: [],
      kind: "imported-confirm",
      status,
      title:
        "This alert was imported. Check it against the source and tick the confirmation before publishing.",
    };
  }
  if (status === 409) {
    return {
      items: text ? [text] : [],
      kind: "state",
      status,
      title: "The alert is no longer in a state that allows this. Reload it.",
    };
  }
  if (status === 404) {
    return {
      items: [],
      kind: "state",
      status,
      title: "This alert no longer exists.",
    };
  }
  return {
    items: text ? [text] : [],
    kind: "unavailable",
    status,
    title:
      "The warning service did not answer. The action may or may not have gone through: reload the alert and check its state before trying again.",
  };
}
