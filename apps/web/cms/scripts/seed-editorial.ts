/**
 * Starter editorial content, saved as "Ready for review" so GMS checks every
 * fact before publishing. Idempotent: an entry whose slug exists is skipped.
 *
 *   pnpm --filter @barrelsgd/web-cms seed:editorial
 *
 * Runs as the first CMS editor (or superuser), who becomes the author.
 */
import { getPayload } from "payload";
import { slugPart } from "../src/fields/slug";
import config from "../src/payload.config";
import { QUESTION_SEEDS } from "./seeds/questions";

export function lexical(paragraphs: string[]) {
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr" as const,
      format: "" as const,
      indent: 0,
      children: paragraphs.map((text) => ({
        type: "paragraph",
        version: 1,
        direction: "ltr" as const,
        format: "" as const,
        indent: 0,
        textFormat: 0,
        children: [
          {
            type: "text",
            version: 1,
            text,
            format: 0,
            detail: 0,
            mode: "normal",
            style: "",
          },
        ],
      })),
    },
  };
}

const payload = await getPayload({ config });
const editors = await payload.find({
  collection: "users",
  where: {
    or: [{ role: { equals: "editor" } }, { isSuperuser: { equals: true } }],
  },
  limit: 1,
  overrideAccess: true,
});
const user = editors.docs[0];
if (!user) {
  payload.logger.error(
    "No CMS editor yet. Sign in to the CMS once as a superuser or editor, then run this again."
  );
  process.exit(1);
}
const author = { ...user, collection: "users" as const };

let created = 0;
for (const seed of QUESTION_SEEDS) {
  // The same rule the CMS uses, so reruns find what they created.
  const slug = `questions/${slugPart(seed.question)}`;
  const existing = await payload.find({
    collection: "questions",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });
  if (existing.docs[0]) continue;
  await payload.create({
    collection: "questions",
    overrideAccess: true,
    draft: true,
    user: author,
    data: {
      question: seed.question,
      shortAnswer: seed.shortAnswer,
      body: lexical(seed.body),
      topics: seed.topics,
      relatedLinks: seed.links ?? [],
      status: "review",
      slug,
      author: user.id,
    },
  });
  created += 1;
}
payload.logger.info(`Seeded ${created} question(s) as Ready for review.`);
process.exit(0);
