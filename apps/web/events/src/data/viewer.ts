import "server-only";

import { eventsGetMyProfile } from "@barrelsgd/api-client";
import { redirect } from "next/navigation";
import type { Profile } from "@/domain/types";
import { apiOptions } from "@/lib/api";
import { reportError } from "@/lib/report-error";
import { type EventsSession, getSession } from "@/lib/session";
import { ANONYMOUS_VIEWER_ID, isSignedIn } from "./viewer-profile";

const ANONYMOUS_VIEWER: Profile = {
  id: ANONYMOUS_VIEWER_ID,
  handle: "",
  name: "Guest",
  headline: "",
  bio: "",
  parish: "st-george",
  interests: [],
  intents: [],
  groupIds: [],
  attendedEventIds: [],
  visibility: "public",
};

/** A signed-in member with no API profile yet (e.g. the Events DB is down). */
function profileFromSession(session: EventsSession): Profile {
  return {
    ...ANONYMOUS_VIEWER,
    id: session.userId,
    name: session.fullName || session.email,
  };
}

/**
 * The current viewer: the signed-in member's profile, or a guest stand-in so
 * public pages render without branching. Use `isSignedIn` to tell them apart.
 */
export async function getViewer(): Promise<Profile> {
  const session = await getSession();
  if (!session) {
    return ANONYMOUS_VIEWER;
  }
  try {
    const mine = await eventsGetMyProfile(
      apiOptions(session.accessToken)
    ).unwrap();
    return {
      ...ANONYMOUS_VIEWER,
      id: mine.handle,
      handle: mine.handle,
      name: mine.display_name,
      headline: mine.headline,
      bio: mine.bio,
      parish: mine.parish,
      interests: mine.interests,
      intents: mine.intents,
      visibility: mine.visibility,
    };
  } catch (error) {
    reportError(error, "events-viewer");
    return profileFromSession(session);
  }
}

/** For member-only pages: send visitors to sign in, then back here. */
export async function requireViewer(returnTo: string): Promise<Profile> {
  const viewer = await getViewer();
  if (!isSignedIn(viewer)) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return viewer;
}
