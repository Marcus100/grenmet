import type { GlobalConfig } from "payload";

/**
 * Legacy. The duty forecaster's note moved to Live posts (kind "note") on
 * 29 Oct 2026, and the data copy is `20261029_030000_duty_note_to_live_posts`.
 * This table stays in the database, unchanged, because dropping a table needs
 * the owner's approval. The global is kept only so the schema matches the
 * database: it is hidden from the admin and nobody can read or write it.
 */
export const WeatherNow: GlobalConfig = {
  slug: "weather-now",
  label: "Duty forecaster's note (legacy)",
  admin: { hidden: true },
  access: {
    read: () => false,
    update: () => false,
  },
  versions: { max: 50 },
  fields: [
    {
      name: "note",
      type: "group",
      label: "Forecaster's note",
      fields: [
        { name: "text", type: "textarea", maxLength: 280 },
        { name: "alertUrl", label: "CAP alert link", type: "text" },
        { name: "expiresAt", type: "date" },
        { name: "postedAt", type: "date" },
        { name: "postedBy", type: "relationship", relationTo: "users" },
      ],
    },
  ],
};
