import { isAuthApiError } from "@barrelsgd/auth";
import {
  AuditFailure,
  AuditPager,
  AuditRefusal,
  AuditRejected,
  AuditTable,
} from "@/components/audit-panels";
import { listAuditEntries } from "@/lib/audit-api";
import { type AuditFilters, auditPageHref } from "@/lib/audit-form";
import { reportError } from "@/lib/report-error";

const FORBIDDEN = 403;
const UNPROCESSABLE = 422;

/**
 * Streams in behind Suspense. A refusal (403) says what is missing and is not
 * reported as a fault. A 422 means the filters or cursor were refused, so the
 * page explains that. Anything else is reported and shown as a plain failure.
 */
export async function AuditSection({
  accessToken,
  cursor,
  filters,
}: {
  accessToken: string;
  cursor: string | undefined;
  filters: AuditFilters;
}) {
  try {
    const page = await listAuditEntries(accessToken, filters, cursor);
    return (
      <section aria-labelledby="audit-results-heading" className="space-y-3">
        <h2 className="sr-only" id="audit-results-heading">
          Audit entries
        </h2>
        <AuditTable entries={page.data} />
        <AuditPager
          newestHref={cursor ? auditPageHref(filters) : undefined}
          olderHref={
            page.next_cursor
              ? auditPageHref(filters, page.next_cursor)
              : undefined
          }
        />
      </section>
    );
  } catch (error) {
    if (isAuthApiError(error) && error.status === FORBIDDEN) {
      return <AuditRefusal />;
    }
    if (isAuthApiError(error) && error.status === UNPROCESSABLE) {
      return <AuditRejected />;
    }
    reportError(error, "admin-audit");
    return <AuditFailure />;
  }
}
