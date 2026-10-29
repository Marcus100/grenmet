import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Field,
} from "payload";
import { canPublish, staffField } from "../access";

/**
 * Review before publication: authors submit ("Ready for review") and only a
 * holder of `publishKey` publishes. Shared by every editorial collection.
 */
export function enforceReview(publishKey: string): CollectionBeforeChangeHook {
  return ({ data, originalDoc, req }) => {
    if (!req.user) throw new APIError("Sign in to edit content.", 403);
    if (data.status === "published") {
      if (!canPublish(req.user, publishKey))
        throw new APIError(
          "You do not have permission to publish in this section.",
          403
        );
      if (
        originalDoc?.status !== "review" &&
        originalDoc?.status !== "published"
      )
        throw new APIError(
          "Submit the content for review before publishing.",
          400
        );
    }
    return data;
  };
}

/** A show-from time in the future starts the item's date; otherwise now. */
export function firstPublishedAt(
  publishAt: unknown,
  now: Date = new Date()
): string {
  const from =
    typeof publishAt === "string" && publishAt ? new Date(publishAt) : null;
  return from && from.getTime() > now.getTime()
    ? from.toISOString()
    : now.toISOString();
}

/** The take-off time must come after the show-from time when both are set. */
export function checkTakeOff(
  unpublishAt: unknown,
  publishAt: unknown
): true | string {
  if (typeof unpublishAt !== "string" || !unpublishAt) return true;
  if (typeof publishAt !== "string" || !publishAt) return true;
  return new Date(unpublishAt).getTime() > new Date(publishAt).getTime()
    ? true
    : "Take it off after the time it shows from.";
}

/** The signed-in name shown on a post: their username, or the part of an address before the @. */
export function displayName(user: { username?: unknown } | null | undefined) {
  const username = typeof user?.username === "string" ? user.username : "";
  const name = username.includes("@") ? username.split("@")[0] : username;
  return name?.trim() ? name.trim() : null;
}

export const stampPublication: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data;
  if (!data.publishedAt && data.status === "published")
    data.publishedAt = firstPublishedAt(data.publishAt);
  data.author = operation === "create" ? req.user?.id : originalDoc?.author;
  // Public on the site (the author relation itself is staff-only): who wrote it.
  data.authorName =
    operation === "create" ? displayName(req.user) : originalDoc?.authorName;
  return data;
};

export const workflowFields: Field[] = [
  {
    name: "status",
    type: "select",
    required: true,
    defaultValue: "draft",
    index: true,
    options: [
      { label: "Draft", value: "draft" },
      { label: "Ready for review", value: "review" },
      { label: "Published", value: "published" },
    ],
    admin: {
      position: "sidebar",
      description:
        "Save as Ready for review. An editor with this section's permission publishes.",
    },
  },
  {
    name: "publishedAt",
    type: "date",
    index: true,
    admin: {
      position: "sidebar",
      description: "Set when first published; used for ordering and the URL.",
    },
  },
  {
    name: "publishAt",
    type: "date",
    label: "Show on the site from",
    admin: {
      position: "sidebar",
      date: { pickerAppearance: "dayAndTime" },
      description:
        "Optional. Published items show from this time. Leave empty to show as soon as it is published.",
    },
  },
  {
    name: "unpublishAt",
    type: "date",
    label: "Take off the site at",
    admin: {
      position: "sidebar",
      date: { pickerAppearance: "dayAndTime" },
      description:
        "Optional. The item leaves the site at this time and stays in the CMS.",
    },
    validate: (
      value: unknown,
      { siblingData }: { siblingData?: { publishAt?: unknown } }
    ) => checkTakeOff(value, siblingData?.publishAt),
  },
  {
    name: "authorName",
    type: "text",
    label: "Shown as the author",
    admin: {
      readOnly: true,
      position: "sidebar",
      description: "The name of whoever created the post, shown on the site.",
    },
  },
  {
    name: "author",
    type: "relationship",
    relationTo: "users",
    required: true,
    admin: { readOnly: true, position: "sidebar" },
    access: { read: staffField },
  },
];
