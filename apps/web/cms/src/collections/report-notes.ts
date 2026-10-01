import { PUBLISH_KEYS } from "../access";
import {
  bodyField,
  coverFields,
  seoField,
  socialField,
  summaryField,
  topicsField,
} from "../fields/common";
import { linkedProductField } from "../fields/linked-product";
import { guardHazardWords } from "./desk-updates";
import { editorialCollection } from "./editorial";

/**
 * "Latest reports": a write-up of one issued report. The report itself stays
 * in FastAPI; the site shows its live figures beside the write-up.
 */
const base = editorialCollection({
  slug: "report-notes",
  prefix: "reports",
  publishKey: PUBLISH_KEYS["report-notes"],
  labels: { singular: "Report write-up", plural: "Report write-ups" },
  admin: {
    group: "Homepage sections",
    description:
      "Latest reports: explain an issued report in plain language. Only reports with a published write-up appear on the homepage.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    linkedProductField({
      required: true,
      description:
        "The issued report this write-up is about. Its figures come from the forecast system.",
    }),
    summaryField(240),
    ...coverFields(),
    bodyField(true),
    topicsField,
    seoField,
    socialField,
  ],
});

export const ReportNotes = {
  ...base,
  hooks: {
    ...base.hooks,
    beforeChange: [...(base.hooks?.beforeChange ?? []), guardHazardWords],
  },
};
