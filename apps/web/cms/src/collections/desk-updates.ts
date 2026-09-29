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

/** "From the Desk": short notices from the forecast office. */
const base = editorialCollection({
  slug: "desk-updates",
  prefix: "updates",
  publishKey: PUBLISH_KEYS["desk-updates"],
  labels: { singular: "Desk update", plural: "Desk updates" },
  admin: {
    group: "Homepage sections",
    description:
      "From the Desk: product changes, service notices and announcements. Never a forecast or a warning; those are issued in the forecast system.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "announcement",
      options: [
        { label: "Product update", value: "product-update" },
        { label: "Service update", value: "service-update" },
        { label: "Announcement", value: "announcement" },
        { label: "Public notice", value: "public-notice" },
        { label: "Community update", value: "community-update" },
      ],
    },
    {
      name: "product",
      type: "select",
      options: [
        { label: "Tropical weather outlook", value: "tropical-outlook" },
        { label: "Bulletins", value: "bulletins" },
        { label: "Forecasts", value: "forecasts" },
        { label: "Marine", value: "marine" },
        { label: "Aviation", value: "aviation" },
        { label: "CAP alerts", value: "cap" },
      ],
      admin: { description: "The product this update is about, if any." },
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
