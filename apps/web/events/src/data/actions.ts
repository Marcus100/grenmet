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
  eventsRequestOrganiser,
  eventsRsvpListing,
  eventsSaveListing,
  eventsSendMessage,
  eventsSetOrganiserLogo,
  eventsUnblockMember,
  eventsUnfollowOrganiser,
  eventsUnsaveListing,
  eventsUpdateManagedListing,
  eventsUpdateMyProfile,
  type ListingUpsert,
  type OrganiserCreate,
  type ProfileUpdate,
  type ReportCreate,
  ResponseError,
  type SuggestionCreate,
  storageCompleteUpload,
  storageCreateUpload,
} from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { apiOptions } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { type ActionResult, SIGN_IN_REQUIRED } from "./action-result";
import { chosenOrganiser, rememberOrganiser } from "./organiser-choice";

/**
 * Every Events write goes through here: the member's token is read from the
 * session cookie on the server and never reaches the browser. Expected
 * failures (validation, rate limits, safety rules) return the API's message;
 * anything else is reported and replaced with a generic one.
 */

type Options = ReturnType<typeof apiOptions>;

/** The API's message when object storage is not set up; shown as is. */
const UPLOADS_UNAVAILABLE = "Uploads are not configured";

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
      ((error.status >= 400 && error.status < 500) ||
        (error.status === 503 && detailOf(error) === UPLOADS_UNAVAILABLE))
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
  const organiser = await chosenOrganiser();
  const query = organiser ? { organiser } : {};
  return await run("events-listing", async (options) => {
    const saved = id
      ? await eventsUpdateManagedListing({
          ...options,
          path: { listing_id: id },
          query,
          body: listing,
        }).unwrap()
      : await eventsCreateManagedListing({
          ...options,
          query,
          body: listing,
        }).unwrap();
    return saved.id;
  });
}

/** Remembers which organiser the /dash console acts for. */
export async function switchOrganiser(slug: string) {
  await rememberOrganiser(slug);
  revalidatePath("/dash", "layout");
}

/** Creates an organiser account for the member (unverified until reviewed). */
export async function requestOrganiser(organiser: OrganiserCreate) {
  return await run("events-organiser-request", async (options) => {
    const created = await eventsRequestOrganiser({
      ...options,
      body: organiser,
    }).unwrap();
    await rememberOrganiser(created.slug);
    return created.slug;
  });
}

const ORGANISATION_HEADER = "X-Barrels-Organisation";

export type UploadPurpose = "listing-image" | "organiser-logo";

/** A presigned PUT the browser sends the file to directly. */
export interface UploadTarget {
  readonly headers: Record<string, string>;
  readonly id: string;
  readonly url: string;
}

/** Step 1 of an image upload: the API checks type and size and presigns a PUT. */
export async function startUpload(
  organisationId: string,
  upload: { contentType: string; purpose: UploadPurpose; sizeBytes: number }
) {
  return await run("events-upload", async (options) => {
    const ticket = await storageCreateUpload({
      ...options,
      headers: { [ORGANISATION_HEADER]: organisationId },
      body: {
        app: "events",
        purpose: upload.purpose,
        content_type: upload.contentType,
        size_bytes: upload.sizeBytes,
      },
    }).unwrap();
    return {
      id: ticket.id,
      url: ticket.url,
      headers: ticket.headers,
    } satisfies UploadTarget;
  });
}

/** Step 3: the API confirms the object arrived; resolves to the stored file id. */
export async function finishUpload(organisationId: string, uploadId: string) {
  return await run("events-upload", async (options) => {
    const stored = await storageCompleteUpload({
      ...options,
      headers: { [ORGANISATION_HEADER]: organisationId },
      path: { upload_id: uploadId },
    }).unwrap();
    return stored.id;
  });
}

/** Sets (or, with null, clears) the organiser's logo from a completed upload. */
export async function saveOrganiserLogo(fileId: string | null) {
  const organiser = await chosenOrganiser();
  const query = organiser ? { organiser } : {};
  return await run("events-organiser-logo", async (options) => {
    await eventsSetOrganiserLogo({
      ...options,
      query,
      body: { file_id: fileId },
    });
  });
}
