import Link from "next/link";
import { ProductUpdateFeed } from "@/components/product-update-feed";
import { fetchPublishedContent } from "@/lib/cms";
import { contentToArticle } from "@/lib/editorial";

export async function GmsNews() {
  const result = await fetchPublishedContent("article", "latest");
  const posts = result.articles.slice(0, 5).map((content) => ({
    id: content.id,
    title: content.title,
    href: `/news/${content.slug}`,
    imageUrl: contentToArticle(content).imageUrl,
    summary: content.summary ?? content.body,
    issuedAt: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Grenada",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(content.updatedAt)),
    paragraphs: [content.summary ?? content.body],
    source: "Grenada Meteorological Service",
  }));
  return (
    <section className="mb-8 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="font-bold text-gm-navy text-heading-md">
          Latest from us
        </h2>
        <Link className="text-gm-blue underline" href="/updates">
          All updates
        </Link>
      </header>
      {result.status === "unavailable" ? (
        <p role="status">News cannot be retrieved right now.</p>
      ) : (
        <ProductUpdateFeed mobileCarousel posts={posts} />
      )}
      {result.status === "ok" && !posts.length && (
        <p>No published articles are available.</p>
      )}
    </section>
  );
}
