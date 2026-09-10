import { getPayload } from "payload";
import config from "../../../../payload.config";

export const dynamic = "force-dynamic";

const KINDS = new Set(["article", "page"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");
  if (kind && !KINDS.has(kind))
    return Response.json({ error: "Unknown content kind" }, { status: 400 });
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
        ...(kind ? { kind: { equals: kind } } : {}),
        ...(slug ? { slug: { equals: slug } } : {}),
      },
    });
    const articles = result.docs.map((doc) => ({
      id: String(doc.id),
      title: doc.title,
      slug: doc.slug,
      kind: doc.kind,
      summary: doc.summary ?? null,
      body: doc.body,
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
