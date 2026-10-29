import type { GlobalConfig } from "payload";
import { HOMEPAGE_KEY, hasPermission } from "../access";

export const HOMEPAGE_SECTIONS = [
  { label: "Weather now", value: "weather-now" },
  { label: "From the Desk", value: "desk" },
  { label: "News", value: "stories" },
  { label: "Questions about the weather", value: "questions" },
  { label: "Discover", value: "discover" },
  { label: "Latest reports", value: "reports" },
  { label: "Explore today", value: "explore-today" },
  { label: "Grenada in data", value: "grenada-in-data" },
] as const;

/** Hide a homepage section for now; what leads a section is set on the posts. */
export const Homepage: GlobalConfig = {
  slug: "homepage",
  label: "Hide homepage sections",
  admin: {
    group: "GMS Content",
    description:
      "Hide a homepage section for now, for example during a hurricane. What leads a section is set on the posts themselves: Lead story on Stories, Featured on Questions.",
  },
  access: {
    read: () => true,
    update: ({ req }) => hasPermission(req.user, HOMEPAGE_KEY),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { max: 20 },
  fields: [
    {
      name: "hiddenSections",
      type: "select",
      hasMany: true,
      options: [...HOMEPAGE_SECTIONS],
      admin: { description: "Sections to hide from the homepage for now." },
    },
  ],
};
