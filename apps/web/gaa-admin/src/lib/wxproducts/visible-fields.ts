import {
  displayProductFields,
  type ProductField,
  type ProductKind,
} from "@barrelsgd/gms/products";

/** Presentation filtering only; FastAPI owns publication validation. */
export function visibleProductFields(kind: ProductKind): ProductField[] {
  return displayProductFields(kind);
}
