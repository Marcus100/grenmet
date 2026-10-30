import { hrApiErrorMessage } from "../hr/api-error";

export interface SuperuserActionFailure {
  message: string;
  /** True when the superuser must enrol an authenticator first. */
  mfaRequired: boolean;
  /** True for failures we did not expect; the caller reports these. */
  unexpected: boolean;
}

const MFA_CODE = "superuser_mfa_required";
const TRAILING_DOT = /\.$/u;

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return typeof error.status === "number" ? error.status : undefined;
  }
  return undefined;
}

function expected(
  message: string,
  mfaRequired = false
): SuperuserActionFailure {
  return { mfaRequired, message, unexpected: false };
}

/** Plain-language outcome for a failed superuser admin action. */
export function describeSuperuserFailure(
  error: unknown
): SuperuserActionFailure {
  const status = statusOf(error);
  const detail = hrApiErrorMessage(error);
  if (status === 403 && detail.includes(MFA_CODE)) {
    return expected(
      "Set up two-step verification (an authenticator app) in your account security, then sign in with it. Superuser powers need it.",
      true
    );
  }
  if (status === 403) return expected("Only a superuser can do this.");
  if (status === 404) {
    return expected("This account no longer exists. Refresh the list.");
  }
  if (status === 409) {
    return expected(
      `${detail.replace(TRAILING_DOT, "")}. Nothing was changed.`
    );
  }
  if (status === 429) {
    return expected("Too many attempts. Wait a minute and try again.");
  }
  return {
    mfaRequired: false,
    message: "Something went wrong. Try again.",
    unexpected: true,
  };
}
