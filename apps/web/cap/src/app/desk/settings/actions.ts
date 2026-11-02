"use server";

import {
  type CapSettingsPublic,
  capSettingsUpdateSchema,
} from "@barrelsgd/api-client";
import {
  type DeskActionResult,
  failedAction,
  runDeskAction,
} from "@/lib/desk/actions";
import { patchCapSettings } from "@/lib/desk/admin-writes";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";

/**
 * Saves the CAP sender settings. The browser sends untrusted input, so it is
 * parsed with the generated schema before anything reaches FastAPI. FastAPI
 * still checks `cap.settings.manage`.
 */
export async function saveCapSettings(
  input: unknown
): Promise<DeskActionResult<CapSettingsPublic>> {
  const parsed = capSettingsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return failedAction(validationError(parsed.error.issues));
  }
  const result = await runDeskAction("settingsManage", (accessToken) =>
    patchCapSettings(accessToken, parsed.data)
  );
  return result;
}

function validationError(
  issues: readonly { message: string; path: PropertyKey[] }[]
): DeskError {
  return describeDeskError({
    data: {
      detail: issues.map((issue) => {
        const where = issue.path.map(String).join(" › ");
        return where ? `${where}: ${issue.message}` : issue.message;
      }),
    },
    status: 422,
  });
}
