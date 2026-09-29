import type { CollectionBeforeChangeHook, Condition, Field } from "payload";
import { APIError } from "payload";
import { PUBLISH_KEYS } from "../access";
import { coverFields, topicsField } from "../fields/common";
import { editorialCollection } from "./editorial";

export const DISCOVER_TYPES = [
  { label: "On this day", value: "on-this-day" },
  { label: "Quiz", value: "quiz" },
  { label: "Did you know", value: "fact" },
  { label: "Sky note", value: "sky-note" },
] as const;
type DiscoverType = (typeof DISCOVER_TYPES)[number]["value"];

const when =
  (type: DiscoverType): Condition =>
  (data) =>
    data?.type === type;

/** Required only for its own entry type. */
const requiredFor =
  (type: DiscoverType, label: string) =>
  (value: unknown, { data }: { data: Record<string, unknown> }) =>
    data?.type !== type ||
    (value !== null && value !== undefined && value !== "") ||
    `${label} is required for this type.`;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ label, value: String(index + 1) }));

const onThisDayFields: Field[] = [
  {
    type: "row",
    admin: { condition: when("on-this-day") },
    fields: [
      {
        name: "day",
        type: "number",
        min: 1,
        max: 31,
        validate: requiredFor("on-this-day", "Day"),
      },
      {
        name: "month",
        type: "select",
        options: MONTHS,
        validate: requiredFor("on-this-day", "Month"),
      },
      {
        name: "year",
        type: "number",
        min: 1600,
        max: 2100,
        validate: requiredFor("on-this-day", "Year"),
      },
    ],
  },
  {
    name: "whatHappened",
    type: "textarea",
    maxLength: 280,
    admin: { condition: when("on-this-day") },
    validate: requiredFor("on-this-day", "What happened"),
  },
  {
    name: "story",
    type: "relationship",
    relationTo: "stories",
    admin: {
      condition: when("on-this-day"),
      description: "Optional: the story that tells it in full.",
    },
  },
];

const quizFields: Field[] = [
  {
    name: "intro",
    type: "textarea",
    maxLength: 200,
    admin: { condition: when("quiz") },
  },
  {
    name: "questions",
    type: "array",
    minRows: 0,
    maxRows: 8,
    admin: {
      condition: when("quiz"),
      description: "Three to eight questions.",
    },
    fields: [
      { name: "prompt", type: "text", required: true, maxLength: 160 },
      {
        name: "options",
        type: "array",
        minRows: 2,
        maxRows: 4,
        fields: [{ name: "text", type: "text", required: true, maxLength: 80 }],
      },
      {
        name: "correct",
        label: "Correct option (1–4)",
        type: "number",
        required: true,
        min: 1,
        max: 4,
      },
      { name: "explanation", type: "textarea", required: true, maxLength: 280 },
    ],
  },
];

const factFields: Field[] = [
  {
    name: "fact",
    type: "textarea",
    maxLength: 200,
    admin: { condition: when("fact") },
    validate: requiredFor("fact", "The fact"),
  },
  {
    type: "row",
    admin: { condition: when("fact") },
    fields: [
      {
        name: "source",
        type: "text",
        maxLength: 120,
        validate: requiredFor("fact", "Source"),
      },
      { name: "sourceUrl", type: "text", maxLength: 2000 },
    ],
  },
];

const skyNoteFields: Field[] = [
  {
    name: "note",
    type: "textarea",
    maxLength: 200,
    admin: {
      condition: when("sky-note"),
      description:
        'For example "The Perseids peak tonight; look north-east after midnight."',
    },
    validate: requiredFor("sky-note", "The note"),
  },
  {
    type: "row",
    admin: { condition: when("sky-note") },
    fields: [
      {
        name: "startsOn",
        type: "date",
        validate: requiredFor("sky-note", "Start date"),
      },
      {
        name: "endsOn",
        type: "date",
        validate: requiredFor("sky-note", "End date"),
      },
    ],
  },
];

/** Quizzes need 3–8 questions whose correct option exists. */
export const validateDiscover: CollectionBeforeChangeHook = ({ data }) => {
  if (data.type === "quiz") {
    const questions = (data.questions ?? []) as {
      correct?: number;
      options?: unknown[];
      prompt?: string;
    }[];
    if (questions.length < 3)
      throw new APIError("A quiz needs at least three questions.", 400);
    for (const [index, question] of questions.entries()) {
      const count = question.options?.length ?? 0;
      if (!question.correct || question.correct > count)
        throw new APIError(
          `Question ${index + 1}: the correct option must be one of its ${count} options.`,
          400
        );
    }
  }
  if (
    data.type === "sky-note" &&
    data.startsOn &&
    data.endsOn &&
    new Date(data.endsOn) < new Date(data.startsOn)
  )
    throw new APIError("The sky note ends before it starts.", 400);
  return data;
};

const base = editorialCollection({
  slug: "discover",
  prefix: "discover",
  dated: false,
  withLinks: false,
  publishKey: PUBLISH_KEYS.discover,
  labels: { singular: "Discover entry", plural: "Sky, history and fun" },
  admin: {
    group: "Homepage sections",
    defaultColumns: ["title", "type", "status", "updatedAt"],
    description:
      "Sky, history and a little fun: On this day, quizzes, Did you know facts and sky notes. Tonight's sun and moon times are calculated automatically.",
  },
  fields: [
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "on-this-day",
      options: [...DISCOVER_TYPES],
      admin: {
        description: "Choose first; the form shows that type's fields.",
      },
    },
    { name: "title", type: "text", required: true, maxLength: 120 },
    ...onThisDayFields,
    ...quizFields,
    ...factFields,
    ...skyNoteFields,
    ...coverFields(),
    topicsField,
  ],
});

export const Discover = {
  ...base,
  hooks: {
    ...base.hooks,
    beforeChange: [...(base.hooks?.beforeChange ?? []), validateDiscover],
  },
};
