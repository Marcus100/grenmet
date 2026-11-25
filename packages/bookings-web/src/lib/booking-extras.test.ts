import { describe, expect, it } from "vitest";
import {
  businessDepositLabel,
  depositToPayLine,
  lateFeeLine,
  newClientsNote,
  showsBusinessDeposit,
  splitLinks,
} from "./booking-extras";

describe("business deposit wording", () => {
  it("labels a service deposit and the amount to pay", () => {
    expect(businessDepositLabel(5300, "XCD")).toBe(
      "EC$53 deposit, paid to the business"
    );
    expect(depositToPayLine(5300, "XCD")).toBe("Deposit to pay: EC$53");
  });

  it("shows the deposit only while the booking is pending or confirmed", () => {
    const base = { deposit_to_business_minor: 5300 };
    expect(showsBusinessDeposit({ ...base, status: "pending" })).toBe(true);
    expect(showsBusinessDeposit({ ...base, status: "confirmed" })).toBe(true);
    expect(showsBusinessDeposit({ ...base, status: "cancelled" })).toBe(false);
    expect(showsBusinessDeposit({ ...base, status: "completed" })).toBe(false);
    expect(
      showsBusinessDeposit({ deposit_to_business_minor: 0, status: "pending" })
    ).toBe(false);
    expect(showsBusinessDeposit({ status: "pending" })).toBe(false);
  });
});

describe("lateFeeLine", () => {
  it("names the grace minutes", () => {
    expect(lateFeeLine({ amount_minor: 2500, grace_min: 15 }, "XCD")).toBe(
      "Arriving more than 15 minutes late adds a late fee of EC$25."
    );
    expect(lateFeeLine({ amount_minor: 2500, grace_min: 1 }, "XCD")).toBe(
      "Arriving more than 1 minute late adds a late fee of EC$25."
    );
  });

  it("drops the grace sentence when there is none", () => {
    expect(lateFeeLine({ amount_minor: 2500, grace_min: 0 }, "XCD")).toBe(
      "Arriving late adds a late fee of EC$25."
    );
  });

  it("says nothing without a rule", () => {
    expect(lateFeeLine(null, "XCD")).toBeNull();
    expect(lateFeeLine(undefined, "XCD")).toBeNull();
    expect(lateFeeLine({ amount_minor: 0, grace_min: 5 }, "XCD")).toBeNull();
  });
});

describe("newClientsNote", () => {
  it("is empty for an ordinary service", () => {
    expect(newClientsNote({ new_clients_only: false })).toEqual([]);
    expect(newClientsNote(null)).toEqual([]);
  });

  it("names the lead days and the categories", () => {
    expect(
      newClientsNote({
        new_clients_only: true,
        first_visit_lead_days: 7,
        first_visit_categories: ["lash", "brow"],
      })
    ).toEqual([
      "For first-time clients. Please book at least 7 days before your first lash or brow appointment.",
      "The business confirms this booking, so it is sent as a request.",
    ]);
  });

  it("handles one day, three categories and no categories", () => {
    expect(
      newClientsNote({
        new_clients_only: true,
        first_visit_lead_days: 1,
        first_visit_categories: ["hair", "nails", "lashes"],
      })[0]
    ).toBe(
      "For first-time clients. Please book at least 1 day before your first hair, nails or lashes appointment."
    );
    expect(
      newClientsNote({ new_clients_only: true, first_visit_lead_days: 3 })[0]
    ).toBe(
      "For first-time clients. Please book at least 3 days before your first appointment."
    );
  });

  it("skips the lead sentence without lead days", () => {
    for (const lead of [null, 0, undefined]) {
      expect(
        newClientsNote({
          new_clients_only: true,
          first_visit_lead_days: lead,
          first_visit_categories: ["lash"],
        })
      ).toEqual([
        "For first-time clients.",
        "The business confirms this booking, so it is sent as a request.",
      ]);
    }
  });

  it("has a short form for a booking that is already made", () => {
    expect(newClientsNote({ new_clients_only: true }, true)).toHaveLength(1);
  });
});

describe("splitLinks", () => {
  it("keeps plain text whole", () => {
    expect(splitLinks("Send to account 123\nthen WhatsApp us")).toEqual([
      { kind: "text", start: 0, text: "Send to account 123\nthen WhatsApp us" },
    ]);
  });

  it("links an http(s) address and keeps trailing punctuation as text", () => {
    expect(splitLinks("Pay at https://pay.example.com/babydoll.")).toEqual([
      { kind: "text", start: 0, text: "Pay at " },
      {
        kind: "link",
        start: 7,
        href: "https://pay.example.com/babydoll",
        text: "https://pay.example.com/babydoll",
      },
      { kind: "text", start: 39, text: "." },
    ]);
  });

  it("never links other schemes or addresses with a sign-in inside", () => {
    for (const text of [
      "javascript:alert(1)",
      "ftp://example.com/file",
      "data:text/html,<b>x</b>",
      "https://user:pass@example.com/",
      "https://",
    ]) {
      expect(splitLinks(text).every((part) => part.kind === "text")).toBe(true);
    }
  });
});

describe("splitLinks brackets", () => {
  const hrefs = (text: string) =>
    splitLinks(text).flatMap((part) =>
      part.kind === "link" ? [part.text] : []
    );

  it("keeps a balanced closing bracket in the address", () => {
    expect(hrefs("Pay at https://x.org/a_(b) today")).toEqual([
      "https://x.org/a_(b)",
    ]);
    expect(hrefs("https://x.org/a_(b).")).toEqual(["https://x.org/a_(b)"]);
  });

  it("drops a closing bracket that has no opener", () => {
    expect(hrefs("(see https://x.org/pay)")).toEqual(["https://x.org/pay"]);
    expect(hrefs("(see https://x.org/pay).")).toEqual(["https://x.org/pay"]);
  });
});
