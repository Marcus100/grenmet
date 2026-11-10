import type {
  CapAlertPublic,
  CapInfoPublic,
  CapLifecycleState,
} from "@barrelsgd/api-client";
import type { CapAction } from "@/lib/desk/allowed-actions";

const ALERT_ID = "11111111-2222-4333-8444-555555555555";

/**
 * What the API offers per state, as `allowed_actions` (mirrors OFFERED_ACTIONS
 * and TRANSITIONS in apps/api/fastapi/src/cap/transitions.py). Tests can pass
 * their own list to check that the buttons follow the API, not the state.
 */
const OFFERED_BY_STATE: Record<CapLifecycleState, CapAction[]> = {
  APPROVED: ["publish", "emergency_publish"],
  CANCELLED: [],
  DRAFT: ["submit", "emergency_publish"],
  EXPIRED: [],
  PUBLISHED: ["cancel", "expire"],
  SUBMITTED: ["approve", "emergency_publish"],
};

export function deskInfo(
  overrides: Partial<CapInfoPublic> = {}
): CapInfoPublic {
  return {
    areas: [
      {
        area_desc: "Saint Andrew",
        geocodes: [{ value: "GD-01", value_name: "ISO3166-2:GD" }],
        id: "a1",
        kind: "GEOCODE",
        sequence: 0,
      },
    ],
    categories: ["Met"],
    certainty: "Likely",
    contact: "meteorology@gaa.gd",
    description: "Heavy rain is expected.",
    effective: "2026-11-01T12:00:00Z",
    event: "Heavy Rainfall",
    expires: "2026-11-02T12:00:00Z",
    headline: "Heavy Rainfall Warning",
    id: "i1",
    instruction: "Avoid flooded roads.",
    language: "en",
    parameters: [
      { value: "Warning", value_name: "GMS:product" },
      { value: "3; orange; Severe", value_name: "awareness_level" },
      { value: "marine", value_name: "GMS:sectors" },
    ],
    resources: [],
    sender_name: "Grenada Meteorological Service",
    sequence: 0,
    severity: "Severe",
    urgency: "Expected",
    web: null,
    ...overrides,
  };
}

export function deskAlert(
  overrides: Partial<CapAlertPublic> = {}
): CapAlertPublic {
  const lifecycleState = overrides.lifecycle_state ?? "DRAFT";
  return {
    allowed_actions: OFFERED_BY_STATE[lifecycleState],
    created_at: "2026-11-01T11:00:00Z",
    created_by_user_id: "author-id",
    id: ALERT_ID,
    identifier: "urn:oid:2.49.0.0.308.0:test-1",
    import_source: null,
    incidents: [],
    info: [deskInfo()],
    lifecycle_state: lifecycleState,
    msg_type: "Alert",
    note: null,
    references: [],
    schema_conformant: true,
    schema_error: null,
    scope: "Public",
    sender: "meteorology@gaa.gd",
    sent: "2026-11-01T11:00:00Z",
    status: "Actual",
    updated_at: "2026-11-01T11:00:00Z",
    updated_by_user_id: "author-id",
    ...overrides,
  } as CapAlertPublic;
}
