import type { CollectionBeforeChangeHook } from "payload";
import { PUBLISH_KEYS } from "../access";
import { assertNoUnlinkedHazard, isCapLink } from "../fields/hazard-guard";
import { checkMediaLink, type MediaKind } from "../lib/media-links";
import { editorialCollection } from "./editorial";

/**
 * "Weather now" feed: short live posts, videos and audio under the duty
 * forecaster's note. Media are links the site embeds on request, never files.
 */
/** A live post may mention a warning only with a link to its CAP alert. */
export const guardLiveHazardWords: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const links = (data.relatedLinks ?? originalDoc?.relatedLinks ?? []) as {
    category?: string;
    url?: string;
  }[];
  assertNoUnlinkedHazard(
    [data.title ?? originalDoc?.title, data.text ?? originalDoc?.text],
    links.some(isCapLink)
  );
  return data;
};

const base = editorialCollection({
  slug: "live-posts",
  prefix: "live",
  publishKey: PUBLISH_KEYS["live-posts"],
  labels: { singular: "Live post", plural: "Live posts" },
  admin: {
    group: "Homepage sections",
    defaultColumns: ["title", "kind", "status", "publishedAt"],
    description:
      "Weather now: videos and audio play under the Video and Audio tabs beside Satellite, Radar and Rainfall; quick updates appear under the duty forecaster's note (which stays on the Weather now page).",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "update",
      options: [
        { label: "Quick update", value: "update" },
        { label: "Video (YouTube or Facebook link)", value: "video" },
        { label: "Audio (SoundCloud link)", value: "audio" },
      ],
    },
    { name: "text", type: "textarea", maxLength: 280 },
    {
      name: "mediaUrl",
      type: "text",
      label: "Media link",
      admin: {
        condition: (_data, sibling) => sibling?.kind !== "update",
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
        description: "Optional. The post leaves the homepage at this time.",
      },
    },
  ],
});

export const LivePosts = {
  ...base,
  hooks: {
    ...base.hooks,
    beforeChange: [...(base.hooks?.beforeChange ?? []), guardLiveHazardWords],
  },
};
