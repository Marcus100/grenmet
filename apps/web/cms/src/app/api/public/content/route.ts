import { getPayload } from "payload";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

const SECTIONS = new Set([
  "latest-from-us",
  "weather-news",
  "latest-publications",
]);
const LEGACY_PLACEMENTS = new Set(["latest", "news"]);

function sectionForPlacement(placement: string | null) {
  if (placement === "latest") return "latest-from-us";
  if (placement === "news") return "weather-news";
}

interface LexicalNode {
  children?: LexicalNode[];
  text?: string;
  type?: string;
}

function lexicalText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as LexicalNode;
  if (typeof value.text === "string") return value.text;
  const content = Array.isArray(value.children)
    ? value.children.map(lexicalText).join("")
    : "";
  return ["heading", "listitem", "paragraph", "quote"].includes(
    value.type ?? ""
  )
    ? `${content}\n\n`
    : content;
}

function bodyToText(body: unknown): string {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return "";
  return lexicalText((body as { root?: unknown }).root).trim();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug");
  const section = url.searchParams.get("section");
  const placement = url.searchParams.get("placement");
  if (section && !SECTIONS.has(section))
    return Response.json({ error: "Unknown section" }, { status: 400 });
  if (placement && !LEGACY_PLACEMENTS.has(placement))
    return Response.json({ error: "Unknown placement" }, { status: 400 });
  const legacySection = sectionForPlacement(placement);
  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "content",
      overrideAccess: false,
      depth: 1,
      limit: slug ? 1 : 20,
      sort: "-updatedAt",
      where: {
        status: { equals: "published" },
        ...(section || legacySection
          ? { section: { equals: section ?? legacySection } }
          : {}),
        ...(slug ? { slug: { equals: slug } } : {}),
      },
    });
    const articles = result.docs.map((doc) => ({
      id: String(doc.id),
      title: doc.title,
      slug: doc.slug,
      section: doc.section ?? null,
      summary: doc.summary ?? null,
      body: bodyToText(doc.body),
      imageUrl: typeof doc.image === "object" ? (doc.image?.url ?? null) : null,
      updatedAt: doc.updatedAt,
    }));
    return Response.json(
      { articles },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { error: "Content is unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
