import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductUpdateFeed } from "@/components/product-update-feed";
import { REFERENCE_POSTS } from "@/lib/editorial";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      REFERENCE_POSTS.find((post) => post.id === slug)?.title ??
      "Product update",
  };
}
export default async function UpdatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = REFERENCE_POSTS.find((item) => item.id === slug);
  if (!post) notFound();
  return (
    <div className="space-y-5">
      <p className="rounded-lg border p-4">
        A dated update based on the supplied GMS report of 8 September 2026.
        Check the current product pages for newer information.
      </p>
      <ProductUpdateFeed posts={[post]} />
      <Link className="underline" href="/products/forecasts">
        Current issued forecasts
      </Link>
    </div>
  );
}
