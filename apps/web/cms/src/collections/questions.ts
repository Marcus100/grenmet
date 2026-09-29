import type { CollectionBeforeChangeHook } from "payload";
import { PUBLISH_KEYS, staffField } from "../access";
import { bodyField, seoField, topicsField } from "../fields/common";
import { editorialCollection } from "./editorial";

/**
 * Optional science check: ticking it records who checked and when; clearing
 * it clears both. The public sees only "Checked by GMS on <date>".
 */
export const stampScienceCheck: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  const checked = data.scienceCheck?.checked;
  const wasChecked = originalDoc?.scienceCheck?.checked;
  if (checked && !wasChecked)
    data.scienceCheck = {
      checked: true,
      checkedAt: new Date().toISOString(),
      checkedBy: req.user?.id,
    };
  else if (checked === false)
    data.scienceCheck = { checked: false, checkedAt: null, checkedBy: null };
  else if (wasChecked) data.scienceCheck = originalDoc.scienceCheck;
  return data;
};

const base = editorialCollection({
  slug: "questions",
  prefix: "questions",
  dated: false,
  titleField: "question",
  publishKey: PUBLISH_KEYS.questions,
  labels: { singular: "Question", plural: "Questions" },
  admin: {
    group: "Homepage sections",
    description:
      "Questions about the weather: the questions people ask, each with a short answer and a full explainer.",
  },
  fields: [
    {
      name: "question",
      type: "text",
      required: true,
      maxLength: 120,
      admin: { description: "Phrase it the way the public asks it." },
    },
    {
      name: "shortAnswer",
      type: "textarea",
      required: true,
      maxLength: 300,
      admin: {
        description:
          "Two or three plain sentences. Shown on the homepage and in search.",
      },
    },
    bodyField(true),
    {
      name: "related",
      type: "relationship",
      relationTo: ["questions", "stories", "publications"],
      hasMany: true,
      maxRows: 6,
      admin: {
        description: "Other questions, stories or reports to read next.",
      },
    },
    topicsField,
    {
      name: "scienceCheck",
      type: "group",
      label: "Science check (optional)",
      admin: {
        position: "sidebar",
        description: "A meteorologist confirms the answer is correct.",
      },
      fields: [
        {
          name: "checked",
          type: "checkbox",
          label: "Checked by a meteorologist",
        },
        { name: "checkedAt", type: "date", admin: { readOnly: true } },
        {
          name: "checkedBy",
          type: "relationship",
          relationTo: "users",
          admin: { readOnly: true },
          access: { read: staffField },
        },
      ],
    },
    seoField,
  ],
});

export const Questions = {
  ...base,
  hooks: {
    ...base.hooks,
    beforeChange: [...(base.hooks?.beforeChange ?? []), stampScienceCheck],
  },
};
