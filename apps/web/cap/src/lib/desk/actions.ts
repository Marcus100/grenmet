import "server-only";

import { isAuthApiError } from "@barrelsgd/auth";
import { reportError } from "@/lib/report-error";
import { type DeskError, describeDeskError } from "./errors";
import { getDeskGate } from "./gate";
import type { DeskPermissions } from "./permissions";

/**
 * Result of a desk server action. Server actions cannot throw to the page
 * for an expected refusal, so refusals come back as data the form can show.
 */
export type DeskActionResult<T> =
  | { data: T; ok: true }
  | { error: DeskError; ok: false };

const NOT_ALLOWED: DeskError = {
  items: [],
  kind: "not-allowed",
  status: 403,
  title: "You do not have permission for this action.",
};

const SESSION_ENDED: DeskError = {
  items: [],
  kind: "session",
  status: 401,
  title: "Sign in to the warning desk again, then retry.",
};

export function failedAction(error: DeskError): {
  error: DeskError;
  ok: false;
} {
  return { error, ok: false };
}

/**
 * Runs one desk write with the signed-in forecaster's staff token. The gate is
 * checked here, in the server action, because a server action is a public POST
 * endpoint: the browser's page checks are not enough. FastAPI checks again.
 *
 * Expected refusals (401, 403, 404, 409, 422) are returned as readable errors
 * and not reported. Anything else is unexpected and goes to Sentry.
 */
export async function runDeskAction<T>(
  permission: keyof DeskPermissions,
  work: (accessToken: string) => Promise<T>
): Promise<DeskActionResult<T>> {
  const gate = await getDeskGate();
  if (gate.status === "signed-out") return failedAction(SESSION_ENDED);
  if (gate.status === "refused" || !gate.permissions[permission]) {
    return failedAction(NOT_ALLOWED);
  }
  try {
    return { data: await work(gate.accessToken), ok: true };
  } catch (error) {
    if (isAuthApiError(error) && error.status >= 400 && error.status < 500) {
      return failedAction(
        describeDeskError({
          data: { detail: error.detail },
          status: error.status,
        })
      );
    }
    reportError(error, "cap-desk-action");
    return failedAction(describeDeskError({ status: null }));
  }
}
