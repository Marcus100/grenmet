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

/** "Stories from our atmosphere and ocean": feature articles. */
export const Stories = editorialCollection({
  slug: "stories",
  prefix: "stories",
  publishKey: PUBLISH_KEYS.stories,
  labels: { singular: "Story", plural: "Stories" },
  admin: {
    group: "Homepage sections",
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
      defaultValue: "local-story",
      options: [
        { label: "Local weather story", value: "local-story" },
        { label: "Weather event", value: "weather-event" },
        { label: "Climate", value: "climate" },
        { label: "Ocean", value: "ocean" },
        { label: "Explainer", value: "explainer" },
        { label: "Community impact", value: "community" },
      ],
    },
    summaryField(240),
    ...coverFields({ required: true }),
    bodyField(true),
    topicsField,
    seoField,
    socialField,
  ],
});
