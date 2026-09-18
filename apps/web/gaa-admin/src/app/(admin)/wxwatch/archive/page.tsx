import Link from "next/link";
import { ArchiveBrowser } from "@/components/wxwatch/archive-browser";
import { getArchive, getArchiveHistory } from "@/db/wxwatch/queries";

export const dynamic = "force-dynamic";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of [
    "source",
    "product",
    "start",
    "end",
    "unknown_time",
    "offset",
  ]) {
    const value = raw[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  const edition = typeof raw.edition === "string" ? raw.edition : undefined;
  const historyOffset =
    typeof raw.history_offset === "string" ? raw.history_offset : "0";
  try {
    const [archive, history] = await Promise.all([
      getArchive(params),
      edition
        ? getArchiveHistory(edition, historyOffset)
        : Promise.resolve(null),
    ]);
    return (
      <ArchiveBrowser
        archive={archive}
        edition={edition}
        history={history}
        query={params.toString()}
      />
    );
  } catch (error) {
    return (
      <div className="space-y-4">
        <h1 className="font-semibold text-2xl">WxWatch archive</h1>
        <p role="alert">
          {error instanceof Error ? error.message : "Archive unavailable"}
        </p>
        <Link className="underline" href="/wxwatch/archive">
          Reset filters and retry
        </Link>
      </div>
    );
  }
}
