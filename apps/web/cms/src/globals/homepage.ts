import type { GlobalConfig } from "payload";
import { HOMEPAGE_KEY, hasPermission } from "../access";

export const HOMEPAGE_SECTIONS = [
  { label: "Weather now", value: "weather-now" },
  { label: "From the Desk", value: "desk" },
  { label: "Stories", value: "stories" },
  { label: "Questions about the weather", value: "questions" },
  { label: "Sky, history and a little fun", value: "discover" },
  { label: "Latest reports", value: "reports" },
] as const;

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
      name: "hiddenSections",
      type: "select",
      hasMany: true,
      options: [...HOMEPAGE_SECTIONS],
      admin: { description: "Sections to hide from the homepage for now." },
    },
  ],
};
