import { productTitle } from "@barrelsgd/gms/products";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Check, Clock } from "lucide-react";
import Link from "next/link";
import { grenadaToday, summarizeProducts } from "./home-data";
import { loadProducts } from "./home-loaders";
import { Panel, PanelUnavailable } from "./panel";

/** Local `YYYY-MM-DDTHH:mm` issue stamp → "05:30". */
function issueClock(issuedAt: string | null): string {
  return issuedAt?.slice(11, 16) ?? "";
}

export async function ProductsPanel({ className }: { className?: string }) {
  const products = await loadProducts();

  if (!products.ok) {
    return (
      <Panel
        className={className}
        description="Today's forecast suite"
        title="Product desk"
      >
        <PanelUnavailable message={products.message} />
      </Panel>
    );
  }

  const summary = summarizeProducts(products.data, grenadaToday());

  return (
    <Panel
      action={{ href: "/wxproducts/fcsts", label: "Open desk" }}
      className={className}
      description={`${summary.issued} of ${summary.expected} scheduled products issued`}
      title="Product desk"
    >
      <ul className="space-y-1.5">
        {summary.schedule.map((item) => (
          <li key={item.kind}>
            <Link
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={item.href}
            >
              <div
                className={
                  item.status === "issued"
                    ? "flex size-7 items-center justify-center rounded-lg bg-success/15 text-success"
                    : "flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                }
              >
                {item.status === "issued" ? (
                  <Check className="size-4" />
                ) : (
                  <Clock className="size-4" />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.title}
              </span>
              {item.status === "issued" ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {issueClock(item.issuedAt)}
                </span>
              ) : (
                <Badge variant="light-warning">Pending</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {summary.bulletins.length > 0 ? (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground text-xs">Live bulletins</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.bulletins.map((bulletin) => (
              <Badge key={bulletin.id} variant="light-info">
                {productTitle(bulletin.kind)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
