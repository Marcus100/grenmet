/** Shown instead of figures when the weather feed returns nothing or fails. */
export function UnavailableNotice({ product }: { product: string }) {
  return (
    <p
      className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
      role="status"
    >
      {product} cannot be retrieved right now. Check with the Grenada
      Meteorological Service for the latest information.
    </p>
  );
}
