import type { PrintixImportReport } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { readPairingFragment } from "@/lib/pairing";
import {
  formProblem,
  MAX_DAYS_AHEAD,
  MAX_DAYS_CLOSING_AFTER_EVENT,
} from "@/organiser/create-event";
import { problemMessage, problemOf } from "@/organiser/errors";
import { isEventClosed } from "@/organiser/event-state";
import {
  addDays,
  grenadaLocalToIso,
  localDatePart,
  utcToday,
} from "@/organiser/format";
import { codeLabel, codeState } from "@/organiser/gate-codes-section";
import {
  canImport,
  MAX_IMPORT_BYTES,
  SAMPLE_CSV,
  weakBarcodeWarning,
} from "@/organiser/import-section";
import { pairingLink, qrMatrix } from "@/organiser/qr";
import { ticketAction } from "@/organiser/tickets-section";

function report(
  overrides: Partial<PrintixImportReport> = {}
): PrintixImportReport {
  return {
    dry_run: true,
    applied: false,
    rows: 3,
    to_add: 3,
    errors: [],
    errors_truncated: false,
    warnings: [],
    short_barcodes: 0,
    barcode_equals_number: 0,
    ...overrides,
  };
}

describe("Grenada time", () => {
  it("sends a local time with the fixed Grenada offset", () => {
    expect(grenadaLocalToIso("2026-12-27T00:00")).toBe(
      "2026-12-27T00:00:00-04:00"
    );
    expect(grenadaLocalToIso("2026-12-27T23:59:30")).toBe(
      "2026-12-27T23:59:30-04:00"
    );
  });

  it("does its date arithmetic on whole calendar days", () => {
    expect(addDays("2026-12-26", 7)).toBe("2027-01-02");
    expect(localDatePart("2026-12-27T00:00")).toBe("2026-12-27");
    expect(utcToday(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-16");
  });
});

describe("create-event rules (mirror the server)", () => {
  const today = "2026-11-16";
  const base = {
    name: "Night market",
    eventDate: "2026-12-26",
    closesAt: "2026-12-27T00:00",
  };

  it("accepts a valid event", () => {
    expect(formProblem(base, today)).toBeNull();
  });

  it("refuses an empty name, a missing date and a missing closing time", () => {
    expect(formProblem({ ...base, name: "  " }, today)).toBe(
      "Give the event a name."
    );
    expect(formProblem({ ...base, eventDate: "" }, today)).toBe(
      "Choose the event date."
    );
    expect(formProblem({ ...base, closesAt: "" }, today)).toBe(
      "Choose the closing time."
    );
  });

  it("refuses a date more than a year ahead, and allows exactly a year", () => {
    const limit = addDays(today, MAX_DAYS_AHEAD);
    expect(formProblem({ ...base, eventDate: addDays(limit, 1) }, today)).toBe(
      "The event date can be at most one year ahead."
    );
    expect(
      formProblem(
        { ...base, eventDate: limit, closesAt: `${limit}T00:00` },
        today
      )
    ).toBeNull();
  });

  it("refuses a closing time before the event date, and more than seven days after", () => {
    expect(formProblem({ ...base, closesAt: "2026-12-25T23:00" }, today)).toBe(
      "The closing time cannot be before the event date."
    );
    const latest = addDays(base.eventDate, MAX_DAYS_CLOSING_AFTER_EVENT);
    expect(
      formProblem({ ...base, closesAt: `${addDays(latest, 1)}T00:00` }, today)
    ).toBe("The event closes at most seven days after the event date.");
    expect(
      formProblem({ ...base, closesAt: `${latest}T00:00` }, today)
    ).toBeNull();
  });
});

describe("the ticket import rules", () => {
  it("has no warning when both barcode counts are zero", () => {
    expect(weakBarcodeWarning(report())).toBeNull();
  });

  it("warns about short barcodes in plain words", () => {
    expect(weakBarcodeWarning(report({ short_barcodes: 4 }))).toBe(
      "Across this event, 4 barcodes are shorter than 12 characters. Offline checking will be off for this event."
    );
  });

  it("warns about barcodes equal to the printed number, and combines both", () => {
    expect(weakBarcodeWarning(report({ barcode_equals_number: 1 }))).toBe(
      "Across this event, 1 is the same as the printed number. Offline checking will be off for this event."
    );
    expect(
      weakBarcodeWarning(
        report({ short_barcodes: 2, barcode_equals_number: 3 })
      )
    ).toBe(
      "Across this event, 2 barcodes are shorter than 12 characters and 3 are the same as the printed number. Offline checking will be off for this event."
    );
  });

  it("treats counts the answer omits as zero", () => {
    const omitted = {
      ...report(),
      short_barcodes: undefined,
      barcode_equals_number: undefined,
    };
    expect(weakBarcodeWarning(omitted as PrintixImportReport)).toBeNull();
  });

  it("allows an import only after a clean trial with rows to add", () => {
    expect(canImport(null)).toBe(false);
    expect(canImport(report({ to_add: 0 }))).toBe(false);
    expect(canImport(report({ errors: [{ line: 4, message: "bad" }] }))).toBe(
      false
    );
    expect(canImport(report({ errors_truncated: true }))).toBe(false);
    expect(canImport(report())).toBe(true);
  });

  it("keeps the sample small and offline-safe, and the limit at 2 MB", () => {
    expect(SAMPLE_CSV.split("\n")[0]).toBe("number,barcode");
    expect(MAX_IMPORT_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("gate codes and tickets", () => {
  const now = new Date("2026-12-27T00:00:00Z");
  const code = {
    id: "p1",
    gate: "North",
    created_at: "2026-12-26T10:00:00Z",
    expires_at: "2026-12-27T06:00:00Z",
    revoked_at: null,
    allow_typed_numbers: false,
  };

  it("reads a code's state: active, cancelled or expired", () => {
    expect(codeState(code, new Date("2026-12-26T12:00:00Z"))).toBe("active");
    expect(
      codeState({ ...code, revoked_at: "2026-12-26T11:00:00Z" }, now)
    ).toBe("cancelled");
    expect(codeState(code, new Date("2026-12-27T07:00:00Z"))).toBe("expired");
  });

  it("offers the right ticket action, and none once the event is closed or the ticket is in", () => {
    const valid = {
      id: "t",
      printed_number: "101",
      status: "valid",
      admitted_at: null,
      admitted_gate: null,
    } as const;
    expect(ticketAction(valid, false)).toBe("void");
    expect(ticketAction({ ...valid, status: "void" }, false)).toBe("restore");
    expect(ticketAction(valid, true)).toBe("none");
    expect(
      ticketAction({ ...valid, admitted_at: "2026-12-26T19:00:00Z" }, false)
    ).toBe("none");
  });

  it("builds the pairing link on this origin with the secret in the fragment", () => {
    expect(pairingLink("https://scan.barrels.gd", "S".repeat(43))).toBe(
      `https://scan.barrels.gd/#pair=${"S".repeat(43)}`
    );
  });

  it("draws the QR code as dark modules, with no injected markup", () => {
    const matrix = qrMatrix(
      pairingLink("https://scan.barrels.gd", "S".repeat(43))
    );
    expect(matrix.size).toBeGreaterThan(20);
    expect(matrix.path.startsWith("M")).toBe(true);
    expect(matrix.path).not.toContain("<");
  });
});

describe("the new error words", () => {
  it("maps the write statuses to plain sentences", () => {
    const problemFrom = (
      status: number,
      data: unknown,
      headers?: Record<string, string>
    ) => {
      const error = new Error("x") as Error & {
        status: number;
        data: unknown;
        response: Response;
      };
      error.name = "ResponseError";
      error.status = status;
      error.data = data;
      error.response = new Response(null, { status, headers });
      return problemOf(error);
    };
    expect(
      problemMessage(
        problemFrom(409, {
          detail:
            "This event already has 20 active gate codes. Cancel one before making another.",
        })
      )
    ).toBe(
      "This event already has 20 active gate codes. Cancel one before making another."
    );
    expect(
      problemFrom(409, {
        detail: "This event is closed, so its tickets cannot change",
      })
    ).toEqual({
      kind: "event-closed",
    });
    expect(
      problemFrom(409, {
        detail: "This ticket was already admitted, so it cannot be voided",
      })
    ).toEqual({ kind: "already-admitted" });
    expect(problemFrom(409, { detail: "Something else" })).toEqual({
      kind: "conflict",
    });
    expect(problemFrom(413, { detail: "too big" })).toEqual({
      kind: "too-large",
    });
    expect(
      problemFrom(403, {
        detail:
          "Only an organiser may turn typed printed numbers on for a gate code.",
      })
    ).toEqual({ kind: "typed-numbers-refused" });
    expect(problemFrom(429, {}, { "Retry-After": "45" })).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 45,
    });
  });

  it("shows server validation sentences without the pydantic prefix", () => {
    const error = new Error("x") as Error & {
      status: number;
      data: unknown;
      response: Response;
    };
    error.name = "ResponseError";
    error.status = 422;
    error.data = {
      detail: [],
      errors: [
        {
          type: "value_error",
          loc: ["body"],
          msg: "Value error, event_date must be no more than a year ahead",
        },
      ],
    };
    error.response = new Response(null, { status: 422 });
    const problem = problemOf(error);
    expect(problem).toEqual({
      kind: "invalid",
      messages: ["event_date must be no more than a year ahead"],
    });
    expect(problemMessage(problem)).toBe(
      "event_date must be no more than a year ahead"
    );
  });
});

describe("review fixes: blocking warnings, closed events and the pairing link", () => {
  it("does not allow an import while the trial has blank-barcode warnings", () => {
    expect(
      canImport(
        report({
          warnings: [
            "2 row(s) have a blank barcode, so their printed number is used as the barcode (first on line 3).",
          ],
        })
      )
    ).toBe(false);
  });

  it("treats an event as closed when its status says so or its closing time has passed", () => {
    const open = { status: "open", closes_at: "2026-12-27T04:00:00Z" } as const;
    expect(isEventClosed(open, new Date("2026-12-27T03:59:00Z"))).toBe(false);
    expect(isEventClosed(open, new Date("2026-12-27T04:00:00Z"))).toBe(true);
    expect(
      isEventClosed(
        { ...open, status: "closed" },
        new Date("2026-12-26T00:00:00Z")
      )
    ).toBe(true);
  });

  it("says an ended code is ended because the event closed, unless it was cancelled", () => {
    const code = {
      id: "p1",
      gate: "North",
      created_at: "2026-12-26T10:00:00Z",
      expires_at: "2026-12-30T00:00:00Z",
      revoked_at: null,
      allow_typed_numbers: false,
    };
    const now = new Date("2026-12-26T12:00:00Z");
    expect(codeLabel(code, now, false)).toBe("Active");
    expect(codeLabel(code, now, true)).toBe("Ended (event closed)");
    expect(
      codeLabel({ ...code, revoked_at: "2026-12-26T11:00:00Z" }, now, true)
    ).toBe("Cancelled");
  });

  it("builds the pairing link and reads its secret back through the gate's own reader", () => {
    const secret = "Q7_x-".repeat(9).slice(0, 43);
    const link = pairingLink("https://scan.barrels.gd", secret);
    const hash = new URL(link).hash;
    expect(readPairingFragment(hash)).toEqual({ kind: "paired", secret });
  });
});
