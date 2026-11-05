"use server";

import type { CapAlertPublic } from "@barrelsgd/api-client";
import {
  type DeskActionResult,
  failedAction,
  runDeskAction,
} from "@/lib/desk/actions";
import { duplicateCapAlert } from "@/lib/desk/admin-writes";
import { describeDeskError } from "@/lib/desk/errors";
import { parseUuid } from "@/lib/desk/uuid";

/** Copies an alert into a new Draft. Needs cap.alert.create, checked here and by FastAPI. */
export async function duplicateAlertAsDraft(
  alertId: unknown
): Promise<DeskActionResult<CapAlertPublic>> {
  const id = parseUuid(alertId);
  if (!id) {
    return failedAction(
      describeDeskError({
        data: { detail: "The alert ID is not valid." },
        status: 422,
      })
    );
  }
  const result = await runDeskAction("create", (token) =>
    duplicateCapAlert(token, id)
  );
  return result;
}
