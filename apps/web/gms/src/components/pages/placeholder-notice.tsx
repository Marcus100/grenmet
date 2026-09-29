/**
 * Marks a page whose content is illustrative, not an operational product.
 *
 * These pages carry plausible Grenada-specific figures so the layout can be
 * reviewed as a real design. Nothing here comes from the forecast pipeline yet,
 * and a met service must never let sample values read as a live product — so
 * every standing page shows this until it is wired to `wxproducts`.
 */
export function PlaceholderNotice({
  compact = false,
  product,
}: {
  /** One line, for a sample section inside a page that is otherwise live. */
  compact?: boolean;
  product: string;
}) {
  if (compact) {
    return (
      <p
        className="mb-4 rounded border-gm-risk-yellow border-l-4 bg-gm-surface px-3 py-2 text-body-sm text-gm-text-secondary leading-body-sm"
        role="note"
      >
        <b className="text-gm-navy">
          Sample content — not an operational product.
        </b>{" "}
        {product} is not yet published from the GMS forecast system; do not use
        these figures for any decision.
      </p>
    );
  }
  return (
    <div
      className="mb-6 rounded border border-gm-risk-yellow bg-gm-surface p-4 lg:p-5"
      role="note"
    >
      <p className="font-bold text-body-base text-gm-navy leading-body-base">
        Sample content — not an operational product
      </p>
      <p className="mt-1 text-body text-gm-text-secondary leading-body">
        {product} is not yet published from the GMS forecast system. The figures
        on this page are illustrative and must not be used for any weather,
        marine or safety decision.
      </p>
    </div>
  );
}
