import { ProductContentView } from "@barrelsgd/gms/components/product-content";
import { notFound } from "next/navigation";
import { fetchPublishedProducts } from "@/lib/products";
export const metadata = { title: "Issued product" };
export const dynamic = "force-dynamic";
export default async function IssuedProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await fetchPublishedProducts();
  if (result.status === "unavailable")
    return (
      <p role="status">
        This product cannot be retrieved right now. Please check with GMS for
        the latest information.
      </p>
    );
  const product = result.products.find((item) => item.id === id);
  if (!product) notFound();
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Grenada Meteorological Service · Published {product.publishedAt} ·
        Revision {product.revision}
      </p>
      <ProductContentView content={product} />
    </div>
  );
}
