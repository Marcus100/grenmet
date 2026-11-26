import type { AccountProfilePublic } from "@barrelsgd/api-client";
import type { Route } from "next";

export type ChecklistKey = "email" | "name" | "phone" | "photo";

export interface ChecklistItem {
  /**
   * The one action of the row: an editor page, or a place on the same page.
   * Null when the row has none (the email).
   */
  action:
    | { href: Route; kind: "page"; label: string }
    | { href: `#${string}`; kind: "anchor"; label: string }
    | null;
  done: boolean;
  key: ChecklistKey;
  title: string;
  /** What is stored when done, or what to do when not. */
  value: string;
}

/** Where the photo row sends the person: the photo section on the same page. */
export const PROFILE_PHOTO_ANCHOR = "profile-photo";

/** First and last name as one line, without a stray space when one is empty. */
export function fullName(profile: AccountProfilePublic): string {
  return [profile.first_name, profile.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * The four rows of "Finish your profile", in order. The email is always done:
 * the person signed in with it. A name the sign-up made up (the API says so) is
 * not done. `hasPhoto` is null when the photo could not be checked.
 */
export function profileChecklist(
  profile: AccountProfilePublic,
  hasPhoto: boolean | null
): ChecklistItem[] {
  const nameDone = !profile.name_is_placeholder;
  const phoneDone = Boolean(profile.phone);
  let photoValue = "Add a photo so people recognise you.";
  if (hasPhoto) photoValue = "Photo added";
  if (hasPhoto === null) photoValue = "We could not check your photo just now.";
  return [
    {
      action: null,
      done: true,
      key: "email",
      title: "Email",
      value: profile.email,
    },
    {
      action: {
        href: "/profile/name",
        kind: "page",
        label: nameDone ? "Edit name" : "Add your name",
      },
      done: nameDone,
      key: "name",
      title: "Your name",
      value: nameDone
        ? fullName(profile)
        : "Tell us what to call you on bookings and receipts.",
    },
    {
      action: {
        href: "/profile/phone",
        kind: "page",
        label: phoneDone ? "Change phone number" : "Add a phone number",
      },
      done: phoneDone,
      key: "phone",
      title: "Phone number",
      value:
        profile.phone ??
        "Add a number so a business can reach you about a booking.",
    },
    {
      action: {
        href: `#${PROFILE_PHOTO_ANCHOR}`,
        kind: "anchor",
        label: hasPhoto ? "Change photo" : "Add a photo",
      },
      done: hasPhoto === true,
      key: "photo",
      title: "Photo",
      value: photoValue,
    },
  ];
}
