import Link from "next/link";
import { ProductUpdateFeed } from "@/components/product-update-feed";
import { productPost, REFERENCE_POSTS } from "@/lib/editorial";
import { env } from "@/lib/env";
import { fetchPublishedProducts } from "@/lib/products";
export async function GmsNews() {
  const result = await fetchPublishedProducts();
  const reference = !env.WXPRODUCTS_API_URL;
  const posts = reference
    ? REFERENCE_POSTS
    : result.products.slice(0, 5).map(productPost);
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
      {!reference && result.status === "unavailable" ? (
        <p role="status">Issued updates cannot be retrieved right now.</p>
      ) : (
        <ProductUpdateFeed mobileCarousel posts={posts} />
      )}
      {!reference && result.status === "ok" && !posts.length ? (
        <p>No current product updates are available.</p>
      ) : null}
    </section>
  );
}
