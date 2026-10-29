import { PUBLISH_KEYS } from "../access";
import {
  bodyField,
  coverFields,
  includeInNewsletterField,
  seoField,
  socialField,
  summaryField,
  topicsField,
} from "../fields/common";
import { editorialCollection } from "./editorial";

/**
 * "Latest reports": a write-up of one issued report. The report itself stays
 * in FastAPI; the site shows its live figures beside the write-up.
 */
const base = editorialCollection({
  slug: "report-notes",
  prefix: "reports",
  publishKey: PUBLISH_KEYS["report-notes"],
  requireMainProduct: true,
  labels: { singular: "Report write-up", plural: "Report write-ups" },
  admin: {
    group: "GMS Content",
    description:
      "Latest reports: explain an issued report in plain language. Paste the issued report under Related links and tick Main link; its figures come from the forecast system. Only reports with a published write-up appear on the homepage.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    summaryField(240),
    ...coverFields(),
    bodyField(true),
    includeInNewsletterField(PUBLISH_KEYS["report-notes"]),
    topicsField,
    seoField,
    socialField(PUBLISH_KEYS["report-notes"]),
  ],
});

export const ReportNotes = base;
