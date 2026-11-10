import {
  isForecastKind,
  type ProductKind,
  productTitle,
} from "@barrelsgd/gms/products";
import Link from "next/link";
import { FreshnessNotice } from "@/components/freshness-notice";
import { ImportedWatch } from "@/components/pages/imported-watch";
import { validityNote } from "@/lib/freshness";
import { fetchPublishedProducts } from "@/lib/products";

/** Says when a listed product is no longer in effect (`validityNote`). */
function ValidityNotice({
  kind,
  now,
  validTo,
}: {
  kind: ProductKind;
  now: Date;
  validTo: string | undefined;
}) {
  const note = validityNote(validTo, now, {
    forecast: isForecastKind(kind),
    kinds: [kind],
  });
  return note ? <FreshnessNotice message={note} /> : null;
}

export async function PublishedProducts({ kinds }: { kinds: ProductKind[] }) {
  const now = new Date();
  const result = await fetchPublishedProducts(
    kinds.length === 1 ? kinds[0] : undefined
  );
  if (result.status === "unavailable")
    return (
      <p
        className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
        role="status"
      >
        Published product information cannot be retrieved right now. Check with
        the Grenada Meteorological Service for the latest information.
      </p>
    );
  const products = result.products.filter((product) =>
    kinds.includes(product.kind)
  );
  return (
    <div className="space-y-6">
      {kinds.map((kind) => {
        const issues = products.filter((product) => product.kind === kind);
        return (
          <section className="space-y-3" key={kind}>
            <h2 className="font-gm-display text-gm-heading text-heading-md leading-heading-md font-bold">
              {productTitle(kind)}
            </h2>
            {issues.length ? (
              <ul className="space-y-3">
                {issues.map((product) => (
                  <li
                    className="rounded-gm-card border-gm-border bg-background text-body leading-body flex flex-col gap-1 border p-4 lg:p-5"
                    key={product.id}
                  >
                    <Link
                      className="text-body-base text-gm-heading leading-body-base hover:text-gm-blue-ink font-bold underline underline-offset-4"
                      href={`/weather/issued/${product.id}`}
                    >
                      {productTitle(kind)} ·{" "}
                      {(product.values.issuedAt ?? "").replace("T", " ")}
                    </Link>
                    <p>{product.values.area}</p>
                    <p className="text-body-sm text-gm-text-secondary leading-body-sm font-mono">
                      Valid until{" "}
                      {(product.values.validTo ?? "").replace("T", " ")}{" "}
                      (Grenada time) · Revision {product.revision}
                    </p>
                    <ValidityNotice
                      kind={kind}
                      now={now}
                      validTo={product.values.validTo}
                    />
                    {product.kind === "marine-forecast" ? (
                      <ImportedWatch advisories={product.values.advisories} />
                    ) : null}
                    {product.values.notice ? (
                      <p>
                        {product.values.notice} · {product.values.level}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-base text-gm-text-secondary leading-body-base">
                No current published product is available in this category.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
