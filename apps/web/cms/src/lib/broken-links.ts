import type { Payload, PayloadHandler } from "payload";
import { isEditor } from "../access";
import { getEnv } from "../env";
import { type EditorialLink, editorialLinksSchema } from "./editorial-links";
import { checkLink, type LinkCheck } from "./link-titles";

/** Collections whose related links the report checks. */
export const LINK_SOURCES = [
  "desk-updates",
  "stories",
  "report-notes",
  "questions",
  "live-posts",
] as const;
type LinkSource = (typeof LINK_SOURCES)[number];

const TITLE_FIELD: Record<LinkSource, "question" | "title"> = {
  "desk-updates": "title",
  stories: "title",
  "report-notes": "title",
  questions: "question",
  "live-posts": "title",
};

export interface BrokenLink {
  collection: LinkSource;
  documentId: string;
  /** Why the link no longer works, in plain words. */
  reason: string;
  /** Published items are on the site; the rest are only in the CMS. */
  status: string;
  title: string;
  type: EditorialLink["type"];
  url: string;
}

export interface BrokenLinkReport {
  broken: BrokenLink[];
  /** Distinct destinations answered by the forecast system or the menu. */
  checked: number;
  checkedAt: string;
  /** Destinations that could not be asked; they are not claimed broken. */
  unreachable: number;
}

const REASON: Record<EditorialLink["type"], string> = {
  product: "The weather product is withdrawn or was never issued.",
  cap: "The warning is withdrawn or is not published.",
  page: "The GMS page no longer exists.",
  link: "",
};

interface Item {
  collection: LinkSource;
  documentId: string;
  links: EditorialLink[];
  status: string;
  title: string;
}

/** Every stored item with a GMS product, warning or page in its links. */
async function linkedItems(payload: Payload): Promise<Item[]> {
  const items: Item[] = [];
  for (const collection of LINK_SOURCES) {
    const result = await payload.find({
      collection,
      overrideAccess: true,
      depth: 0,
      pagination: false,
    });
    for (const doc of result.docs) {
      const row = doc as unknown as Record<string, unknown>;
      const parsed = editorialLinksSchema.safeParse(row.relatedLinks ?? []);
      if (!parsed.success) continue;
      const links = parsed.data.filter((link) => link.type !== "link");
      if (links.length === 0) continue;
      items.push({
        collection,
        documentId: String(row.id),
        links,
        status: String(row.status ?? "draft"),
        title: String(row[TITLE_FIELD[collection]] ?? row.slug ?? row.id),
      });
    }
  }
  return items;
}

/**
 * Lists related links whose GMS product, warning or page is withdrawn or
 * missing. Each destination is asked once, with the same lookups the editor
 * uses to name a link, so the report and the editor agree.
 */
export async function findBrokenLinks(
  payload: Payload,
  {
    baseURL,
    fetcher = fetch,
    now = new Date(),
  }: { baseURL: string; fetcher?: typeof fetch; now?: Date }
): Promise<BrokenLinkReport> {
  const items = await linkedItems(payload);
  const answers = new Map<string, Promise<LinkCheck>>();
  const answerFor = (link: EditorialLink) => {
    const key = `${link.type}:${link.ref ?? link.url}`;
    let answer = answers.get(key);
    if (!answer) {
      answer = checkLink(link, baseURL, fetcher);
      answers.set(key, answer);
    }
    return answer;
  };

  const broken: BrokenLink[] = [];
  for (const item of items) {
    for (const link of item.links) {
      const { state } = await answerFor(link);
      if (state !== "gone") continue;
      broken.push({
        collection: item.collection,
        documentId: item.documentId,
        status: item.status,
        title: item.title,
        reason: REASON[link.type],
        type: link.type,
        url: link.url,
      });
    }
  }
  const states = await Promise.all(
    [...answers.values()].map(async (answer) => (await answer).state)
  );
  return {
    checkedAt: now.toISOString(),
    checked: states.filter((state) => state !== "unknown").length,
    broken,
    unreachable: states.filter((state) => state === "unknown").length,
  };
}

/**
 * `GET /api/broken-links`: editors only. Lists related links that no longer
 * lead anywhere, so they can be fixed before readers hit them.
 */
export const brokenLinksEndpoint: PayloadHandler = async (req) => {
  if (!isEditor(req.user))
    return Response.json({ error: "Not allowed" }, { status: 403 });
  const report = await findBrokenLinks(req.payload, {
    baseURL: getEnv().AUTH_API_URL,
  });
  return Response.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
};
