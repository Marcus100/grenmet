import type { InvoiceDetailPublic } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  IssuePanel,
  LinesPanel,
  PaymentPanel,
  PaymentsList,
  VoidPanel,
} from "@/components/invoice-panels";
import { todayInGrenada } from "@/lib/invoice-form";

const PAYMENT_TEXT = /bank transfer, ref TT-1/u;
const AMOUNT_LABEL = /Amount/u;
const REASON_LABEL = /Reason/u;
const FINAL_TEXT = /cannot be undone/u;

vi.mock("@/app/(console)/invoices/actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return {
    deleteDraftAction: action,
    issueAction: action,
    recordPaymentAction: action,
    voidAction: action,
  };
});

const invoice = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "BG-2026-0001",
  status: "partially_paid",
  customer_id: "c1",
  organisation_id: "org_1",
  customer_name: "Spice Isle Tours",
  billing_email: "accounts@example.com",
  address: null,
  currency: "XCD",
  issue_date: "2026-10-18",
  due_date: "2026-11-17",
  subtotal_minor: 100_000,
  tax_minor: 15_000,
  total_minor: 115_000,
  paid_minor: 40_000,
  outstanding_minor: 75_000,
  notes: null,
  legal_entity_name: "Barrels Grenada",
  void_reason: null,
  voided_at: null,
  issued_at: "2026-10-18T12:00:00Z",
  pdf_stored: false,
  created_at: "2026-10-18T12:00:00Z",
  lines: [
    {
      id: "l1",
      position: 1,
      description: "Monitoring",
      quantity: 1,
      unit_price_minor: 100_000,
      tax_rate: 15,
      subtotal_minor: 100_000,
      tax_minor: 15_000,
    },
  ],
  payments: [
    {
      id: "p1",
      method: "bank_transfer",
      reference: "TT-1",
      amount_minor: 40_000,
      paid_date: "2026-10-20",
      created_at: "2026-10-20T12:00:00Z",
    },
  ],
} as unknown as InvoiceDetailPublic;

describe("invoice panels", () => {
  it("shows the server's totals and outstanding balance", () => {
    render(<LinesPanel invoice={invoice} />);
    expect(screen.getByText("XCD 1,150.00")).toBeTruthy();
    expect(screen.getByText("XCD 750.00")).toBeTruthy();
    expect(screen.getByText("Monitoring")).toBeTruthy();
  });

  it("lists payments with method and reference", () => {
    render(<PaymentsList invoice={invoice} />);
    expect(screen.getByText(PAYMENT_TEXT)).toBeTruthy();
  });

  it("offers only manual payment methods, prefilled with the balance", () => {
    render(<PaymentPanel invoice={invoice} today="2026-10-21" />);
    const methods = screen
      .getAllByRole("option")
      .map((option) => option.getAttribute("value"));
    expect(methods).toEqual(["bank_transfer", "cash", "cheque"]);
    expect(screen.getByLabelText(AMOUNT_LABEL)).toHaveValue("750.00");
    expect(screen.getByLabelText("Date received")).toHaveAttribute(
      "max",
      "2026-10-21"
    );
  });

  it("requires a void reason and warns that issuing is final", () => {
    render(
      <>
        <VoidPanel invoice={invoice} />
        <IssuePanel invoice={invoice} />
      </>
    );
    expect(screen.getByLabelText(REASON_LABEL)).toBeRequired();
    expect(screen.getByText(FINAL_TEXT)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete draft" })).toBeTruthy();
  });

  it("computes today's date in Grenada, not UTC", () => {
    // 01:00 UTC on the 19th is still the evening of the 18th in Grenada.
    expect(todayInGrenada(new Date("2026-10-19T01:00:00Z"))).toBe("2026-10-18");
  });
});
