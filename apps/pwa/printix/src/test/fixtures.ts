import type {
  PrintixEventAnalytics,
  PrintixEventSummary,
  PrintixOfflineList,
  PrintixScanItem,
  PrintixScanPage,
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
 * valid "PX-0000000101" and "PX-0000000104", void "PX-0000000102",
 * admitted "PX-0000000103".
 */
export const OFFLINE_LIST: PrintixOfflineList = {
  event: SUMMARY.event,
  generated_at: "2026-12-26T19:00:00Z",
  hash_key: HASH_KEY,
  tickets: [
    {
      barcode_hash: "e5c08dbbac5dad78cf1b31f68381c734",
      printed_number: "301",
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
    {
      barcode_hash: "5f5b5596c042a142e5bfde157d07ebe6",
      printed_number: "104",
      state: "valid",
    },
  ],
};

/** "Now" for the analytics fixtures: the server's clock when the answer was made. */
export const ANALYTICS_NOW = "2026-12-26T23:30:00Z";

/** A busy night: two gates (one phone quiet for 25 minutes), refusals and an offline sync. */
export const ANALYTICS: PrintixEventAnalytics = {
  event: SUMMARY.event,
  generated_at: ANALYTICS_NOW,
  timezone: "America/Grenada",
  issued: 400,
  void: 2,
  admitted: 120,
  not_yet_in: 278,
  no_show_rate: 0.6985,
  first_admission_at: "2026-12-26T22:01:00Z",
  last_admission_at: "2026-12-26T23:28:00Z",
  admitted_last_10_minutes: 15,
  entry_rate_per_minute: 1.5,
  arrivals: [
    { starts_at: "2026-12-26T22:00:00Z", admitted: 10 },
    { starts_at: "2026-12-26T22:05:00Z", admitted: 0 },
    { starts_at: "2026-12-26T22:10:00Z", admitted: 40 },
    { starts_at: "2026-12-26T22:15:00Z", admitted: 20 },
  ],
  busiest_5_minutes: {
    starts_at: "2026-12-26T22:10:00Z",
    minutes: 5,
    admitted: 40,
  },
  busiest_15_minutes: {
    starts_at: "2026-12-26T22:05:00Z",
    minutes: 15,
    admitted: 60,
  },
  gates: [
    {
      gate: "Main gate",
      admitted: 90,
      refused: 10,
      scans: 100,
      typed_scans: 5,
      typed_share: 0.05,
      admitted_share: 0.75,
      last_scan_at: "2026-12-26T23:29:00Z",
      phones: [
        {
          id: "a1000000-0000-4000-8000-000000000001",
          last_scan_at: "2026-12-26T23:29:00Z",
          active: true,
        },
      ],
    },
    {
      gate: "North gate",
      admitted: 30,
      refused: 2,
      scans: 32,
      typed_scans: 0,
      typed_share: 0,
      admitted_share: 0.25,
      last_scan_at: "2026-12-26T23:05:00Z",
      phones: [
        {
          id: "a1000000-0000-4000-8000-000000000002",
          last_scan_at: "2026-12-26T23:05:00Z",
          active: true,
        },
      ],
    },
  ],
  refusals: [
    { reason: "already_admitted", count: 8 },
    { reason: "void", count: 1 },
    { reason: "unknown", count: 3 },
    { reason: "event_closed", count: 0 },
  ],
  offline: { synced_late: 4, conflicts: 1, longest_delay_seconds: 1500 },
};

/** The same event before anything happened: every part must still be shown. */
export const EMPTY_ANALYTICS: PrintixEventAnalytics = {
  ...ANALYTICS,
  admitted: 0,
  not_yet_in: 398,
  no_show_rate: 1,
  first_admission_at: null,
  last_admission_at: null,
  admitted_last_10_minutes: 0,
  entry_rate_per_minute: 0,
  arrivals: [],
  busiest_5_minutes: null,
  busiest_15_minutes: null,
  gates: [],
  refusals: [
    { reason: "already_admitted", count: 0 },
    { reason: "void", count: 0 },
    { reason: "unknown", count: 0 },
    { reason: "event_closed", count: 0 },
  ],
  offline: { synced_late: 0, conflicts: 0, longest_delay_seconds: null },
};

export const SCAN_ADMITTED: PrintixScanItem = {
  id: "b2000000-0000-4000-8000-000000000001",
  scanned_at: "2026-12-26T23:29:10Z",
  gate: "Main gate",
  printed_number: "205",
  outcome: "admitted",
  typed: false,
  offline: false,
};

export const SCAN_TYPED_REFUSED: PrintixScanItem = {
  id: "b2000000-0000-4000-8000-000000000002",
  scanned_at: "2026-12-26T23:28:40Z",
  gate: "Main gate",
  printed_number: "301",
  outcome: "already_admitted",
  typed: true,
  offline: false,
};

export const SCAN_OFFLINE_UNKNOWN: PrintixScanItem = {
  id: "b2000000-0000-4000-8000-000000000003",
  scanned_at: "2026-12-26T23:20:00Z",
  gate: "North gate",
  printed_number: null,
  outcome: "unknown",
  typed: false,
  offline: true,
};

export const SCANS: PrintixScanPage = {
  items: [SCAN_ADMITTED, SCAN_TYPED_REFUSED, SCAN_OFFLINE_UNKNOWN],
  total: 132,
  page: 1,
  size: 20,
};

export const EMPTY_SCANS: PrintixScanPage = {
  items: [],
  total: 0,
  page: 1,
  size: 20,
};
