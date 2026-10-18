/** Shown instead of figures when the weather feed returns nothing or fails. */
export function UnavailableNotice({ product }: { product: string }) {
  return (
    <p
      className="rounded-gm-card border border-gm-border p-4 text-body-base leading-body-base"
      role="status"
    >
      {product} cannot be retrieved right now. Check with the Grenada
      Meteorological Service for the latest information.
    </p>
  );
}
