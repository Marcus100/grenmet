import type { ProductKind, StoredProduct } from "@barrelsgd/gms/products";
import { productTitle } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Plus } from "lucide-react";

interface Props {
  error: string;
  issueDate: string;
  loading: boolean;
  onNew: () => void;
  onRetry: () => void;
  onSelect: (product: StoredProduct) => void;
  productKind: ProductKind;
  products: StoredProduct[];
  selectedId?: string;
}

function productLabel(product: StoredProduct) {
  const issued = product.values.issuedAt?.slice(11, 16) || "Undated";
  const status = product.publishedRevision ? "Published" : "Draft";
  return `${issued} · ${product.values.area || "No area"} · r${product.revision} · ${status}`;
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
  selectedId,
}: Props) {
  const datedProducts = products.filter(
    (product) =>
      !product.values.issuedAt || product.values.issuedAt.startsWith(issueDate)
  );
  let placeholder = "Choose a saved product…";
  if (loading) placeholder = "Loading…";
  else if (error) placeholder = "Could not load saved products";
  else if (datedProducts.length === 0)
    placeholder = "No saved products for this date";

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="saved-products">Saved products</FieldLabel>
          <NativeSelect
            className="w-full"
            disabled={loading || Boolean(error) || datedProducts.length === 0}
            id="saved-products"
            onChange={(event) => {
              const product = datedProducts.find(
                (item) => item.id === event.target.value
              );
              if (product) onSelect(product);
            }}
            value={selectedId ?? ""}
          >
            <NativeSelectOption value="">{placeholder}</NativeSelectOption>
            {datedProducts.map((product) => (
              <NativeSelectOption key={product.id} value={product.id}>
                {productLabel(product)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Button
          aria-label={`New ${productTitle(productKind)}`}
          onClick={onNew}
          type="button"
          variant="outline"
        >
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>
      {error ? (
        <div className="flex items-center gap-2 text-sm" role="status">
          <span className="text-destructive">{error}</span>
          <Button onClick={onRetry} size="sm" type="button" variant="link">
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
