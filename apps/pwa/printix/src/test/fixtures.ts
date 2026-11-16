import type {
  PrintixEventSummary,
  PrintixOfflineList,
} from "@barrelsgd/api-client";

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
  offline_conflicts: 0,
  admitted_by_gate: [{ gate: "Main gate", admitted: 120 }],
};

/** The hash key of the offline list fixture (the pairing's random id, hex). */
export const HASH_KEY = "5b0d3f1e8c2a4d6b9e7f1a3c5e7d9b2f";

/**
 * An offline list. The hashes are the real HMAC of these barcodes with
 * HASH_KEY, so the phone's own hashing finds them:
 * valid "PX-0000000101", void "PX-0000000102", admitted "PX-0000000103".
 */
export const OFFLINE_LIST: PrintixOfflineList = {
  event: SUMMARY.event,
  generated_at: "2026-12-26T19:00:00Z",
  hash_key: HASH_KEY,
  tickets: [
    {
      barcode_hash: "e5c08dbbac5dad78cf1b31f68381c734",
      printed_number: "101",
      state: "valid",
    },
    {
      barcode_hash: "24a83bb191718e7872af18401bf96641",
      printed_number: "102",
      state: "void",
    },
    {
      barcode_hash: "57f8a75bf479bb28218e4567d51ab207",
      printed_number: "103",
      state: "admitted",
      admitted_at: "2026-12-26T19:14:00Z",
      admitted_gate: "North gate",
    },
  ],
};
