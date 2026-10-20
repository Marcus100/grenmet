import "server-only";

import {
  type PaymentPayoutCreate,
  paymentBalanceListPublicSchema,
  paymentLedgerEntryPublicSchema,
  paymentLedgerListPublicSchema,
  paymentReconciliationPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch, authApiFetchResponse } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

// Superuser-only payments proxies (apps/api/fastapi/src/payments). The ledger
// is append-only and FastAPI owns every balance rule; amounts are minor units.

export const LEDGER_PAGE_SIZE = 25;

export interface LedgerFilters {
  kind?: string;
  organisationId?: string;
  page: number;
}

export interface ReconciliationQuery {
  endDate: string;
  organisationId?: string;
  startDate: string;
}

export function listBalances(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/payments/admin/balances",
    paymentBalanceListPublicSchema,
    { accessToken }
  );
}

export function listLedger(accessToken: string, filters: LedgerFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    size: String(LEDGER_PAGE_SIZE),
  });
  if (filters.organisationId) {
    params.set("organisation_id", filters.organisationId);
  }
  if (filters.kind) params.set("kind", filters.kind);
  return authApiFetch(
    getAuthConfig(),
    `/payments/admin/ledger?${params}`,
    paymentLedgerListPublicSchema,
    { accessToken }
  );
}

function reconciliationParams(query: ReconciliationQuery): URLSearchParams {
  const params = new URLSearchParams({
    start_date: query.startDate,
    end_date: query.endDate,
  });
  if (query.organisationId) params.set("organisation_id", query.organisationId);
  return params;
}

export function getReconciliation(
  accessToken: string,
  query: ReconciliationQuery
) {
  return authApiFetch(
    getAuthConfig(),
    `/payments/admin/reconciliation?${reconciliationParams(query)}`,
    paymentReconciliationPublicSchema,
    { accessToken }
  );
}

/** The raw CSV response, streamed through the console's download route. */
export function fetchReconciliationCsv(
  accessToken: string,
  query: ReconciliationQuery
) {
  return authApiFetchResponse(
    getAuthConfig(),
    `/payments/admin/reconciliation.csv?${reconciliationParams(query)}`,
    { accessToken }
  );
}

export function createPayout(accessToken: string, body: PaymentPayoutCreate) {
  return authApiFetch(
    getAuthConfig(),
    "/payments/admin/payouts",
    paymentLedgerEntryPublicSchema,
    { accessToken, method: "POST", body }
  );
}
