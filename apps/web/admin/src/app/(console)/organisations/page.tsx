import type { Metadata } from "next";
import Link from "next/link";
import { OrganisationTable } from "@/components/organisation-table";
import { StaffOnly } from "@/components/staff-only";
import { listOrganisations, ORGANISATIONS_PAGE_SIZE } from "@/lib/api";
import { requireGate } from "@/lib/staff-gate";

export const metadata: Metadata = { title: "Organisations" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["active", "suspended"] as const;
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
    return `/organisations?${next}` as const;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl">Organisations</h1>
          <p className="text-muted-foreground">
            Every organisation on the platform.
          </p>
        </div>
        <Link
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          href="/organisations/new"
        >
          New organisation
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">
          Search
          <input
            className="rounded-md border bg-background px-2.5 py-1.5"
            defaultValue={q}
            maxLength={100}
            name="q"
            type="search"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className="rounded-md border bg-background px-2.5 py-1.5"
            defaultValue={status ?? ""}
            name="status"
          >
            <option value="">Any</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Kind
          <select
            className="rounded-md border bg-background px-2.5 py-1.5"
            defaultValue={kind ?? ""}
            name="kind"
          >
            <option value="">Any</option>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          type="submit"
        >
          Filter
        </button>
      </form>

      <OrganisationTable rows={list.data} />

      <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {list.count} total, page {Math.min(page, lastPage)} of {lastPage}
        </span>
        {page > 1 ? (
          <Link className="underline" href={linkTo(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < lastPage ? (
          <Link className="underline" href={linkTo(page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}
