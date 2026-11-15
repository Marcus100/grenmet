import type { PrintixScanResult } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import type { ScanAnswer } from "@/lib/scan-api";
import {
  ADMITTED_DISMISS_MS,
  formatTime,
  verdictFor,
  waitText,
} from "@/lib/scan-outcome";

const AT = "2026-12-26T19:42:00Z";
const CLOCK_TIME = /\d{1,2}[:.]\d{2}/u;

function checked(result: PrintixScanResult): ScanAnswer {
  return { kind: "checked", result };
}

describe("verdictFor scan outcomes", () => {
  it("admits with a green screen that clears itself", () => {
    const verdict = verdictFor(
      checked({ outcome: "admitted", printed_number: "042" }),
      "camera"
    );
    expect(verdict).toMatchObject({
      tone: "admitted",
      title: "Admitted",
      detail: "Ticket 042 admitted.",
      autoDismissMs: ADMITTED_DISMISS_MS,
      sound: "admitted",
    });
  });

  it("admits without a printed number in the message", () => {
    expect(verdictFor(checked({ outcome: "admitted" }), "camera").detail).toBe(
      "Ticket admitted."
    );
  });

  it("refuses a second scan with the time and gate of the first admission", () => {
    const verdict = verdictFor(
      checked({
        outcome: "already_admitted",
        admitted_at: AT,
        admitted_gate: "Main gate",
      }),
      "camera"
    );
    expect(verdict.tone).toBe("refused");
    expect(verdict.title).toBe("Already admitted");
    expect(verdict.detail).toContain(formatTime(AT) ?? "missing");
    expect(verdict.detail).toContain("Main gate");
    expect(verdict.autoDismissMs).toBeNull();
    expect(verdict.sound).toBe("refused");
  });

  it("says when the time or the gate was not recorded", () => {
    expect(
      verdictFor(checked({ outcome: "already_admitted" }), "camera").detail
    ).toBe("Already admitted. The time was not recorded.");
    expect(
      verdictFor(
        checked({ outcome: "already_admitted", admitted_at: AT }),
        "camera"
      ).detail
    ).toContain("The gate was not recorded.");
  });

  it("refuses a void ticket", () => {
    expect(verdictFor(checked({ outcome: "void" }), "camera")).toMatchObject({
      tone: "refused",
      title: "Void ticket",
      autoDismissMs: null,
    });
  });

  it("refuses an unknown value, with different words for a typed number", () => {
    const scanned = verdictFor(checked({ outcome: "unknown" }), "camera");
    const typed = verdictFor(checked({ outcome: "unknown" }), "typed");
    expect(scanned).toMatchObject({ tone: "refused", title: "Not a ticket" });
    expect(typed.title).toBe("Not on this event");
    expect(typed.detail).toContain("typed numbers may be off");
  });

  it("refuses a closed event", () => {
    expect(
      verdictFor(checked({ outcome: "event_closed" }), "camera")
    ).toMatchObject({ tone: "refused", title: "Event closed" });
  });

  it("never treats an outcome it does not know as a yes", () => {
    const verdict = verdictFor(
      checked({ outcome: "future_code" } as unknown as PrintixScanResult),
      "camera"
    );
    expect(verdict.tone).toBe("unchecked");
    expect(verdict.sound).toBe("refused");
  });
});

describe("verdictFor failures", () => {
  it("shows a pairing problem as the pairing's fault, not the ticket's", () => {
    const notRecognised = verdictFor(
      { kind: "pairing", problem: "not-recognised" },
      "camera"
    );
    expect(notRecognised).toMatchObject({
      tone: "pairing",
      pairingProblem: "not-recognised",
      sound: null,
    });
    const revoked = verdictFor(
      { kind: "pairing", problem: "revoked-or-expired" },
      "camera"
    );
    expect(revoked.title).toBe("Pairing no longer valid");
    expect(revoked.pairingProblem).toBe("revoked-or-expired");
  });

  it("says how long to wait after too many scans", () => {
    expect(
      verdictFor({ kind: "rate-limited", retryAfterSeconds: 45 }, "camera")
    ).toMatchObject({
      tone: "refused",
      title: "Too many scans",
      detail: "Wait 45 seconds, then scan again.",
    });
  });

  it("reads one second in the singular", () => {
    expect(
      verdictFor({ kind: "rate-limited", retryAfterSeconds: 1 }, "camera")
        .detail
    ).toBe("Wait 1 second, then scan again.");
    expect(waitText(2)).toBe("2 seconds");
  });

  it("never admits when there is no signal, and says so in words", () => {
    const verdict = verdictFor({ kind: "no-signal" }, "camera");
    expect(verdict.tone).toBe("unchecked");
    expect(verdict.title).toBe("No signal: cannot check tickets");
    expect(verdict.detail).toContain("Nothing has been checked");
    expect(verdict.sound).toBe("refused");
  });

  it("does not admit when the server failed or refused the value", () => {
    expect(verdictFor({ kind: "failed" }, "camera").tone).toBe("unchecked");
    expect(verdictFor({ kind: "rejected" }, "typed")).toMatchObject({
      tone: "unchecked",
      title: "Value not read",
    });
  });
});

describe("formatTime", () => {
  it("formats a valid time and refuses an invalid one", () => {
    expect(formatTime(AT)).toMatch(CLOCK_TIME);
    expect(formatTime("not a time")).toBeNull();
  });
});
