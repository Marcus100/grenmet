import type { NhcPage } from "@barrelsgd/api-client";
import { redirect } from "next/navigation";
import { NhcWorkspace } from "@/components/wxproducts/nhc-workspace";
import { getNhcEditions } from "@/db/wxwatch/queries";
import { reportError } from "@/lib/report-error";

export const metadata = { title: "NHC Products" };
export const dynamic = "force-dynamic";

export default async function NhcProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const editor = raw.view === "editor";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string" && value) params.set(key, value);
  const query = new URLSearchParams();
  for (const key of [
    "family",
    "product",
    "storm",
    "start",
    "end",
    "latest",
    "offset",
  ]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  if (editor) {
    const target = new URLSearchParams({
      kind: params.get("kind") ?? "outlook",
    });
    if (params.get("sources"))
      target.set("sources", params.get("sources") ?? "");
    redirect(`/wxproducts/alerts?${target}`);
  }
  let archive: NhcPage | null = null;
  let loadError = "";
  try {
    archive = await getNhcEditions(query);
  } catch (error) {
    reportError(error, "wxproducts-nhc");
    loadError = "NHC guidance unavailable. Pull progress remains accessible.";
  }
  return (
    <NhcWorkspace
      archive={archive}
      loadError={loadError}
      query={params.toString()}
    />
  );
}
