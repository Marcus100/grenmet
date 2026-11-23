import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import type { Metadata } from "next";
import Link from "next/link";
import { ConsolePager } from "@/components/console-pager";
import { OrganisationTable } from "@/components/organisation-table";
import { StaffOnly } from "@/components/staff-only";
import { listOrganisations, ORGANISATIONS_PAGE_SIZE } from "@/lib/api";
import { STATUSES } from "@/lib/organisation-form";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Organisations" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const KINDS = ["barrels", "client", "business"] as const;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[]
): T | undefined {
  return allowed.find((item) => item === value);
}

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/organisations");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const q = one(params.q)?.slice(0, 100);
  const status = pick(one(params.status), STATUSES);
  const kind = pick(one(params.kind), KINDS);
  const page = pageNumber(one(params.page));

  const list = await listOrganisations(gate.accessToken, {
    page,
    q,
    status,
    kind,
  });
  const lastPage = Math.max(1, Math.ceil(list.count / ORGANISATIONS_PAGE_SIZE));

  const linkTo = (target: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (status) next.set("status", status);
    if (kind) next.set("kind", kind);
    next.set("page", String(target));
    return `/organisations?${next}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Organisations
          </h1>
          <p className="text-muted-foreground">
            Every organisation on the platform.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/organisations/new" />}
          variant="outline"
        >
          New organisation
        </Button>
      </div>

      <form
        aria-label="Filter organisations"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <label className="grid w-full gap-1 text-sm sm:w-64">
          Search
          <Input
            defaultValue={q}
            maxLength={100}
            name="q"
            placeholder="Name or slug"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <NativeSelect defaultValue={status ?? ""} name="status">
            <option value="">Any</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm">
          Kind
          <NativeSelect defaultValue={kind ?? ""} name="kind">
            <option value="">Any</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <OrganisationTable
        filtered={Boolean(q || status || kind)}
        rows={list.data}
      />

      {list.count > 0 ? (
        <ConsolePager
          count={list.count}
          label="Organisation pages"
          lastPage={lastPage}
          nextHref={page < lastPage ? linkTo(page + 1) : undefined}
          page={page}
          previousHref={page > 1 ? linkTo(page - 1) : undefined}
        />
      ) : null}
    </>
  );
}
