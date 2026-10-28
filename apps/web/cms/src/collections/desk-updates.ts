import type { CollectionBeforeChangeHook } from "payload";
import { PUBLISH_KEYS } from "../access";
import { bodyField, socialField, summaryField } from "../fields/common";
import { assertNoUnlinkedHazard, isCapLink } from "../fields/hazard-guard";
import { bodyToText } from "../lib/lexical";
import { editorialCollection } from "./editorial";

/** Desk updates may mention a warning only with a link to its CAP alert. */
export const guardHazardWords: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const links = (data.relatedLinks ?? originalDoc?.relatedLinks ?? []) as {
    category?: string;
    url?: string;
  }[];
  assertNoUnlinkedHazard(
    [
      data.title ?? originalDoc?.title,
      data.summary ?? originalDoc?.summary,
      bodyToText(data.body ?? originalDoc?.body),
    ],
    links.some(isCapLink)
  );
  return data;
};

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
    socialField,
  ],
});

export const DeskUpdates = {
  ...base,
  hooks: {
    ...base.hooks,
    beforeChange: [...(base.hooks?.beforeChange ?? []), guardHazardWords],
  },
};
