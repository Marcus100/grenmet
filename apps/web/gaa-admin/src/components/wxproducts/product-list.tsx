import type { ProductKind, StoredProduct } from "@barrelsgd/gms/products";
import { productTitle } from "@barrelsgd/gms/products";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { Plus } from "lucide-react";

interface Props {
  error: string;
  loading: boolean;
  onNew: () => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onSelect: (product: StoredProduct) => void;
  page: number;
  productKind: ProductKind;
  products: StoredProduct[];
  selectedId?: string;
}

function publicationStatus(product: StoredProduct) {
  if (!product.publishedRevision) return "Draft";
  return product.publishedRevision === product.revision
    ? "Published"
    : "Draft changes";
}

export function ProductList({
  error,
  loading,
  onNew,
  onRetry,
  onSelect,
  onPageChange,
  page,
  productKind,
  products,
  selectedId,
}: Props) {
  return (
    <section aria-label="Saved products" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-sm">Saved products</h2>
          <p className="text-muted-foreground text-xs">
            All dates and product types you can access · newest updates first
          </p>
        </div>
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
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table aria-busy={loading} aria-label="Saved products archive">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Issued (Grenada)</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} role="status">
                    Loading saved products…
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading && products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    No saved products on this page.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                products.map((product) => (
                  <TableRow
                    data-state={
                      selectedId === product.id ? "selected" : undefined
                    }
                    key={product.id}
                  >
                    <TableCell>{productTitle(product.kind)}</TableCell>
                    <TableCell className="tabular-nums">
                      {product.values.issuedAt?.replace("T", " ") || "Undated"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {product.revision}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {publicationStatus(product)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-label={`Open ${productTitle(product.kind)} ${product.values.issuedAt || "undated"}`}
                        onClick={() => onSelect(product)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={loading || page === 0}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <span className="text-muted-foreground text-sm">Page {page + 1}</span>
        <Button
          disabled={loading || Boolean(error) || products.length < 50}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </section>
  );
}
