"use server";

import {
  type CapFeedImportPublic,
  capFeedImportCreateSchema,
  capFeedImportUpdateSchema,
} from "@barrelsgd/api-client";
import {
  type DeskActionResult,
  failedAction,
  runDeskAction,
} from "@/lib/desk/actions";
import {
  createCapFeed,
  deleteCapFeed,
  updateCapFeed,
} from "@/lib/desk/admin-writes";
import { describeDeskError } from "@/lib/desk/errors";
import { parseUuid } from "@/lib/desk/uuid";

/** Each action checks the gate and `cap.feed.manage`, then FastAPI checks again. */
export async function createFeed(
  input: unknown
): Promise<DeskActionResult<CapFeedImportPublic>> {
  const parsed = capFeedImportCreateSchema.safeParse(input);
  if (!parsed.success)
    return failedAction(validationError(parsed.error.issues));
  const result = await runDeskAction("feedsManage", (token) =>
    createCapFeed(token, parsed.data)
  );
  return result;
}

export async function updateFeed(
  feedId: unknown,
  input: unknown
): Promise<DeskActionResult<CapFeedImportPublic>> {
  const id = parseUuid(feedId);
  if (!id) return failedAction(badId());
  const parsed = capFeedImportUpdateSchema.safeParse(input);
  if (!parsed.success)
    return failedAction(validationError(parsed.error.issues));
  const result = await runDeskAction("feedsManage", (token) =>
    updateCapFeed(token, id, parsed.data)
  );
  return result;
}

export async function deleteFeed(
  feedId: unknown
): Promise<DeskActionResult<null>> {
  const id = parseUuid(feedId);
  if (!id) return failedAction(badId());
  const result = await runDeskAction("feedsManage", async (token) => {
    await deleteCapFeed(token, id);
    return null;
  });
  return result;
}

function badId() {
  return describeDeskError({
    data: { detail: "The feed ID is not a valid ID." },
    status: 422,
  });
}

function validationError(
  issues: readonly { message: string; path: PropertyKey[] }[]
) {
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
