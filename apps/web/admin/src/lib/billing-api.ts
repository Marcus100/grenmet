import "server-only";

import {
  customerListPublicSchema,
  customerPublicSchema,
  invoiceDetailPublicSchema,
  invoiceListPublicSchema,
  organisationAdminListPublicSchema,
  receivablesPublicSchema,
} from "@barrelsgd/api-client";
import { authApiFetch, authApiFetchResponse } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";

// Invoicing proxies (`billing.manage` or superuser; apps/api/fastapi/src/billing).
// FastAPI owns totals, tax, numbering and every state rule.

export const INVOICES_PAGE_SIZE = 25;
export const RECEIVABLES_PAGE_SIZE = 50;

export interface InvoiceFilters {
  overdue?: boolean;
  page: number;
  q?: string;
  status?: string;
}

export interface DraftBody {
  customer_id: string;
  lines: {
    description: string;
    quantity: number;
    tax_rate?: number;
    unit_price_minor: number;
  }[];
  notes: string | null;
}

function invoicePath(invoiceId: string, suffix = ""): string {
  return `/billing/invoices/${encodeURIComponent(invoiceId)}${suffix}`;
}

export function listInvoices(accessToken: string, filters: InvoiceFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    size: String(INVOICES_PAGE_SIZE),
  });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.overdue) params.set("overdue", "true");
  return authApiFetch(
    getAuthConfig(),
    `/billing/invoices?${params}`,
    invoiceListPublicSchema,
    { accessToken }
  );
}

export function getInvoice(accessToken: string, invoiceId: string) {
  return authApiFetch(
    getAuthConfig(),
    invoicePath(invoiceId),
    invoiceDetailPublicSchema,
    { accessToken }
  );
}

export function createInvoiceDraft(accessToken: string, body: DraftBody) {
  return authApiFetch(
    getAuthConfig(),
    "/billing/invoices",
    invoiceDetailPublicSchema,
    { accessToken, method: "POST", body }
  );
}

export function replaceInvoiceDraft(
  accessToken: string,
  invoiceId: string,
  body: DraftBody
) {
  return authApiFetch(
    getAuthConfig(),
    invoicePath(invoiceId),
    invoiceDetailPublicSchema,
    { accessToken, method: "PUT", body }
  );
}

export async function deleteInvoiceDraft(
  accessToken: string,
  invoiceId: string
) {
  await authApiFetchResponse(getAuthConfig(), invoicePath(invoiceId), {
    accessToken,
    method: "DELETE",
  });
}

export function issueInvoice(
  accessToken: string,
  invoiceId: string,
  issueDate?: string
) {
  return authApiFetch(
    getAuthConfig(),
    invoicePath(invoiceId, "/issue"),
    invoiceDetailPublicSchema,
    {
      accessToken,
      method: "POST",
      body: issueDate ? { issue_date: issueDate } : {},
    }
  );
}

export function voidInvoice(
  accessToken: string,
  invoiceId: string,
  reason: string
) {
  return authApiFetch(
    getAuthConfig(),
    invoicePath(invoiceId, "/void"),
    invoiceDetailPublicSchema,
    { accessToken, method: "POST", body: { reason } }
  );
}

export function recordPayment(
  accessToken: string,
  invoiceId: string,
  body: {
    amount_minor: number;
    method: string;
    paid_date: string;
    reference?: string;
  }
) {
  return authApiFetch(
    getAuthConfig(),
    invoicePath(invoiceId, "/payments"),
    invoiceDetailPublicSchema,
    { accessToken, method: "POST", body }
  );
}

/** The raw PDF response, streamed through the console's download route. */
export function fetchInvoicePdf(accessToken: string, invoiceId: string) {
  return authApiFetchResponse(getAuthConfig(), invoicePath(invoiceId, "/pdf"), {
    accessToken,
  });
}

export function getReceivables(accessToken: string, page: number) {
  return authApiFetch(
    getAuthConfig(),
    `/billing/receivables?page=${page}&size=${RECEIVABLES_PAGE_SIZE}`,
    receivablesPublicSchema,
    { accessToken }
  );
}

export function listCustomers(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/billing/customers?size=200",
    customerListPublicSchema,
    { accessToken }
  );
}

export function createCustomer(
  accessToken: string,
  body: { address?: string; billing_email: string; organisation_id: string }
) {
  return authApiFetch(
    getAuthConfig(),
    "/billing/customers",
    customerPublicSchema,
    { accessToken, method: "POST", body }
  );
}

/** Up to 200 active organisations for the "add customer" picker. */
export function listOrganisationChoices(accessToken: string) {
  return authApiFetch(
    getAuthConfig(),
    "/organisations?size=200&status=active",
    organisationAdminListPublicSchema,
    { accessToken }
  );
}
