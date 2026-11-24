import "server-only";

import { auditListAdminAuditEntriesResponseSchema } from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { type AuditFilters, auditApiQuery } from "@/lib/audit-form";
import { getAuthConfig } from "@/lib/auth-config";

// Global audit log (apps/api/fastapi/src/audit, ADR-0065 decision 5). Needs the
// audit.entries.read permission; superusers pass. FastAPI owns the keyset, the
// filters and the masking. This app only renders what comes back.

/** One keyset page. Pass the previous page's `next_cursor` back as `cursor`. */
export function listAuditEntries(
  accessToken: string,
  filters: AuditFilters,
  cursor: string | undefined
) {
  const params = auditApiQuery(filters, cursor);
  return authApiFetch(
    getAuthConfig(),
    `/audit/admin/entries?${params}`,
    auditListAdminAuditEntriesResponseSchema,
    { accessToken }
  );
}
