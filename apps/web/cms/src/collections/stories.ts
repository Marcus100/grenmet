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
import { leadStoryField } from "../fields/homepage-placement";
import { editorialCollection } from "./editorial";

/** "Stories from our atmosphere and ocean": feature articles. */
export const Stories = editorialCollection({
  slug: "stories",
  prefix: "stories",
  publishKey: PUBLISH_KEYS.stories,
  labels: { singular: "News story", plural: "News" },
  admin: {
    group: "GMS Content",
    description:
      "Stories from our atmosphere and ocean: features that explain the weather, the sea and the climate around us.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 120 },
    {
      name: "kicker",
      type: "text",
      maxLength: 40,
      admin: { description: "Short label above the headline." },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "grenada",
      label: "Topic",
      admin: {
        description:
          "Any weather news is welcome; say how it relates to Grenada in the story.",
      },
      options: [
        { label: "Grenada weather", value: "grenada" },
        { label: "Caribbean and tropics", value: "caribbean" },
        { label: "Around the world", value: "world" },
        { label: "Climate and seasons", value: "climate" },
        { label: "Ocean and marine", value: "ocean" },
        { label: "Explainer", value: "explainer" },
      ],
    },
    summaryField(240),
    ...coverFields({ required: true }),
    bodyField(true),
    leadStoryField,
    includeInNewsletterField(PUBLISH_KEYS.stories),
    topicsField,
    seoField,
    socialField(PUBLISH_KEYS.stories),
  ],
});
