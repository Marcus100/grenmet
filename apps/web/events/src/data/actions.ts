"use server";

import {
  eventsAcceptConnection,
  eventsBlockMember,
  eventsCancelListingRsvp,
  eventsCreateManagedListing,
  eventsCreateReport,
  eventsCreateSuggestion,
  eventsFollowOrganiser,
  eventsJoinGroup,
  eventsLeaveGroup,
  eventsOpenThread,
  eventsRemoveConnection,
  eventsRequestConnection,
  eventsRsvpListing,
  eventsSaveListing,
  eventsSendMessage,
  eventsUnblockMember,
  eventsUnfollowOrganiser,
  eventsUnsaveListing,
  eventsUpdateManagedListing,
  eventsUpdateMyProfile,
  type ListingUpsert,
  type ProfileUpdate,
  type ReportCreate,
  ResponseError,
  type SuggestionCreate,
} from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { apiOptions } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { type ActionResult, SIGN_IN_REQUIRED } from "./action-result";

/**
 * Every Events write goes through here: the member's token is read from the
 * session cookie on the server and never reaches the browser. Expected
 * failures (validation, rate limits, safety rules) return the API's message;
 * anything else is reported and replaced with a generic one.
 */

type Options = ReturnType<typeof apiOptions>;

function detailOf(error: ResponseError): string | null {
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const { detail } = data;
  return typeof detail === "string" ? detail : null;
}

async function run<T>(
  area: string,
  call: (options: Options) => Promise<T>,
  { requireSession = true }: { requireSession?: boolean } = {}
): Promise<ActionResult<T>> {
  const session = await getSession();
  if (!session && requireSession) {
    return { ok: false, error: SIGN_IN_REQUIRED };
  }
  try {
    const data = await call(apiOptions(session?.accessToken));
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ResponseError && error.status === 401) {
      return { ok: false, error: SIGN_IN_REQUIRED };
    }
    if (
      error instanceof ResponseError &&
      error.status >= 400 &&
      error.status < 500
    ) {
      return {
        ok: false,
        error: detailOf(error) ?? "That didn't work. Check it and try again.",
      };
    }
    reportError(error, area);
    return { ok: false, error: "Something went wrong. Try again shortly." };
  }
}

export async function setGoing(slug: string, going: boolean) {
  return await run("events-rsvp", async (options) => {
    const request = going ? eventsRsvpListing : eventsCancelListingRsvp;
    await request({ ...options, path: { slug } });
  });
}

export async function setSaved(slug: string, saved: boolean) {
  return await run("events-save", async (options) => {
    const request = saved ? eventsSaveListing : eventsUnsaveListing;
    await request({ ...options, path: { slug } });
  });
}

export async function setFollowing(slug: string, following: boolean) {
  return await run("events-follow", async (options) => {
    const request = following ? eventsFollowOrganiser : eventsUnfollowOrganiser;
    await request({ ...options, path: { slug } });
  });
}

/** Resolves to the API's message, e.g. "Request sent" for approval groups. */
export async function setMembership(slug: string, join: boolean) {
  return await run("events-group", async (options) => {
    if (join) {
      return (await eventsJoinGroup({ ...options, path: { slug } }).unwrap())
        .message;
    }
    await eventsLeaveGroup({ ...options, path: { slug } });
    return null;
  });
}

export async function requestConnection(handle: string) {
  return await run("events-connect", async (options) => {
    await eventsRequestConnection({ ...options, body: { handle } });
  });
}

export async function acceptConnection(connectionId: string) {
  return await run("events-connect", async (options) => {
    await eventsAcceptConnection({
      ...options,
      path: { connection_id: connectionId },
    });
  });
}

export async function removeConnection(connectionId: string) {
  return await run("events-connect", async (options) => {
    await eventsRemoveConnection({
      ...options,
      path: { connection_id: connectionId },
    });
  });
}

export async function setBlocked(handle: string, blocked: boolean) {
  return await run("events-block", async (options) => {
    const request = blocked ? eventsBlockMember : eventsUnblockMember;
    await request({ ...options, path: { handle } });
  });
}

export async function reportSubject(report: ReportCreate) {
  return await run("events-report", async (options) => {
    await eventsCreateReport({ ...options, body: report });
  });
}

/** Opens (or finds) a direct thread; the caller navigates to it. */
export async function openDirectThread(handle: string) {
  return await run("events-thread", async (options) => {
    const thread = await eventsOpenThread({
      ...options,
      body: { handle },
    }).unwrap();
    return thread.id;
  });
}

export async function sendMessage(threadId: string, body: string) {
  return await run("events-message", async (options) => {
    await eventsSendMessage({
      ...options,
      path: { thread_id: threadId },
      body: { body },
    });
  });
}

/** Visitors may suggest events too, so no session is required. */
export async function suggestEvent(suggestion: SuggestionCreate) {
  return await run(
    "events-suggest",
    async (options) => {
      await eventsCreateSuggestion({ ...options, body: suggestion });
    },
    { requireSession: false }
  );
}

export async function updateProfile(update: ProfileUpdate) {
  return await run("events-profile", async (options) => {
    await eventsUpdateMyProfile({ ...options, body: update });
  });
}

/** Creates (no id) or updates an organiser listing; resolves to its id. */
export async function saveListing(id: string | null, listing: ListingUpsert) {
  return await run("events-listing", async (options) => {
    const saved = id
      ? await eventsUpdateManagedListing({
          ...options,
          path: { listing_id: id },
          body: listing,
        }).unwrap()
      : await eventsCreateManagedListing({
          ...options,
          body: listing,
        }).unwrap();
    return saved.id;
  });
}
