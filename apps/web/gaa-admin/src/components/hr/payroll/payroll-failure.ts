import { hrApiErrorMessage } from "@/components/hr/api-error";

export type PayrollFailureKind =
  | "mfa"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "rate_limited"
  | "unexpected";

export interface PayrollFailure {
  kind: PayrollFailureKind;
  message: string;
}

const MFA_DETAIL =
  /two-step verification|sign in again with your authenticator/i;

/**
 * Error bodies from text responses (CSV and PDF downloads) arrive as a string,
 * so the JSON `detail` must be read from the text before the shared helper runs.
 */
function detailOf(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    typeof error.data === "string"
  ) {
    try {
      const parsed: unknown = JSON.parse(error.data);
      if (
        parsed &&
        typeof parsed === "object" &&
        "detail" in parsed &&
        typeof parsed.detail === "string"
      ) {
        return parsed.detail;
      }
    } catch {
      return error.data;
    }
  }
  return hrApiErrorMessage(error);
}

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return typeof error.status === "number" ? error.status : undefined;
  }
  return undefined;
}

/** True when the API asks for a fresh two-step verification sign-in. */
export function isMfaRequired(error: unknown): boolean {
  return statusOf(error) === 403 && MFA_DETAIL.test(detailOf(error));
}

/** Plain-language outcome for a failed payroll request. */
export function describePayrollFailure(error: unknown): PayrollFailure {
  const status = statusOf(error);
  if (isMfaRequired(error)) {
    return {
      kind: "mfa",
      message:
        "Two-step verification is needed for this. Confirm with your authenticator app or a recovery code, then try again.",
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      message: "You do not have permission for this action.",
    };
  }
  if (status === 404) {
    return {
      kind: "not_found",
      message: "This was not found, or you do not have payroll access to it.",
    };
  }
  if (status === 409) {
    return { kind: "conflict", message: detailOf(error) };
  }
  if (status === 400 || status === 422) {
    return { kind: "invalid", message: detailOf(error) };
  }
  if (status === 429) {
    return {
      kind: "rate_limited",
      message: "Too many attempts. Wait a minute and try again.",
    };
  }
  return {
    kind: "unexpected",
    message: "Something went wrong. Try again.",
  };
}
