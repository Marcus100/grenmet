import { PUBLISH_KEYS } from "../access";
import {
  bodyField,
  coverFields,
  seoField,
  socialField,
  summaryField,
  topicsField,
} from "../fields/common";
import { editorialCollection } from "./editorial";

/** "Latest reports": official documents and datasets with their own record. */
export const Publications = editorialCollection({
  slug: "publications",
  prefix: "publications",
  publishKey: PUBLISH_KEYS.publications,
  labels: { singular: "Publication", plural: "Publications" },
  admin: {
    group: "Homepage sections",
    description:
      "Latest reports: climate summaries, outlooks, reports and datasets. Each has the document itself and the period it covers.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 160 },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "report",
      options: [
        { label: "Report", value: "report" },
        { label: "Climate bulletin", value: "climate-bulletin" },
        { label: "Outlook", value: "outlook" },
        { label: "Guide", value: "guide" },
        { label: "Dataset", value: "dataset" },
        { label: "Policy", value: "policy" },
        { label: "Research paper", value: "research" },
      ],
    },
    {
      name: "series",
      type: "select",
      options: [
        { label: "Monthly climate summary", value: "monthly-climate" },
        { label: "Seasonal outlook", value: "seasonal-outlook" },
        { label: "Hurricane season", value: "hurricane-season" },
        { label: "Annual report", value: "annual-report" },
      ],
      admin: {
        description: "Groups regular reports so readers can browse them.",
      },
    },
    {
      name: "document",
      type: "upload",
      relationTo: "media",
      required: true,
      admin: { description: "The PDF, CSV or spreadsheet itself." },
    },
    {
      type: "row",
      fields: [
        { name: "periodStart", label: "Covers from", type: "date" },
        { name: "periodEnd", label: "Covers to", type: "date" },
      ],
    },
    summaryField(280),
    {
      name: "keyFindings",
      type: "array",
      maxRows: 3,
      admin: { description: "Up to three one-line findings for the card." },
      fields: [{ name: "text", type: "text", required: true, maxLength: 160 }],
    },
    ...coverFields(),
    bodyField(false),
    topicsField,
    seoField,
    socialField,
  ],
});
