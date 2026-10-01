import { isProductKind, productTitle } from "@barrelsgd/gms/products";
import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { fetchPublishedProduct } from "@/lib/products";
import { cn } from "@/lib/utils";

/** The first issued sentence a reader would want: forecast, notice, outlook. */
const LEAD_FIELDS = ["summary", "notice", "formation", "systems"];

const time = (value: string | undefined) => value?.replace("T", " ");

/**
 * An official product attached to an editorial post. Its words and figures
 * are read live from FastAPI; the CMS stores only the product id. Status chips
 * are neutral, never hazard colours.
 */
export async function LinkedProduct({
  productId,
  className,
}: {
  className?: string;
  productId: string;
}) {
  const result = await fetchPublishedProduct(productId);
  const frame = cn(
    "flex flex-col gap-2 rounded-gm-card border border-gm-border bg-gm-surface p-4",
    className
  );
  if (result.status !== "ok") {
    return (
      <p className={frame} role="status">
        {result.status === "not-found"
          ? "The product this post refers to has been withdrawn."
          : "The product this post refers to can't be loaded right now."}{" "}
        <Link className="text-gm-blue-ink underline" href="/weather/issued">
          See issued products
        </Link>
      </p>
    );
  }
  const { product } = result;
  const title = isProductKind(product.kind)
    ? productTitle(product.kind)
    : "Issued product";
  const lead = LEAD_FIELDS.map((key) => product.values[key]).find(Boolean);
  const validTo = time(product.values.validTo);
  return (
    <aside aria-label={`Official product: ${title}`} className={frame}>
      <p className="flex flex-wrap items-center gap-2 font-bold text-gm-heading text-label uppercase leading-label tracking-wider">
        <ShieldCheckIcon aria-hidden="true" className="size-4" />
        Official product
        <span className="rounded-full bg-gm-surface-panel px-2 py-0.5 font-bold text-caption normal-case leading-caption tracking-normal">
          {product.current ? "In force" : "No longer in force"}
        </span>
      </p>
      <p className="font-bold text-body-base text-gm-heading leading-body-base">
        {title}
        {product.values.issuedAt && ` · ${time(product.values.issuedAt)}`}
      </p>
      {lead && (
        <p className="line-clamp-3 max-w-prose text-body leading-body">
          {lead}
        </p>
      )}
      {validTo && (
        <p className="font-mono text-body-sm text-gm-text-secondary leading-body-sm">
          Valid until {validTo} (Grenada time)
        </p>
      )}
      <Link
        className="w-fit font-semibold text-body text-gm-blue-ink leading-body underline"
        href={`/weather/issued/${product.id}`}
      >
        Read the product
      </Link>
    </aside>
  );
}
