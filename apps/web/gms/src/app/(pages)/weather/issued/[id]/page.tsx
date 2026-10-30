import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import { notFound } from "next/navigation";
import { Provenance } from "@/components/pages/provenance";
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
      <p className="text-body-base leading-body-base py-6" role="status">
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
          className="rounded-gm-card border-gm-border bg-gm-surface text-body text-gm-heading leading-body border p-3 font-semibold"
          role="note"
        >
          This product is no longer in force. It is kept for reference; see the
          latest issued products for current information.
        </p>
      )}
      <p className="text-body-sm text-gm-text-secondary leading-body-sm font-mono">
        Grenada Meteorological Service · Published {product.publishedAt} ·
        Revision {product.revision}
      </p>
      {product.current &&
        ["morning", "midday", "evening"].includes(product.kind) && (
          <Provenance
            kind="forecast"
            source="Grenada Meteorological Service forecast"
            status="verified"
            time={product.values.issuedAt ?? product.publishedAt}
          />
        )}
      {/* A printable paper: stays light in dark mode (gm-paper). */}
      <div className="gm-paper rounded-gm-card">
        <ProductContentView content={product} />
      </div>
    </div>
  );
}
