import { type ProductKind, productTitle } from "@barrelsgd/gms/products";
import Link from "next/link";
import { fetchPublishedProducts } from "@/lib/products";
export async function PublishedProducts({ kinds }: { kinds: ProductKind[] }) {
  const result = await fetchPublishedProducts(
    kinds.length === 1 ? kinds[0] : undefined
  );
  if (result.status === "unavailable")
    return (
      <p
        className="rounded-gm-card border border-gm-border p-4 text-body-base leading-body-base"
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
            <h2 className="font-bold font-gm-display text-gm-navy text-heading-md leading-heading-md">
              {productTitle(kind)}
            </h2>
            {issues.length ? (
              <ul className="space-y-3">
                {issues.map((product) => (
                  <li
                    className="flex flex-col gap-1 rounded-gm-card border border-gm-border bg-background p-4 text-body leading-body lg:p-5"
                    key={product.id}
                  >
                    <Link
                      className="font-bold text-body-base text-gm-navy leading-body-base underline underline-offset-4 hover:text-gm-blue-ink"
                      href={`/weather/issued/${product.id}`}
                    >
                      {productTitle(kind)} ·{" "}
                      {product.values.issuedAt.replace("T", " ")}
                    </Link>
                    <p>{product.values.area}</p>
                    <p className="font-mono text-body-sm text-gm-text-secondary leading-body-sm">
                      Valid until {product.values.validTo.replace("T", " ")}{" "}
                      (Grenada time) · Revision {product.revision}
                    </p>
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
