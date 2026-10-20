import type { PublicSiteAdmin } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  normaliseOrigin,
  parseSiteCreate,
  parseSiteUpdate,
  siteNoticeFor,
  siteNoticeForStatus,
} from "@/lib/site-form";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const base = {
  name: "Barrels",
  site_url: "https://barrels.gd",
  contact_recipient: "hello@barrels.gd",
  accepts_contact: "on",
  turnstile_mode: "inherit",
  turnstile_site_key: "",
};

const current: PublicSiteAdmin = {
  id: "site_1",
  organisation_id: "org_1",
  key: "barrels",
  name: "Barrels",
  site_url: "https://barrels.gd",
  contact_recipient: "hello@barrels.gd",
  accepts_contact: true,
  accepts_subscriptions: false,
  turnstile_mode: "inherit",
  turnstile_site_key: null,
  turnstile_secret_set: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("site create", () => {
  it("accepts a valid site and leaves out an empty secret", () => {
    const parsed = parseSiteCreate(
      form({ ...base, key: "my-site-2" }),
      "org_1"
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        organisation_id: "org_1",
        key: "my-site-2",
        name: "Barrels",
        site_url: "https://barrels.gd",
        contact_recipient: "hello@barrels.gd",
        accepts_contact: true,
        accepts_subscriptions: false,
        turnstile_mode: "inherit",
        turnstile_site_key: null,
      },
    });
  });

  it("sends a typed secret", () => {
    const parsed = parseSiteCreate(
      form({ ...base, key: "a", turnstile_secret: " s3cret " }),
      "org_1"
    );
    expect(parsed.ok && parsed.value.turnstile_secret).toBe("s3cret");
  });

  it("rejects a bad key, a long key, a bad origin, a bad inbox and a bad mode", () => {
    const bad = (extra: Record<string, string>) =>
      parseSiteCreate(form({ ...base, key: "ok", ...extra }), "org_1").ok;
    expect(bad({ key: "Not Ok" })).toBe(false);
    expect(bad({ key: "-lead" })).toBe(false);
    expect(bad({ key: "a".repeat(41) })).toBe(false);
    expect(bad({ key: "a".repeat(40) })).toBe(true);
    expect(bad({ site_url: "https://barrels.gd/path" })).toBe(false);
    expect(bad({ site_url: "ftp://barrels.gd" })).toBe(false);
    expect(bad({ contact_recipient: "nope" })).toBe(false);
    expect(bad({ turnstile_mode: "maybe" })).toBe(false);
    expect(bad({ name: " " })).toBe(false);
  });

  it("normalises origins", () => {
    expect(normaliseOrigin("https://barrels.gd/")).toBe("https://barrels.gd");
    expect(normaliseOrigin("barrels.gd")).toBeUndefined();
  });
});

describe("site update", () => {
  it("sends only the fields that changed", () => {
    const parsed = parseSiteUpdate(
      form({ ...base, name: "Barrels Grenada", turnstile_mode: "enforce" }),
      current
    );
    expect(parsed).toEqual({
      ok: true,
      value: { name: "Barrels Grenada", turnstile_mode: "enforce" },
    });
  });

  it("sends nothing when nothing changed, and never an empty secret", () => {
    const parsed = parseSiteUpdate(form(base), current);
    expect(parsed).toEqual({ ok: true, value: {} });
  });

  it("clears a nullable field with null and sends a new secret", () => {
    const parsed = parseSiteUpdate(
      form({ ...base, contact_recipient: "", turnstile_secret: "new" }),
      current
    );
    expect(parsed).toEqual({
      ok: true,
      value: { contact_recipient: null, turnstile_secret: "new" },
    });
  });
});

describe("site notices", () => {
  it("maps 503 to the secret-storage message and 409 to a key conflict", () => {
    expect(siteNoticeForStatus(503)).toBe("secret-storage");
    expect(siteNoticeFor("secret-storage")?.text).toContain(
      "Secret storage is not configured"
    );
    expect(siteNoticeForStatus(409)).toBe("site-conflict");
    expect(siteNoticeForStatus(422)).toBe("site-invalid");
    expect(siteNoticeForStatus(500)).toBe("site-failed");
    expect(siteNoticeFor("<script>")).toBeUndefined();
  });
});
