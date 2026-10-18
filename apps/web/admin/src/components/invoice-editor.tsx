import { LINE_SLOTS } from "@/lib/invoice-form";

const FIELD = "rounded-md border bg-background px-2.5 py-1.5";

export interface CustomerChoice {
  id: string;
  name: string;
}

export interface EditorLine {
  description: string;
  quantity: number;
  tax_rate: number;
  unit_price_minor: number;
}

export interface EditorDraft {
  customer_id: string;
  id: string;
  lines: EditorLine[];
  notes?: string | null;
}

function dollars(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Plain form for a draft invoice: a customer, notes and up to eight lines.
 * Amounts are typed in dollars; the server computes every total and tax figure,
 * so nothing here shows or edits a total.
 */
export function InvoiceEditor({
  action,
  customers,
  draft,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<never>;
  customers: CustomerChoice[];
  draft?: EditorDraft;
  submitLabel: string;
}) {
  const slots = Array.from({ length: LINE_SLOTS }, (_, index) => ({
    index,
    line: draft?.lines[index],
  }));
  return (
    <form action={action} className="grid gap-4">
      {draft ? (
        <input name="invoice_id" type="hidden" value={draft.id} />
      ) : null}
      <label className="grid max-w-md gap-1 text-sm">
        Customer
        <select
          className={FIELD}
          defaultValue={draft?.customer_id ?? ""}
          name="customer_id"
          required
        >
          <option disabled value="">
            Choose a customer
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium text-sm">Lines</legend>
        <p className="text-muted-foreground text-xs">
          Leave unused rows empty. A blank VAT rate uses the default configured
          on the server (provisional).
        </p>
        {slots.map(({ index, line }) => (
          <div
            className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_6rem]"
            key={index}
          >
            <label className="grid gap-1 text-sm">
              <span className="sr-only">Description {index + 1}</span>
              <input
                aria-label={`Description ${index + 1}`}
                className={FIELD}
                defaultValue={line?.description ?? ""}
                maxLength={500}
                name={`description_${index}`}
                placeholder={index === 0 ? "Description" : undefined}
                type="text"
              />
            </label>
            <input
              aria-label={`Quantity ${index + 1}`}
              className={FIELD}
              defaultValue={line ? String(line.quantity) : ""}
              inputMode="decimal"
              name={`quantity_${index}`}
              placeholder={index === 0 ? "Qty" : undefined}
              type="text"
            />
            <input
              aria-label={`Unit price ${index + 1}`}
              className={FIELD}
              defaultValue={line ? dollars(line.unit_price_minor) : ""}
              inputMode="decimal"
              name={`unit_price_${index}`}
              placeholder={index === 0 ? "Unit price (XCD)" : undefined}
              type="text"
            />
            <input
              aria-label={`VAT rate ${index + 1}`}
              className={FIELD}
              defaultValue={line ? String(line.tax_rate) : ""}
              inputMode="decimal"
              name={`tax_rate_${index}`}
              placeholder={index === 0 ? "VAT %" : undefined}
              type="text"
            />
          </div>
        ))}
      </fieldset>
      <label className="grid max-w-xl gap-1 text-sm">
        Notes
        <textarea
          className={FIELD}
          defaultValue={draft?.notes ?? ""}
          maxLength={2000}
          name="notes"
          rows={3}
        />
      </label>
      <div>
        <button
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          type="submit"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
