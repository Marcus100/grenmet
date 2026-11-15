import type { PrintixEventSummary } from "@barrelsgd/api-client";

/** A pairing secret of the real shape (43 characters). Never a real credential. */
export const SECRET = "Q".repeat(43);

export const API_ORIGIN = "https://api.example.test";

export const SUMMARY: PrintixEventSummary = {
  event: {
    id: "9f1c2a7e-3b4d-4e5f-8a6b-7c8d9e0f1a2b",
    name: "Harbour Night Market",
    event_date: "2026-12-26",
    closes_at: "2026-12-27T04:00:00Z",
    status: "open",
    created_at: "2026-11-15T10:00:00Z",
  },
  issued: 400,
  void: 2,
  admitted: 120,
  not_yet_in: 278,
  duplicates_refused: 3,
  admitted_by_gate: [{ gate: "Main gate", admitted: 120 }],
};
