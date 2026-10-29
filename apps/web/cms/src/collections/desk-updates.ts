import { PUBLISH_KEYS } from "../access";
import {
  bodyField,
  includeInNewsletterField,
  socialField,
  summaryField,
} from "../fields/common";
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
    summaryField(200),
    bodyField(false),
    includeInNewsletterField(PUBLISH_KEYS["desk-updates"]),
    socialField(PUBLISH_KEYS["desk-updates"]),
  ],
});

export const DeskUpdates = base;
