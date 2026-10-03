import type { GlobalConfig } from "payload";
import { HOMEPAGE_KEY, hasPermission } from "../access";

export const HOMEPAGE_SECTIONS = [
  { label: "Weather now", value: "weather-now" },
  { label: "From the Desk", value: "desk" },
  { label: "Stories", value: "stories" },
  { label: "Questions about the weather", value: "questions" },
  { label: "Sky, history and a little fun", value: "discover" },
  { label: "Latest reports", value: "reports" },
  { label: "Explore today", value: "explore-today" },
  { label: "Grenada in data", value: "grenada-in-data" },
] as const;

export const EXPLORE_ACTIVITIES = [
  { label: "Beach", value: "beach" },
  { label: "Fishing", value: "fishing" },
  { label: "Boating", value: "boating" },
  { label: "Growing", value: "growing" },
  { label: "Outdoors", value: "outdoors" },
  { label: "Night sky", value: "night-sky" },
] as const;

/** Payload field names cannot contain hyphens. */
export const copyFieldName = (key: string) => key.replaceAll("-", "_");

export const DISCOVER_CARDS = [
  { label: "Tonight's sky", value: "sky" },
  { label: "On this day", value: "on-this-day" },
  { label: "Quiz", value: "quiz" },
  { label: "Did you know", value: "fact" },
] as const;

/** Homepage settings: what leads each section. Empty choices fill themselves. */
export const Homepage: GlobalConfig = {
  slug: "homepage",
  label: "Homepage",
  admin: {
    group: "Homepage sections",
    description:
      "Choose what leads the editorial homepage sections, or hide a section (for example during a hurricane). Anything left empty shows the newest published items.",
  },
  access: {
    read: () => true,
    update: ({ req }) => hasPermission(req.user, HOMEPAGE_KEY),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { max: 20 },
  fields: [
    {
      name: "leadStory",
      type: "relationship",
      relationTo: "stories",
      admin: { description: "The large story. Default: the newest." },
    },
    {
      name: "featuredQuestions",
      type: "relationship",
      relationTo: "questions",
      hasMany: true,
      maxRows: 5,
      admin: { description: "Up to five, in order. Default: the newest." },
    },
    {
      name: "discoverCards",
      type: "select",
      hasMany: true,
      options: [...DISCOVER_CARDS],
      defaultValue: DISCOVER_CARDS.map((card) => card.value),
      admin: {
        description: "Which cards Sky, history and a little fun shows.",
      },
    },
    {
      name: "exploreReading",
      type: "group",
      label: "Explore today: read more",
      admin: {
        description:
          "Optionally link a published story or explainer under an activity. Which activities show, and their ratings, come from the forecast system.",
      },
      fields: EXPLORE_ACTIVITIES.map((activity) => ({
        name: copyFieldName(activity.value),
        label: activity.label,
        type: "relationship" as const,
        relationTo: ["stories", "questions"],
      })),
    },
    {
      name: "sectionCopy",
      type: "group",
      label: "Section wording",
      admin: {
        description:
          "Words only: figures and statuses come from the forecast system. Leave a field empty to keep the standard wording.",
      },
      fields: HOMEPAGE_SECTIONS.map((section) => ({
        name: copyFieldName(section.value),
        label: section.label,
        type: "group" as const,
        admin: { hideGutter: true },
        fields: [
          { name: "kicker", type: "text" as const, maxLength: 40 },
          { name: "title", type: "text" as const, maxLength: 80 },
          { name: "intro", type: "textarea" as const, maxLength: 240 },
        ],
      })),
    },
    {
      name: "hiddenSections",
      type: "select",
      hasMany: true,
      options: [...HOMEPAGE_SECTIONS],
      admin: { description: "Sections to hide from the homepage for now." },
    },
  ],
};
