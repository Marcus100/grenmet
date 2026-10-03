import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AppaBadge,
  CadenceBadge,
  InactiveBadge,
  JanitorHeader,
  SiteSwitcher,
  SpaceTypeLabel,
} from "@/components/janitorial/portal";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
} from "@/db/janitorial/queries";
import {
  CADENCE_LABELS,
  filterAreas,
  flattenAreas,
  SPACE_TYPE_LABELS,
  siteParam,
} from "@/lib/janitorial/catalogue";
import { formatFrequency, formatPerDay } from "@/lib/janitorial/format";

export const metadata: Metadata = {
  title: "Janitorial areas",
  description: "Register of GAA cleaning areas, cadences and workload.",
};

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function JanitorAreasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const site = siteParam(params.site);
  const filters = {
    building: single(params.building),
    cadence: single(params.cadence),
    q: single(params.q),
    space: single(params.space),
    status: single(params.status),
  };
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const { buildings } = await getJanitorialCatalogue(site);
  const all = flattenAreas(buildings);
  const active = all.filter((row) => row.active);
  const rows = filterAreas(all, filters);
  const filtered = Object.values(filters).some(Boolean);
  const labelsHref = `/janitor/areas/labels?${new URLSearchParams({
    site,
    ...(filters.building ? { building: filters.building } : {}),
  })}`;

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          <>
            <Button render={<Link href={labelsHref} />} variant="outline">
              <QrCode data-icon="inline-start" />
              Print QR labels
            </Button>
            <SiteSwitcher
              current={site}
              href={(code) => `/janitor/areas?site=${code}`}
            />
          </>
        }
        title="Areas"
      >
        {rows.length === active.length && filters.status !== "all"
          ? `${active.length} areas`
          : `${rows.length} of ${active.length} areas`}{" "}
        in the cleaning specification.
      </JanitorHeader>

      <form
        aria-label="Filter areas"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <input name="site" type="hidden" value={site} />
        <div className="space-y-2">
          <Label htmlFor="areas-q">Search</Label>
          <Input
            className="w-64"
            defaultValue={filters.q}
            id="areas-q"
            name="q"
            placeholder="Area, code, section or building"
            type="search"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="areas-building">Building</Label>
          <NativeSelect
            defaultValue={filters.building}
            id="areas-building"
            name="building"
          >
            <NativeSelectOption value="">All buildings</NativeSelectOption>
            {buildings.map((building) => (
              <NativeSelectOption key={building.id} value={String(building.id)}>
                {building.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="areas-space">Space type</Label>
          <NativeSelect
            defaultValue={filters.space}
            id="areas-space"
            name="space"
          >
            <NativeSelectOption value="">Any type</NativeSelectOption>
            {Object.entries(SPACE_TYPE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="areas-cadence">Cadence</Label>
          <NativeSelect
            defaultValue={filters.cadence}
            id="areas-cadence"
            name="cadence"
          >
            <NativeSelectOption value="">Any cadence</NativeSelectOption>
            {Object.entries(CADENCE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="areas-status">Status</Label>
          <NativeSelect
            defaultValue={filters.status}
            id="areas-status"
            name="status"
          >
            <NativeSelectOption value="">Active</NativeSelectOption>
            <NativeSelectOption value="all">
              Include inactive
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
        {filtered ? (
          <Button
            render={<Link href={`/janitor/areas?site=${site}`} />}
            variant="ghost"
          >
            Clear
          </Button>
        ) : null}
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Code</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Building</TableHead>
              <TableHead className="hidden xl:table-cell">Section</TableHead>
              <TableHead>Space type</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Tasks/day</TableHead>
              <TableHead className="hidden lg:table-cell">
                Most frequent
              </TableHead>
              <TableHead>Cadence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={9}
                >
                  No areas match these filters.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.code}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Link
                      className="font-medium hover:underline"
                      href={`/janitor/areas/${row.id}`}
                    >
                      {row.name}
                    </Link>
                    {row.quantity > 1 ? (
                      <span className="text-muted-foreground text-xs">
                        ×{row.quantity}
                      </span>
                    ) : null}
                    <InactiveBadge active={row.active} />
                  </span>
                  {row.bundleNames.length > 0 ? (
                    <span className="block text-muted-foreground text-xs">
                      + {row.bundleNames.join(", ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{row.buildingName}</TableCell>
                <TableCell className="hidden text-muted-foreground xl:table-cell">
                  {row.sectionName ?? "—"}
                </TableCell>
                <TableCell>
                  <SpaceTypeLabel spaceType={row.spaceType} />
                </TableCell>
                <TableCell>
                  <AppaBadge level={row.cleanlinessLevel} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatPerDay(row.perDay)}
                </TableCell>
                <TableCell className="hidden font-mono text-muted-foreground text-xs lg:table-cell">
                  {row.fastest ? formatFrequency(row.fastest) : "—"}
                </TableCell>
                <TableCell>
                  <CadenceBadge cadence={row.cadence} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
