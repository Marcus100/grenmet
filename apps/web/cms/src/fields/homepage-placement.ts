import type { Field, FieldAccess, Payload, PayloadRequest } from "payload";
import { HOMEPAGE_KEY, hasPermission } from "../access";

/** How many featured questions the homepage shows. */
export const MAX_FEATURED_QUESTIONS = 5;

const homepageEditors: FieldAccess = ({ req }) =>
  hasPermission(req.user, HOMEPAGE_KEY);

interface Check {
  id?: number | string;
  req: PayloadRequest;
}

/** Other published posts already holding the placement, newest first. */
function holders(
  payload: Payload,
  collection: "stories" | "questions",
  flag: "leadOnHomepage" | "featured",
  id: number | string | undefined
) {
  return payload.find({
    collection,
    depth: 0,
    limit: MAX_FEATURED_QUESTIONS + 1,
    overrideAccess: true,
    pagination: false,
    sort: "-publishedAt",
    where: {
      and: [
        { [flag]: { equals: true } },
        { status: { equals: "published" } },
        ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
      ],
    },
  });
}

/**
 * "Lead story on the homepage": the one large story at the top of Stories.
 * Only one story can lead, so ticking it while another leads says which.
 */
export const leadStoryField: Field = {
  name: "leadOnHomepage",
  type: "checkbox",
  label: "Lead story on the homepage",
  defaultValue: false,
  access: { create: homepageEditors, update: homepageEditors },
  admin: {
    position: "sidebar",
    description:
      "The large story at the top of Stories. Leave unticked to show the newest.",
  },
  validate: async (value: unknown, { id, req }: Check) => {
    if (value !== true) return true;
    const { docs } = await holders(
      req.payload,
      "stories",
      "leadOnHomepage",
      id
    );
    const other = docs[0] as { title?: string } | undefined;
    return other
      ? `"${other.title ?? "Another story"}" already leads. Untick it first.`
      : true;
  },
};

/**
 * "Featured question": the questions the homepage shows first, in order,
 * up to five. The rest follow, newest first.
 */
export const featuredQuestionFields: Field[] = [
  {
    name: "featured",
    type: "checkbox",
    label: "Featured on the homepage",
    defaultValue: false,
    access: { create: homepageEditors, update: homepageEditors },
    admin: {
      position: "sidebar",
      description: `Shown first in Questions about the weather (up to ${MAX_FEATURED_QUESTIONS}).`,
    },
    validate: async (value: unknown, { id, req }: Check) => {
      if (value !== true) return true;
      const { docs } = await holders(req.payload, "questions", "featured", id);
      return docs.length >= MAX_FEATURED_QUESTIONS
        ? `${MAX_FEATURED_QUESTIONS} questions are already featured. Untick one first.`
        : true;
    },
  },
  {
    name: "featuredOrder",
    type: "number",
    label: "Featured order",
    access: { create: homepageEditors, update: homepageEditors },
    admin: {
      position: "sidebar",
      description:
        "1 is first. Questions without a number follow, newest first.",
      condition: (_data, sibling) => sibling?.featured === true,
    },
    min: 1,
    max: MAX_FEATURED_QUESTIONS,
  },
];
