import { PUBLISH_KEYS } from "../access";
import {
  bodyField,
  coverFields,
  includeInNewsletterField,
  socialField,
  summaryField,
} from "../fields/common";
import { checkMediaLink, type MediaKind } from "../lib/media-links";
import { editorialCollection } from "./editorial";

/** "From the Desk": the forecast office blogging about what it issues. */
const base = editorialCollection({
  slug: "desk-updates",
  prefix: "updates",
  publishKey: PUBLISH_KEYS["desk-updates"],
  labels: { singular: "Desk update", plural: "Desk updates" },
  admin: {
    group: "GMS Content",
    description:
      "From the Desk: the forecast office writing about what it issues, plus service notices. Paste the product under Related links and tick Main link to show its live details; never type forecast figures or warnings here.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "announcement",
      label: "About (product or service)",
      admin: {
        description:
          "The GMS product or service this post is about. It shows as the small label above the headline.",
      },
      options: [
        { label: "Forecasts", value: "forecasts" },
        { label: "Tropical weather outlook", value: "tropical-outlook" },
        { label: "Hazard bulletins", value: "bulletins" },
        { label: "CAP warnings", value: "cap-warnings" },
        { label: "Marine", value: "marine" },
        { label: "Aviation", value: "aviation" },
        { label: "Climate and data", value: "climate" },
        { label: "Service notice", value: "service-notice" },
        { label: "Community and education", value: "community" },
        { label: "Announcement", value: "announcement" },
      ],
    },
    {
      name: "format",
      type: "select",
      required: true,
      defaultValue: "standard",
      label: "Post type",
      admin: {
        description:
          "Standard: words and a picture. Audio or Video: also paste a share link, played only when a reader presses play. Chart: the picture is a chart (owner, 1 Nov 2026).",
      },
      options: [
        { label: "Standard", value: "standard" },
        { label: "Audio", value: "audio" },
        { label: "Video", value: "video" },
        { label: "Chart", value: "chart" },
      ],
    },
    {
      name: "mediaUrl",
      type: "text",
      label: "Media link",
      admin: {
        condition: (_data, sibling) =>
          sibling?.format === "video" || sibling?.format === "audio",
        description:
          "YouTube or Facebook for video, SoundCloud for audio. Paste the share link.",
      },
      validate: (
        value: unknown,
        { siblingData }: { siblingData: { format?: string } }
      ) => {
        const format = siblingData?.format;
        if (format !== "video" && format !== "audio") return true;
        if (typeof value !== "string" || !value.trim())
          return "Add the media link.";
        return checkMediaLink(format as MediaKind, value.trim());
      },
    },
    {
      name: "authorRole",
      type: "text",
      maxLength: 60,
      label: "Your role",
      admin: {
        description:
          'Shown after your name on the card, e.g. "Duty forecaster" or "Climate officer".',
      },
    },
    summaryField(200),
    // Every desk card shows a picture below its words, credited from the media
    // item's Credit field (owner, 1 Nov 2026).
    ...coverFields(),
    bodyField(false),
    includeInNewsletterField(PUBLISH_KEYS["desk-updates"]),
    socialField(PUBLISH_KEYS["desk-updates"]),
  ],
});

export const DeskUpdates = base;
