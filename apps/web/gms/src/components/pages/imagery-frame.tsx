/**
 * Stands in for a radar or satellite loop until an imagery source is wired.
 * Deliberately empty rather than a sample image — a stale or invented weather
 * image is worse than none on a met service site.
 */
export function ImageryFrame({
  caption,
  label,
}: {
  caption: string;
  label: string;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex aspect-[4/3] items-center justify-center rounded border border-gm-border bg-gm-surface">
        <p className="px-6 text-center text-body-sm text-gm-text-muted leading-body-sm">
          {label}
        </p>
      </div>
      <figcaption className="text-gm-text-muted text-label leading-label">
        {caption}
      </figcaption>
    </figure>
  );
}
