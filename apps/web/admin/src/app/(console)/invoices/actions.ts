"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomer,
  createInvoiceDraft,
  deleteInvoiceDraft,
  issueInvoice,
  recordPayment,
  replaceInvoiceDraft,
  voidInvoice,
} from "@/lib/billing-api";
import {
  type NoticeCode,
  noticeForStatus,
  parseCustomer,
  parseDraft,
  parseInvoiceId,
  parseIssueDate,
  parsePayment,
  parseVoidReason,
} from "@/lib/invoice-form";
import { requireGate } from "@/lib/staff-gate";

// Server actions only validate and proxy to FastAPI, which re-checks the
// caller and owns totals, tax, numbering and every state rule.

async function staffToken(returnTo: string): Promise<string> {
  const gate = await requireGate(returnTo);
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function invoicePath(id: string): `/invoices/${string}` {
  return `/invoices/${encodeURIComponent(id)}`;
}

function failureNotice(error: unknown): NoticeCode {
  if (!isAuthApiError(error)) throw error;
  if (error.status === 401) redirect("/signin?sign_in=expired");
  return noticeForStatus(error.status, error.detail);
}

async function perform(
  id: string,
  success: NoticeCode,
  run: () => Promise<unknown>
): Promise<never> {
  let notice: NoticeCode = success;
  try {
    await run();
  } catch (error) {
    notice = failureNotice(error);
  }
  revalidatePath(invoicePath(id));
  revalidatePath("/invoices");
  revalidatePath("/receivables");
  redirect(`${invoicePath(id)}?notice=${notice}`);
}

function target(formData: FormData): string {
  const id = parseInvoiceId(formData);
  if (!id) redirect("/invoices");
  return id;
}

export async function createDraftAction(formData: FormData): Promise<never> {
  const token = await staffToken("/invoices/new");
  const parsed = parseDraft(formData);
  if (!parsed.ok) redirect("/invoices/new?notice=invalid");
  let id: string;
  try {
    id = (await createInvoiceDraft(token, parsed.value)).id;
  } catch (error) {
    redirect(`/invoices/new?notice=${failureNotice(error)}`);
  }
  revalidatePath("/invoices");
  redirect(`${invoicePath(id)}?notice=created`);
}

export async function saveDraftAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(invoicePath(id));
  const parsed = parseDraft(formData);
  if (!parsed.ok) redirect(`${invoicePath(id)}?notice=invalid`);
  return await perform(id, "saved", () =>
    replaceInvoiceDraft(token, id, parsed.value)
  );
}

export async function deleteDraftAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(invoicePath(id));
  try {
    await deleteInvoiceDraft(token, id);
  } catch (error) {
    redirect(`${invoicePath(id)}?notice=${failureNotice(error)}`);
  }
  revalidatePath("/invoices");
  redirect("/invoices");
}

export async function issueAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(invoicePath(id));
  const date = parseIssueDate(formData);
  if (!date.ok) redirect(`${invoicePath(id)}?notice=invalid`);
  return await perform(id, "issued", () => issueInvoice(token, id, date.value));
}

export async function voidAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(invoicePath(id));
  const reason = parseVoidReason(formData);
  if (!reason.ok) redirect(`${invoicePath(id)}?notice=invalid`);
  return await perform(id, "voided", () =>
    voidInvoice(token, id, reason.value)
  );
}

export async function recordPaymentAction(formData: FormData): Promise<never> {
  const id = target(formData);
  const token = await staffToken(invoicePath(id));
  const payment = parsePayment(formData);
  if (!payment.ok) redirect(`${invoicePath(id)}?notice=invalid`);
  return await perform(id, "paid", () =>
    recordPayment(token, id, payment.value)
  );
}

export async function createCustomerAction(formData: FormData): Promise<never> {
  const token = await staffToken("/customers");
  const parsed = parseCustomer(formData);
  if (!parsed.ok) redirect("/customers?notice=invalid");
  try {
    await createCustomer(token, parsed.value);
  } catch (error) {
    redirect(`/customers?notice=${failureNotice(error)}`);
  }
  revalidatePath("/customers");
  redirect("/customers?notice=customer");
}
