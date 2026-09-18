import type { ProductKind, StoredProduct } from "@barrelsgd/gms/products";
import { productTitle } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import type { ReactNode } from "react";

interface Props {
  error: string;
  issueDate: string;
  loading: boolean;
  onNew: () => void;
  onRetry: () => void;
  onSelect: (product: StoredProduct) => void;
  productKind: ProductKind;
  products: StoredProduct[];
}

export function ProductList({
  error,
  issueDate,
  loading,
  onNew,
  onRetry,
  onSelect,
  productKind,
  products,
}: Props) {
  const datedProducts = products.filter(
    (product) =>
      !product.values.issuedAt || product.values.issuedAt.startsWith(issueDate)
  );

  let content: ReactNode;
  if (loading) {
    content = <p role="status">Loading…</p>;
  } else if (error) {
    content = (
      <div role="status">
        <p>{error}</p>
        <Button onClick={onRetry} type="button" variant="outline">
          Retry
        </Button>
      </div>
    );
  } else if (datedProducts.length > 0) {
    content = (
      <ul className="flex flex-wrap gap-2">
        {datedProducts.map((product) => (
          <li key={product.id}>
            <Button
              onClick={() => onSelect(product)}
              type="button"
              variant="outline"
            >
              {product.values.issuedAt?.replace("T", " ") || "Undated draft"} ·{" "}
              {product.values.area || "No area"} · r{product.revision}
              {product.publishedRevision ? " · Published" : " · Draft"}
            </Button>
          </li>
        ))}
      </ul>
    );
  } else {
    content = (
      <p className="text-muted-foreground text-sm">
        No saved products of this type.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Saved products</h2>
      {content}
      <Button onClick={onNew} type="button" variant="outline">
        New {productTitle(productKind)}
      </Button>
    </div>
  );
}
