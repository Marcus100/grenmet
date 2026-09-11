import { type ProductKind, productTitle } from "@barrelsgd/gms/products";
import Link from "next/link";
import { fetchPublishedProducts } from "@/lib/products";
export async function PublishedProducts({ kinds }: { kinds: ProductKind[] }) {
  const result = await fetchPublishedProducts(
    kinds.length === 1 ? kinds[0] : undefined
  );
  if (result.status === "unavailable")
    return (
      <p className="rounded-lg border p-4" role="status">
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
            <h2 className="font-semibold text-xl">{productTitle(kind)}</h2>
            {issues.length ? (
              <ul className="space-y-3">
                {issues.map((product) => (
                  <li
                    className="rounded-lg border bg-card p-4"
                    key={product.id}
                  >
                    <Link
                      className="font-semibold underline underline-offset-4"
                      href={`/products/issued/${product.id}`}
                    >
                      {productTitle(kind)} ·{" "}
                      {product.values.issuedAt.replace("T", " ")}
                    </Link>
                    <p>{product.values.area}</p>
                    <p className="text-muted-foreground text-sm">
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
              <p className="text-muted-foreground">
                No current published product is available in this category.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
