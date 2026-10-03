import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import { notFound } from "next/navigation";
import { fetchPublishedProduct } from "@/lib/products";
export const metadata = { title: "Issued product" };
export const dynamic = "force-dynamic";
export default async function IssuedProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchPublishedProduct(id);
  if (result.status === "unavailable")
    return (
      <p className="py-6 text-body-base leading-body-base" role="status">
        This product cannot be retrieved right now. Please check with GMS for
        the latest information.
      </p>
    );
  if (result.status === "not-found") notFound();
  const { product } = result;
  return (
    <div className="space-y-6 pt-3 lg:pt-4">
      {!product.current && (
        <p
          className="rounded-gm-card border border-gm-border bg-gm-surface p-3 font-semibold text-body text-gm-heading leading-body"
          role="note"
        >
          This product is no longer in force. It is kept for reference; see the
          latest issued products for current information.
        </p>
      )}
      <p className="font-mono text-body-sm text-gm-text-secondary leading-body-sm">
        Grenada Meteorological Service · Published {product.publishedAt} ·
        Revision {product.revision}
      </p>
      {/* A printable paper: stays light in dark mode (gm-paper). */}
      <div className="gm-paper rounded-gm-card">
        <ProductContentView content={product} />
      </div>
    </div>
  );
}
