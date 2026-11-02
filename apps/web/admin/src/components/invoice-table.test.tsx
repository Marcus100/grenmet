import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvoiceEditor } from "@/components/invoice-editor";
import { InvoiceTable } from "@/components/invoice-table";

const DESCRIPTION_LABEL = /^Description \d$/u;

const rows = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    number: "BG-2026-0001",
    status: "partially_paid",
    customer_name: "Spice Isle Tours",
    due_date: "2026-11-17",
    currency: "XCD",
    total_minor: 115_000,
    outstanding_minor: 75_000,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    number: null,
    status: "draft",
    customer_name: "Acme",
    due_date: null,
    currency: "XCD",
    total_minor: 0,
    outstanding_minor: 0,
  },
];

describe("InvoiceTable", () => {
  it("shows number, status, due date and money; drafts have no number", () => {
    render(<InvoiceTable rows={rows} />);
    const [, first, second] = screen.getAllByRole("row");
    expect(
      within(first as HTMLElement).getByRole("link", { name: "BG-2026-0001" })
    ).toHaveAttribute("href", "/invoices/11111111-1111-4111-8111-111111111111");
    expect(
      within(first as HTMLElement).getByText("Partially paid")
    ).toBeTruthy();
    expect(within(first as HTMLElement).getByText("XCD 1,150.00")).toBeTruthy();
    expect(within(first as HTMLElement).getByText("XCD 750.00")).toBeTruthy();
    expect(
      within(second as HTMLElement).getByRole("link", { name: "Draft" })
    ).toBeTruthy();
  });

  it("explains an empty list", () => {
    render(<InvoiceTable rows={[]} />);
    expect(screen.getByRole("status").textContent).toContain("No invoices");
  });
});

describe("InvoiceEditor", () => {
  const action = () => Promise.resolve(undefined as never);

  it("renders eight line rows and the customer choices for a new draft", () => {
    render(
      <InvoiceEditor
        action={action}
        customers={[{ id: "c1", name: "Spice Isle Tours" }]}
        submitLabel="Save draft"
      />
    );
    expect(screen.getAllByLabelText(DESCRIPTION_LABEL)).toHaveLength(8);
    expect(
      screen.getByRole("option", { name: "Spice Isle Tours" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
  });

  it("prefills an existing draft with dollar amounts and keeps its id", () => {
    const { container } = render(
      <InvoiceEditor
        action={action}
        customers={[{ id: "c1", name: "Spice Isle Tours" }]}
        draft={{
          id: "inv-1",
          customer_id: "c1",
          notes: "Net 30",
          lines: [
            {
              description: "Monitoring",
              quantity: 2.5,
              unit_price_minor: 10_010,
              tax_rate: 15,
            },
          ],
        }}
        submitLabel="Save draft"
      />
    );
    expect(screen.getByLabelText("Description 1")).toHaveValue("Monitoring");
    expect(screen.getByLabelText("Unit price 1")).toHaveValue("100.10");
    expect(screen.getByLabelText("VAT rate 1")).toHaveValue("15");
    expect(screen.getByLabelText("Quantity 1")).toHaveValue("2.5");
    expect(container.querySelector('input[name="invoice_id"]')).toHaveValue(
      "inv-1"
    );
  });
});
