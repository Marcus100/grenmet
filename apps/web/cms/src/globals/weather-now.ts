import type { GlobalBeforeChangeHook, GlobalConfig } from "payload";
import { hasPermission, staffField, WEATHER_NOW_NOTE_KEY } from "../access";
import { assertNoUnlinkedHazard } from "../fields/hazard-guard";
import { nextIssueSlot } from "../lib/issue-slots";

const EDITOR_KEY = "cms.article.manage";
const HTTP_URL = /^https?:\/\/[^\s@]+$/;

/**
 * A new note is signed and timed automatically and, unless the forecaster
 * sets its own, expires at the next forecast issue. Warning language needs
 * the CAP alert link.
 */
export const stampNote: GlobalBeforeChangeHook = ({
  data,
  originalDoc,
  req,
}) => {
  const note = data.note ?? {};
  const before = originalDoc?.note ?? {};
  const text = typeof note.text === "string" ? note.text.trim() : "";
  if (!text) {
    data.note = {
      text: "",
      alertUrl: null,
      postedAt: null,
      expiresAt: null,
      postedBy: null,
    };
    return data;
  }
  assertNoUnlinkedHazard([text], Boolean(note.alertUrl));
  if (text !== (before.text ?? "").trim()) {
    const now = new Date();
    note.postedAt = now.toISOString();
    note.postedBy = req.user?.id ?? null;
    const requested = note.expiresAt ? new Date(note.expiresAt) : null;
    note.expiresAt = (
      requested &&
      requested > now &&
      requested.toISOString() !== before.expiresAt
        ? requested
        : nextIssueSlot(now)
    ).toISOString();
  }
  note.text = text;
  data.note = note;
  return data;
};

/** "Weather now": the duty forecaster's note. Imagery is FastAPI data. */
export const WeatherNow: GlobalConfig = {
  slug: "weather-now",
  label: "Weather now",
  admin: {
    group: "Homepage sections",
    description:
      "The duty forecaster's short note on the homepage. The note is a plain-words aside, never a forecast or a warning.",
  },
  access: {
    read: () => true,
    update: ({ req }) =>
      hasPermission(req.user, WEATHER_NOW_NOTE_KEY) ||
      hasPermission(req.user, EDITOR_KEY),
    readVersions: ({ req }) => Boolean(req.user),
  },
  versions: { max: 50 },
  hooks: { beforeChange: [stampNote] },
  fields: [
    {
      name: "note",
      type: "group",
      label: "Forecaster's note",
      fields: [
        {
          name: "text",
          type: "textarea",
          maxLength: 280,
          admin: {
            description:
              "Two or three plain sentences, e.g. what to expect this afternoon. Published as soon as you save. Clear it to remove the note.",
          },
        },
        {
          name: "alertUrl",
          label: "CAP alert link",
          type: "text",
          maxLength: 2000,
          admin: {
            description:
              "Required only if the note mentions a warning, watch or advisory.",
          },
          validate: (value: unknown) =>
            !value ||
            (typeof value === "string" && HTTP_URL.test(value)) ||
            "Use a full HTTP or HTTPS link.",
        },
        {
          name: "expiresAt",
          type: "date",
          admin: {
            date: { pickerAppearance: "dayAndTime" },
            description:
              "Defaults to the next forecast issue (07:00, 12:00 or 18:00).",
          },
        },
        { name: "postedAt", type: "date", admin: { readOnly: true } },
        {
          name: "postedBy",
          type: "relationship",
          relationTo: "users",
          admin: { readOnly: true },
          access: { read: staffField },
        },
      ],
    },
  ],
};
