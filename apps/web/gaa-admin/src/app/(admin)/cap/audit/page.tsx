import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import Link from "next/link";
import {
  CapAdminHeading,
  CapAdminUnavailable,
} from "@/components/cap/admin-status";
import { loadCapAudit } from "@/db/cap/queries";
import { reportError } from "@/lib/report-error";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = await searchParams;
  const rawPage = Number(filters.page ?? "1");
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const alertId = typeof filters.alert_id === "string" ? filters.alert_id : "";
  let data: Awaited<ReturnType<typeof loadCapAudit>>;
  try {
    data = await loadCapAudit(page, alertId);
  } catch (error) {
    reportError(error, "cap-admin");
    return <CapAdminUnavailable />;
  }
  const href = (next: number) =>
    `/cap/audit?${new URLSearchParams({ page: String(next), ...(alertId ? { alert_id: alertId } : {}) })}`;
  return (
    <CapAdminHeading title="CAP audit history">
      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="space-y-2">
          <Label htmlFor="audit-alert">Alert ID (optional)</Label>
          <Input defaultValue={alertId} id="audit-alert" name="alert_id" />
        </div>
        <Button type="submit">Filter history</Button>
      </form>
      <p>
        {data.count} events · page {page}
      </p>
      {data.data.length === 0 ? (
        <p>No audit events match this filter.</p>
      ) : null}
      {data.data.map((event) => (
        <article className="space-y-2 rounded-lg border p-4" key={event.id}>
          <h2 className="font-semibold">{event.action}</h2>
          <p>
            {event.created_at} · Actor: {event.actor_user_id ?? "Not recorded"}
          </p>
          <p>
            {event.previous_state ?? "—"} → {event.next_state ?? "—"}
          </p>
          {event.note ? (
            <p className="whitespace-pre-wrap">{event.note}</p>
          ) : null}
          {event.alert_id ? (
            <Link
              className="underline"
              href={`/cap/admin/${encodeURIComponent(event.alert_id)}`}
            >
              Open alert
            </Link>
          ) : null}
        </article>
      ))}
      <nav aria-label="Audit pages" className="flex gap-4">
        {page > 1 ? (
          <Link className="underline" href={href(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page * 25 < data.count ? (
          <Link className="underline" href={href(page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </CapAdminHeading>
  );
}
