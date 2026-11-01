"use server";

import {
  type CapPredefinedAreaPublic,
  capPredefinedAreaCreateSchema,
} from "@barrelsgd/api-client";
import {
  type DeskActionResult,
  failedAction,
  runDeskAction,
} from "@/lib/desk/actions";
import { createPredefinedArea } from "@/lib/desk/admin-writes";
import { describeDeskError } from "@/lib/desk/errors";

/** Saves a reusable area. Needs cap.settings.manage, checked here and by FastAPI. */
export async function savePredefinedArea(
  input: unknown
): Promise<DeskActionResult<CapPredefinedAreaPublic>> {
  const parsed = capPredefinedAreaCreateSchema.safeParse(input);
  if (!parsed.success) {
    return failedAction(
      describeDeskError({
        data: {
          detail: parsed.error.issues.map((issue) => {
            const where = issue.path.map(String).join(" › ");
            return where ? `${where}: ${issue.message}` : issue.message;
          }),
        },
        status: 422,
      })
    );
  }
  const result = await runDeskAction("settingsManage", (token) =>
    createPredefinedArea(token, parsed.data)
  );
  return result;
}
