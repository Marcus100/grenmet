import type {
  AuditChangePublic,
  AuditEntryAdminPublic,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Skeleton } from "@barrelsgd/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import Link from "next/link";
import {
  type AuditHref,
  changeValue,
  formatGrenada,
  formatUtc,
} from "@/lib/audit-form";

const FIELD = "bg-background rounded-md border px-2.5 py-1.5";
const BUTTON = "hover:bg-muted rounded-md border px-3 py-1.5 text-sm";

/** The GET form. Values are shown as typed so a refused filter can be fixed. */
export function AuditFilterForm({
  values,
}: {
  values: Record<string, string | undefined>;
}) {
  const v = (key: string) => values[key] ?? "";
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      method="get"
    >
      <label className="grid gap-1 text-sm">
        Actor id
        <input
          className={`${FIELD} font-mono`}
          defaultValue={v("actor_id")}
          maxLength={36}
          name="actor_id"
          placeholder="User id (UUID)"
          type="text"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Action
        <input
          className={`${FIELD} font-mono`}
          defaultValue={v("action")}
          maxLength={20}
          name="action"
          placeholder="For example create"
          type="text"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Entity type
        <input
          className={`${FIELD} font-mono`}
          defaultValue={v("entity_type")}
          maxLength={60}
          name="entity_type"
          placeholder="For example platform_organisation"
          type="text"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Organisation id
        <input
          className={`${FIELD} font-mono`}
          defaultValue={v("organisation_id")}
          maxLength={100}
          name="organisation_id"
          type="text"
        />
      </label>
      <label className="grid gap-1 text-sm">
        From date (Grenada)
        <input
          className={FIELD}
          defaultValue={v("from")}
          name="from"
          type="date"
        />
      </label>
      <label className="grid gap-1 text-sm">
        To date (Grenada, included)
        <input className={FIELD} defaultValue={v("to")} name="to" type="date" />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-3">
        <button className={BUTTON} type="submit">
          Filter
        </button>
        <Link className="text-sm underline" href="/audit">
          Clear filters
        </Link>
      </div>
    </form>
  );
}

/** Problems with the typed filters. Nothing is loaded while any exist. */
export function AuditProblems({ problems }: { problems: string[] }) {
  return (
    <div className="rounded-md border px-3 py-2 text-sm" role="alert">
      <p>Problem: the filters are not valid, so nothing was loaded.</p>
      <ul className="list-disc pl-5">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One change. A masked change shows only that it is masked: its values are not
 * rendered even if the API sent them, so nothing sensitive reaches the page.
 */
export function AuditChangeLine({ change }: { change: AuditChangePublic }) {
  return (
    <li className="break-words">
      <span className="font-mono">{change.field}</span>:{" "}
      {change.masked ? (
        <Badge variant="secondary">Masked</Badge>
      ) : (
        <span>
          was {changeValue(change.old)}, now {changeValue(change.new)}
        </span>
      )}
    </li>
  );
}

export function AuditChanges({ changes }: { changes: AuditChangePublic[] }) {
  if (changes.length === 0) {
    return <span className="text-muted-foreground">No field changes</span>;
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline-offset-4 hover:underline">
        {changes.length === 1
          ? "1 field changed"
          : `${changes.length} fields changed`}
      </summary>
      <ul className="mt-2 grid gap-1">
        {changes.map((change) => (
          <AuditChangeLine
            change={change}
            key={`${change.field}:${changeValue(change.old)}>${changeValue(change.new)}`}
          />
        ))}
      </ul>
    </details>
  );
}

export function AuditTable({ entries }: { entries: AuditEntryAdminPublic[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground" role="status">
        No audit entries match.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Who</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Organisation</TableHead>
          <TableHead>Changes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">
              <time dateTime={entry.created_at}>
                {formatGrenada(entry.created_at)}
              </time>
              <div className="text-muted-foreground text-xs tabular-nums">
                {formatUtc(entry.created_at)}
              </div>
            </TableCell>
            <TableCell>{entry.actor_name}</TableCell>
            <TableCell className="font-mono">{entry.action}</TableCell>
            <TableCell className="break-all">
              <div className="font-mono">{entry.entity_type}</div>
              <div className="text-muted-foreground font-mono text-xs">
                {entry.entity_id}
              </div>
            </TableCell>
            <TableCell className="font-mono text-xs break-all">
              {entry.organisation_id ?? "-"}
            </TableCell>
            <TableCell className="min-w-48">
              <AuditChanges changes={entry.changes} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Keyset paging: only "newer" (back to the first page) and "older" (the next cursor). */
export function AuditPager({
  newestHref,
  olderHref,
}: {
  newestHref: AuditHref | undefined;
  olderHref: AuditHref | undefined;
}) {
  if (!(newestHref || olderHref)) return null;
  return (
    <nav aria-label="Audit pages" className="flex items-center gap-4 text-sm">
      {newestHref ? (
        <Link className="underline" href={newestHref}>
          Newest entries
        </Link>
      ) : null}
      {olderHref ? (
        <Link className="underline" href={olderHref}>
          Older entries
        </Link>
      ) : null}
    </nav>
  );
}

export function AuditLoading() {
  return (
    <section aria-busy="true" className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <span className="sr-only" role="status">
        Loading audit entries
      </span>
    </section>
  );
}

/** A 403: the signed-in account may not read the audit log. Not reported as a fault. */
export function AuditRefusal() {
  return (
    <p className="text-muted-foreground text-sm" role="status">
      Your account cannot read the audit log. It needs the audit read permission
      (audit.entries.read). Ask a Barrels administrator if you need it.
    </p>
  );
}

export function AuditFailure() {
  return (
    <p className="rounded-md border px-3 py-2 text-sm" role="alert">
      Problem: the audit log could not be loaded. Reload the page to try again.
    </p>
  );
}

export function AuditRejected() {
  return (
    <p className="rounded-md border px-3 py-2 text-sm" role="alert">
      Problem: the audit log did not accept those filters or that page link.
      Start again from the newest entries.
    </p>
  );
}
