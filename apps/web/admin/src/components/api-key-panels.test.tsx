import type { ApiKeyPublic } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ApiKeysError,
  ApiKeysLoading,
  ApiKeysPanel,
} from "@/components/api-key-panels";
import { apiKeyNoticeFor, keyState } from "@/lib/api-key-form";

vi.mock("@/app/(console)/organisations/api-key-actions", () => ({
  revokeApiKeyAction: () => Promise.resolve(undefined as never),
}));

const NOW = new Date("2026-10-20T00:00:00Z");
const ROTATE = /rotate/i;
const CREATE = /create/i;
const NO_KEYS = /no API keys/;
const SECRET = "bk_abcd1234_supersecret";

const active: ApiKeyPublic = {
  id: "key_1",
  organisation_id: "org_1",
  name: "Booking widget",
  key_prefix: "abcd1234",
  scopes: ["bookings.read", "rewards.write"],
  expires_at: "2026-12-01T00:00:00Z",
  last_used_at: "2026-10-19T08:00:00Z",
  revoked_at: null,
  created_at: "2026-09-01T00:00:00Z",
};
const revoked: ApiKeyPublic = {
  ...active,
  id: "key_2",
  name: "Old key",
  key_prefix: "ffff0000",
  last_used_at: null,
  revoked_at: "2026-10-01T00:00:00Z",
};

describe("ApiKeysPanel", () => {
  it("shows prefix, scopes, expiry, last used and revoked state", () => {
    render(
      <ApiKeysPanel
        count={2}
        now={NOW}
        organisationId="org_1"
        rows={[active, revoked]}
      />
    );
    const [, first, second] = screen.getAllByRole("row");
    const one = within(first as HTMLElement);
    expect(one.getByText("abcd1234")).toBeTruthy();
    expect(one.getByText("bookings.read, rewards.write")).toBeTruthy();
    expect(one.getByText("2026-12-01")).toBeTruthy();
    expect(one.getByText("2026-10-19")).toBeTruthy();
    expect(one.getByText("Active")).toBeTruthy();
    expect(one.getByRole("button", { name: "Confirm revoke" })).toBeTruthy();
    const two = within(second as HTMLElement);
    expect(two.getByText("Revoked")).toBeTruthy();
    expect(two.getByText("Never used")).toBeTruthy();
    expect(two.queryByRole("button", { name: "Confirm revoke" })).toBeNull();
  });

  it("offers revoke only, never create or rotate, and never a secret", () => {
    const leaky = { ...active, secret: SECRET } as ApiKeyPublic;
    const { container } = render(
      <ApiKeysPanel count={1} now={NOW} organisationId="org_1" rows={[leaky]} />
    );
    expect(container.innerHTML).not.toContain(SECRET);
    expect(screen.queryByRole("button", { name: ROTATE })).toBeNull();
    expect(screen.queryByRole("button", { name: CREATE })).toBeNull();
  });

  it("says so when there are no keys", () => {
    render(
      <ApiKeysPanel count={0} now={NOW} organisationId="org_1" rows={[]} />
    );
    expect(screen.getByRole("status").textContent).toMatch(NO_KEYS);
  });

  it("shows loading and error states", () => {
    const { unmount } = render(<ApiKeysLoading />);
    expect(screen.getByText("Loading API keys")).toBeTruthy();
    unmount();
    render(<ApiKeysError />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});

describe("keyState", () => {
  it("ranks revoked over expired over active", () => {
    expect(keyState({ revoked_at: "2026-01-01T00:00:00Z" }, NOW)).toBe(
      "revoked"
    );
    expect(keyState({ expires_at: "2026-10-01T00:00:00Z" }, NOW)).toBe(
      "expired"
    );
    expect(keyState({ expires_at: null }, NOW)).toBe("active");
  });

  it("only maps fixed notice codes", () => {
    expect(apiKeyNoticeFor("key-revoked")?.tone).toBe("ok");
    expect(apiKeyNoticeFor("<b>")).toBeUndefined();
  });
});
