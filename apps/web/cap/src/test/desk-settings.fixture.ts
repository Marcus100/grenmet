import type { CapSettingsPublic } from "@barrelsgd/api-client";

export function deskSettings(
  overrides: Partial<CapSettingsPublic> = {}
): CapSettingsPublic {
  return {
    contact: "gms@example.test",
    created_at: "2026-10-01T00:00:00Z",
    feed_limit: 50,
    id: "22222222-2222-4222-8222-222222222222",
    sender: "gms.gd",
    sender_name: "Grenada Meteorological Service",
    signing_certificate_ref: null,
    signing_enabled: false,
    updated_at: "2026-10-02T00:00:00Z",
    web: "https://gms.example.test",
    wmo_oid: null,
    ...overrides,
  };
}
