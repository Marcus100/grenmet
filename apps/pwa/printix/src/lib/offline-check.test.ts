import { describe, expect, it } from "vitest";
import {
  conflictText,
  decideOffline,
  TYPED_OFFLINE_VERDICT,
} from "@/lib/offline-check";
import type { ListMeta, StoredTicket } from "@/lib/offline-store";

const META: ListMeta = {
  closesAt: "2026-12-27T04:00:00Z",
  eventId: "event-1",
  eventName: "Harbour Night Market",
  eventStatus: "open",
  fetchedAt: "2026-12-26T19:00:00.000Z",
  generatedAt: "2026-12-26T19:00:00Z",
  hashKey: "key",
  pairingTag: "tag",
};

const ticket = (overrides: Partial<StoredTicket> = {}): StoredTicket => ({
  hash: "h",
  printedNumber: "101",
  state: "valid",
  admittedAt: null,
  admittedGate: null,
  admittedHere: false,
  ...overrides,
});

describe("decideOffline", () => {
  it("admits a valid ticket in green and says it will be sent later", () => {
    const decision = decideOffline(ticket(), META, "camera");
    expect(decision.kind).toBe("admit");
    expect(decision.verdict).toMatchObject({
      tone: "admitted",
      title: "Admitted",
      sound: "admitted",
    });
    expect(decision.verdict.detail).toContain("Ticket 101 admitted.");
    expect(decision.verdict.detail).toContain("No signal");
  });

  it("refuses a ticket already admitted elsewhere, naming the gate", () => {
    const decision = decideOffline(
      ticket({
        state: "admitted",
        admittedAt: "2026-12-26T19:14:00Z",
        admittedGate: "North gate",
      }),
      META,
      "camera"
    );
    expect(decision.kind).toBe("refuse");
    expect(decision.verdict.title).toBe("Already admitted");
    expect(decision.verdict.detail).toContain("North gate");
  });

  it("refuses a ticket this phone already admitted with no signal", () => {
    const decision = decideOffline(
      ticket({
        state: "admitted",
        admittedHere: true,
        admittedAt: "2026-12-26T20:01:00Z",
      }),
      META,
      "camera"
    );
    expect(decision.kind).toBe("refuse");
    expect(decision.verdict.detail).toContain("on this phone");
  });

  it("refuses a void ticket and a barcode not on the list", () => {
    expect(
      decideOffline(ticket({ state: "void" }), META, "camera").verdict.title
    ).toBe("Void ticket");
    const unknown = decideOffline(undefined, META, "camera");
    expect(unknown.kind).toBe("refuse");
    expect(unknown.verdict.title).toBe("Not on the ticket list");
  });

  it("refuses everyone once the event has closed", () => {
    const decision = decideOffline(
      ticket(),
      { ...META, eventStatus: "closed" },
      "camera"
    );
    expect(decision).toMatchObject({
      kind: "refuse",
      verdict: { title: "Event closed" },
    });
  });

  it("refuses everyone at or after the scheduled close, even if the list says open", () => {
    const closing = new Date("2026-12-27T04:00:00Z");
    expect(decideOffline(ticket(), META, "camera", closing)).toMatchObject({
      kind: "refuse",
      verdict: { title: "Event closed" },
    });
    expect(
      decideOffline(ticket(), META, "camera", new Date("2026-12-27T03:59:00Z"))
        .kind
    ).toBe("admit");
  });

  it("never checks a typed number offline", () => {
    expect(decideOffline(ticket(), META, "typed")).toEqual({
      kind: "refuse",
      verdict: TYPED_OFFLINE_VERDICT,
    });
    expect(TYPED_OFFLINE_VERDICT.tone).toBe("unchecked");
  });
});

describe("conflictText", () => {
  it("names the ticket, the other gate and the time", () => {
    const text = conflictText({
      outcome: "already_admitted",
      printedNumber: "123",
      admittedAt: "2026-12-26T20:14:00Z",
      admittedGate: "North",
    });
    expect(text).toMatch(CONFLICT_AT_GATE);
  });

  it("says what went wrong for every other outcome", () => {
    const base = { printedNumber: "9", admittedAt: null, admittedGate: null };
    expect(conflictText({ ...base, outcome: "void" })).toBe(
      "Ticket 9: the ticket is void."
    );
    expect(conflictText({ ...base, outcome: "event_closed" })).toBe(
      "Ticket 9: scanned after the event closed."
    );
    expect(conflictText({ ...base, outcome: "unknown" })).toBe(
      "Ticket 9: not recognised by the server."
    );
    expect(conflictText({ ...base, outcome: "already_admitted" })).toBe(
      "Ticket 9: also admitted elsewhere."
    );
  });
});

const CONFLICT_AT_GATE = /^Ticket 123: also admitted at North at .+\.$/u;
