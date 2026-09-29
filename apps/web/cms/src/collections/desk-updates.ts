import { PUBLISH_KEYS } from "../access";
import { bodyField, socialField, summaryField } from "../fields/common";
import { editorialCollection } from "./editorial";

/** "From the Desk": short notices from the forecast office. */
export const DeskUpdates = editorialCollection({
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
