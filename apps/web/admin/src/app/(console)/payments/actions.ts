"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  type PaymentNoticeCode,
  parsePayout,
  paymentNoticeForStatus,
} from "@/lib/payment-form";
import { createPayout } from "@/lib/payments-api";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// The confirmation step is the page (a GET with the proposed payout); this
// action is the confirmed POST. It validates, proxies to FastAPI (which locks
// the organisation and refuses more than the balance owed) and redirects with
// a fixed notice code.

const SERVER_ERROR = 500;

export async function recordPayoutAction(formData: FormData): Promise<never> {
  const gate = await requireGate("/payments");
  if (gate.status !== "staff") redirect("/");
  const parsed = parsePayout({
    organisation_id: String(formData.get("organisation_id") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.ok) redirect("/payments?notice=payout-invalid#payout-heading");

  let notice: PaymentNoticeCode = "payout-recorded";
  try {
    await createPayout(gate.accessToken, {
      organisation_id: parsed.value.organisationId,
      amount_minor: parsed.value.amountMinor,
      currency: "XCD",
      reference: parsed.value.reference,
      note: parsed.value.note,
    });
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    if (error.status >= SERVER_ERROR) reportError(error, "admin-payments");
    notice = paymentNoticeForStatus(error.status);
  }
  revalidatePath("/payments");
  redirect(`/payments?notice=${notice}#payout-heading`);
}
