import type { Route } from "next";
import Link from "next/link";

/**
 * Says plainly that a page's product is not published by GMS yet.
 *
 * Owner rule (18 Oct 2026): the public site never shows invented or sample
 * figures. A page whose product is not wired to a real source keeps its
 * structure and educational text, and this notice stands where the data will
 * go. Never put placeholder numbers beside it.
 */
export const NOT_YET_AVAILABLE = "Not yet available from GMS";

export function PlaceholderNotice({
  compact = false,
  product,
  source,
}: {
  /** One line, for a section inside a page that is otherwise live. */
  compact?: boolean;
  /** What the page will show, e.g. "Tide predictions". */
  product: string;
  /** A live page or authoritative source to use in the meantime. */
  source?: { href: string; label: string };
}) {
  const line = (
    <>
      {product} will appear here once GMS publishes it.
      {source && (
        <>
          {" "}
          Meanwhile, see{" "}
          <Link
            className="font-semibold text-gm-blue-ink underline"
            href={source.href as Route}
          >
            {source.label}
          </Link>
          .
        </>
      )}
    </>
  );
  if (compact) {
    return (
      <p
        className="mb-4 rounded border-gm-risk-yellow border-l-4 bg-gm-surface px-3 py-2 text-body-sm text-gm-text-secondary leading-body-sm"
        role="note"
      >
        <b className="text-gm-heading">{NOT_YET_AVAILABLE}.</b> {line}
      </p>
    );
  }
  return (
    <div
      className="mb-6 rounded-gm-card border border-gm-risk-yellow bg-gm-surface p-4 lg:p-5"
      role="note"
    >
      <p className="font-bold text-body-base text-gm-heading leading-body-base">
        {NOT_YET_AVAILABLE}
      </p>
      <p className="mt-1 text-body text-gm-text-secondary leading-body">
        {line}
      </p>
    </div>
  );
}
