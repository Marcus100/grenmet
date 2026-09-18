import Link from "next/link";
import { ProductDesk } from "@/components/wxproducts/product-desk";
import { ArchiveBrowser } from "@/components/wxwatch/archive-browser";
import { getArchive, getArchiveHistory } from "@/db/wxwatch/queries";

export const metadata = { title: "NHC Products" };
export const dynamic = "force-dynamic";

export default async function NhcProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const editor = raw.view === "editor";
  return (
    <div className="space-y-6">
      <nav aria-label="NHC Products views" className="flex gap-4">
        <Link
          aria-current={editor ? undefined : "page"}
          className="underline"
          href="/wxproducts/nhc"
        >
          NHC guidance
        </Link>
        <Link
          aria-current={editor ? "page" : undefined}
          className="underline"
          href="/wxproducts/nhc?view=editor"
        >
          Outlook editor
        </Link>
      </nav>
      {editor ? (
        <ProductDesk kinds={["outlook"]} title="Outlook editor" />
      ) : (
        await guidance(raw)
      )}
    </div>
  );
}

async function guidance(raw: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams({ source: "nhc" });
  for (const key of ["product", "start", "end", "unknown_time", "offset"]) {
    const value = raw[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  const edition = typeof raw.edition === "string" ? raw.edition : undefined;
  const offset =
    typeof raw.history_offset === "string" ? raw.history_offset : "0";
  try {
    const [archive, history] = await Promise.all([
      getArchive(params),
      edition ? getArchiveHistory(edition, offset) : Promise.resolve(null),
    ]);
    return (
      <ArchiveBrowser
        archive={archive}
        edition={edition}
        history={history}
        nhcOnly
        query={params.toString()}
      />
    );
  } catch {
    return (
      <div className="space-y-3">
        <p role="alert">
          NHC guidance unavailable. Check the date filters or try again.
        </p>
        <Link className="underline" href="/wxproducts/nhc">
          Reset guidance filters
        </Link>
        <p>The outlook editor is still available above.</p>
      </div>
    );
  }
}
