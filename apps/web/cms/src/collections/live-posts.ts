import {
  type Access,
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Where,
} from "payload";
import {
  canPublish,
  hasPermission,
  isEditor,
  PUBLISH_KEYS,
  WEATHER_NOW_NOTE_KEY,
} from "../access";
import { includeInNewsletterField } from "../fields/common";
import { enforceReview } from "../fields/workflow";
import { isNoteScope, NOTE_KIND, stampDutyNote } from "../lib/duty-note";
import { checkMediaLink, type MediaKind } from "../lib/media-links";
import { editorialCollection } from "./editorial";

const ARTICLE_KEY = "cms.article.create";

/**
 * A user who holds only the duty note permission: they post and edit the
 * note and no other live post.
 */
const isNoteOnly = (user: Parameters<typeof isEditor>[0]) =>
  hasPermission(user, WEATHER_NOW_NOTE_KEY) &&
  !isEditor(user) &&
  !hasPermission(user, ARTICLE_KEY);

/**
 * The duty note can be posted with its own permission, without the review
 * step. Other live posts follow the usual review and publish rules.
 */
export const enforceNoteOrReview =
  (publishKey: string): CollectionBeforeChangeHook =>
  (args) => {
    const { data, originalDoc, req } = args;
    const kind = data.kind ?? originalDoc?.kind;
    if (kind !== NOTE_KIND) return enforceReview(publishKey)(args);
    if (!req.user) throw new APIError("Sign in to edit content.", 403);
    if (
      data.status === "published" &&
      !(
        hasPermission(req.user, WEATHER_NOW_NOTE_KEY) ||
        canPublish(req.user, publishKey)
      )
    )
      throw new APIError(
        "You do not have permission to post the duty forecaster's note.",
        403
      );
    return data;
  };

/** Keeps a note-only user inside the note; every other kind is refused. */
export const guardNoteScope: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  if (!isNoteOnly(req.user)) return data;
  if (!isNoteScope({ kind: data.kind ?? originalDoc?.kind }))
    throw new APIError(
      "Your permission covers the duty forecaster's note only.",
      403
    );
  return data;
};

/** Signs and times the note; runs after the publication stamp so it wins. */
const stampNoteBeforeValidate: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
}) => (data ? stampDutyNote(data, originalDoc) : data);

const liveCreate: Access = ({ req }) =>
  hasPermission(req.user, ARTICLE_KEY) ||
  hasPermission(req.user, WEATHER_NOW_NOTE_KEY);

/** Editors edit anything; the note holder also edits the notes; authors edit their own drafts. */
const liveUpdate: Access = ({ req }) => {
  if (isEditor(req.user)) return true;
  if (!req.user) return false;
  const own: Where = {
    and: [
      { author: { equals: req.user.id } },
      { status: { not_equals: "published" } },
    ],
  };
  return hasPermission(req.user, WEATHER_NOW_NOTE_KEY)
    ? { or: [own, { kind: { equals: NOTE_KIND } }] }
    : own;
};

export const LivePosts = editorialCollection({
  slug: "live-posts",
  prefix: "live",
  publishKey: PUBLISH_KEYS["live-posts"],
  labels: { singular: "Live post", plural: "Live posts" },
  access: { create: liveCreate, update: liveUpdate },
  review: enforceNoteOrReview(PUBLISH_KEYS["live-posts"]),
  beforeValidate: [stampNoteBeforeValidate],
  beforeChange: [guardNoteScope],
  admin: {
    group: "GMS Content",
    defaultColumns: ["title", "kind", "status", "publishedAt"],
    description:
      "Weather now: the duty forecaster's note (signed, and expiring at the next forecast issue), quick updates under it, and videos and audio that play under the Video and Audio tabs.",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
      maxLength: 120,
      admin: {
        description:
          "For the duty forecaster's note this can stay as the default.",
      },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "update",
      label: "Weather now tab",
      admin: {
        description:
          "Where the post shows in Weather now: the duty forecaster's note, beside it as a general update, under the Satellite, Radar, Wind or Seas tab, or as a video or audio to play.",
      },
      options: [
        { label: "Duty forecaster's note", value: "note" },
        { label: "General update", value: "update" },
        { label: "Satellite", value: "satellite" },
        { label: "Radar", value: "radar" },
        { label: "Wind", value: "wind" },
        { label: "Seas", value: "seas" },
        { label: "Video (YouTube or Facebook link)", value: "video" },
        { label: "Audio (SoundCloud link)", value: "audio" },
      ],
    },
    {
      name: "text",
      type: "textarea",
      maxLength: 280,
      admin: {
        description:
          "For the note: two or three plain sentences. A warning, watch or advisory needs its CAP alert link under Related links.",
      },
    },
    {
      name: "mediaUrl",
      type: "text",
      label: "Media link",
      admin: {
        condition: (_data, sibling) =>
          sibling?.kind === "video" || sibling?.kind === "audio",
        description:
          "Paste the share link. The site shows it only when a reader presses play.",
      },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: { kind?: string } }
      ) => {
        const kind = siblingData?.kind;
        if (kind !== "video" && kind !== "audio") return true;
        if (typeof value !== "string" || !value.trim())
          return "Add the media link.";
        return checkMediaLink(kind as MediaKind, value.trim());
      },
    },
    {
      name: "expiresAt",
      type: "date",
      admin: {
        date: { pickerAppearance: "dayAndTime" },
        description:
          "Optional. The post leaves the homepage at this time. A note defaults to the next forecast issue (07:00, 12:00 or 18:00).",
      },
    },
    // Only a general update has a page of its own to link to; videos, audio and
    // the imagery tabs do not go in the digest.
    includeInNewsletterField(
      PUBLISH_KEYS["live-posts"],
      (_data, sibling) => sibling?.kind === "update"
    ),
  ],
});
