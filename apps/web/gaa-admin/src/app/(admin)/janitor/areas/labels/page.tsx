import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JanitorHeader, SiteSwitcher } from "@/components/janitorial/portal";
import {
  type AreaLabel,
  QrLabelSheet,
} from "@/components/janitorial/qr-labels";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
} from "@/db/janitorial/queries";
import { env } from "@/env";
import {
  filterAreas,
  flattenAreas,
  siteParam,
} from "@/lib/janitorial/catalogue";
import { qrMatrix, qrPayload } from "@/lib/janitorial/qr";

export const metadata: Metadata = {
  title: "Janitorial QR labels",
  description: "Printable QR check-in labels for GAA cleaning areas.",
};

export const dynamic = "force-dynamic";

export default async function JanitorLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const site = siteParam(params.site);
  const building = typeof params.building === "string" ? params.building : "";
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const { buildings } = await getJanitorialCatalogue(site);
  const labels: AreaLabel[] = filterAreas(flattenAreas(buildings), {
    building,
  }).map((row) => ({
    buildingName: row.buildingName,
    code: row.code,
    id: row.id,
    name: row.name,
    qr: qrMatrix(qrPayload(row.code, env.JANITOR_APP_URL)),
  }));

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          <SiteSwitcher
            current={site}
            href={(code) => `/janitor/areas/labels?site=${code}`}
          />
        }
        crumbs={[
          { href: `/janitor?site=${site}`, label: "Janitorial" },
          { href: `/janitor/areas?site=${site}`, label: "Areas" },
        ]}
        title="QR labels"
      >
        {env.JANITOR_APP_URL
          ? "Each label opens the area in the janitor app."
          : "Labels carry the area code. Set JANITOR_APP_URL to encode a link into the janitor app."}
      </JanitorHeader>

      <form
        aria-label="Choose labels"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input name="site" type="hidden" value={site} />
        <div className="space-y-2">
          <Label htmlFor="labels-building">Building</Label>
          <NativeSelect
            defaultValue={building}
            id="labels-building"
            name="building"
          >
            <NativeSelectOption value="">All buildings</NativeSelectOption>
            {buildings
              .filter((value) => value.active)
              .map((value) => (
                <NativeSelectOption key={value.id} value={String(value.id)}>
                  {value.name}
                </NativeSelectOption>
              ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Show labels
        </Button>
      </form>

      <QrLabelSheet labels={labels} />
    </div>
  );
}
