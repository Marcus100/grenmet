/**
 * Validation and formatting for the invoicing forms. Pure functions over
 * `FormData` so the rules are unit-tested without a server; FastAPI still
 * re-validates everything and owns all totals and tax arithmetic.
 *
 * Money is typed as dollars ("1250.50") and converted to integer minor units
 * (cents) by string parsing, never through floating point.
 */

export const LINE_SLOTS = 8;
export const PAYMENT_METHODS = ["bank_transfer", "cash", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANISATION_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MONEY = /^(\d{1,12})(?:\.(\d{1,2}))?$/;
const QUANTITY = /^\d{1,9}(?:\.\d{1,3})?$/;
const RATE = /^\d{1,3}(?:\.\d{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESCRIPTION = 500;
const MAX_NOTES = 2000;
const MAX_ADDRESS = 1000;
const MAX_REFERENCE = 200;
const MIN_REASON = 3;
const MAX_REASON = 500;
const MAX_RATE = 100;
const MAX_QUANTITY = 1_000_000_000;
const CENTS = 100;

export type Parsed<T> = { ok: true; value: T } | { ok: false };

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseId(value: string): string | undefined {
  return UUID.test(value) ? value : undefined;
}

/** "1250.5" -> 125050. Returns undefined for anything that is not plain money. */
export function dollarsToMinor(value: string): number | undefined {
  const match = MONEY.exec(value.trim());
  if (!match) return;
  const whole = Number.parseInt(match[1] ?? "0", 10);
  const cents = Number.parseInt((match[2] ?? "").padEnd(2, "0"), 10) || 0;
  return whole * CENTS + cents;
}

/** Integer minor units to "1,250.50"; a leading minus is kept. */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / CENTS).toLocaleString("en-US");
  const cents = String(abs % CENTS).padStart(2, "0");
  return `${sign}${whole}.${cents}`;
}

export interface LineBody {
  description: string;
  quantity: number;
  tax_rate?: number;
  unit_price_minor: number;
}

export interface DraftBody {
  customer_id: string;
  lines: LineBody[];
  notes: string | null;
}

function parseLine(data: FormData, index: number): Parsed<LineBody> | "empty" {
  const description = text(data, `description_${index}`);
  const quantity = text(data, `quantity_${index}`);
  const price = text(data, `unit_price_${index}`);
  const rate = text(data, `tax_rate_${index}`);
  if (!(description || quantity || price || rate)) return "empty";
  const unit = dollarsToMinor(price);
  const qty = Number.parseFloat(quantity);
  if (
    !description ||
    description.length > MAX_DESCRIPTION ||
    !QUANTITY.test(quantity) ||
    !(qty > 0 && qty <= MAX_QUANTITY) ||
    unit === undefined
  ) {
    return { ok: false };
  }
  if (rate && !(RATE.test(rate) && Number.parseFloat(rate) <= MAX_RATE)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      description,
      quantity: qty,
      unit_price_minor: unit,
      ...(rate ? { tax_rate: Number.parseFloat(rate) } : {}),
    },
  };
}

export function parseDraft(data: FormData): Parsed<DraftBody> {
  const customer = parseId(text(data, "customer_id"));
  const notes = text(data, "notes");
  if (!customer || notes.length > MAX_NOTES) return { ok: false };
  const lines: LineBody[] = [];
  for (let index = 0; index < LINE_SLOTS; index += 1) {
    const line = parseLine(data, index);
    if (line === "empty") continue;
    if (!line.ok) return { ok: false };
    lines.push(line.value);
  }
  return {
    ok: true,
    value: { customer_id: customer, lines, notes: notes || null },
  };
}

export function parseInvoiceId(data: FormData): string | undefined {
  return parseId(text(data, "invoice_id"));
}

export function parseIssueDate(data: FormData): Parsed<string | undefined> {
  const date = text(data, "issue_date");
  if (!date) return { ok: true, value: undefined };
  return DATE.test(date) ? { ok: true, value: date } : { ok: false };
}

export function parseVoidReason(data: FormData): Parsed<string> {
  const reason = text(data, "reason");
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return { ok: false };
  }
  return { ok: true, value: reason };
}

export interface PaymentBody {
  amount_minor: number;
  method: PaymentMethod;
  paid_date: string;
  reference?: string;
}

export function parsePayment(data: FormData): Parsed<PaymentBody> {
  const method = PAYMENT_METHODS.find((item) => item === text(data, "method"));
  const amount = dollarsToMinor(text(data, "amount"));
  const paidDate = text(data, "paid_date");
  const reference = text(data, "reference");
  if (
    !method ||
    amount === undefined ||
    amount <= 0 ||
    !DATE.test(paidDate) ||
    reference.length > MAX_REFERENCE
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      amount_minor: amount,
      method,
      paid_date: paidDate,
      ...(reference ? { reference } : {}),
    },
  };
}

export interface CustomerBody {
  address?: string;
  billing_email: string;
  organisation_id: string;
}

export function parseCustomer(data: FormData): Parsed<CustomerBody> {
  const organisation = text(data, "organisation_id");
  const email = text(data, "billing_email");
  const address = text(data, "address");
  if (
    !(ORGANISATION_ID.test(organisation) && EMAIL.test(email)) ||
    email.length > 320 ||
    address.length > MAX_ADDRESS
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      organisation_id: organisation,
      billing_email: email,
      ...(address ? { address } : {}),
    },
  };
}

/** Fixed codes the page maps to text, so no message is reflected from a URL. */
export const NOTICES = {
  created: { tone: "ok", text: "Draft saved." },
  saved: { tone: "ok", text: "Draft updated." },
  issued: {
    tone: "ok",
    text: "Invoice issued. The customer has been queued an email.",
  },
  voided: { tone: "ok", text: "Invoice voided." },
  paid: { tone: "ok", text: "Payment recorded." },
  customer: { tone: "ok", text: "Customer added." },
  invalid: {
    tone: "problem",
    text: "That input was not accepted. Check the fields and try again.",
  },
  conflict: {
    tone: "problem",
    text: "That conflicts with the invoice's current state or an existing record.",
  },
  overpaid: {
    tone: "problem",
    text: "The payment is more than the outstanding balance.",
  },
  failed: {
    tone: "problem",
    text: "The change could not be saved. Nothing was changed.",
  },
} as const;

export type NoticeCode = keyof typeof NOTICES;

export function noticeFor(
  code: string | undefined
): (typeof NOTICES)[NoticeCode] | undefined {
  return code && Object.hasOwn(NOTICES, code)
    ? NOTICES[code as NoticeCode]
    : undefined;
}

export function noticeForStatus(status: number, detail = ""): NoticeCode {
  if (status === 409) return "conflict";
  if (status === 422 && detail.includes("outstanding balance")) {
    return "overpaid";
  }
  if (status === 400 || status === 404 || status === 422) return "invalid";
  return "failed";
}

/** Today's calendar date in Grenada (UTC-4, no daylight saving), as YYYY-MM-DD. */
export function todayInGrenada(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Grenada" });
}
