import type { BookingMyChoices } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMyChoices } from "@/lib/booking-api";
import { getSession } from "@/lib/session";
import { loadVisitor, SIGN_OUT_ACTION } from "@/lib/signed-in-visitor";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/booking-api", () => ({ getMyChoices: vi.fn() }));

const session = {
  accessToken: "ada-own-token",
  email: "ada@example.com",
  fullName: "Ada Lovelace",
  name: "Ada Lovelace",
};
const choices: BookingMyChoices = {
  phone: "+1 473 555 0100",
  recent: [
    {
      service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
      provider_id: "a1b2c3d4-0000-4000-8000-000000000001",
      last_booked_at: "2026-11-01T14:00:00Z",
    },
  ],
};

beforeEach(() => {
  vi.mocked(getSession).mockReset();
  vi.mocked(getMyChoices).mockReset();
  reportError.mockReset();
});

describe("loadVisitor", () => {
  it("is null for a guest and asks the API for nothing", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(await loadVisitor("sea-salt")).toBeNull();
    expect(getMyChoices).not.toHaveBeenCalled();
  });

  it("prefills from the account and shortcuts from the person's own history", async () => {
    vi.mocked(getSession).mockResolvedValue(session);
    vi.mocked(getMyChoices).mockResolvedValue(choices);
    expect(await loadVisitor("sea-salt")).toEqual({
      bookAgain: [
        {
          providerId: "a1b2c3d4-0000-4000-8000-000000000001",
          serviceId: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
        },
      ],
      signedIn: {
        email: "ada@example.com",
        name: "Ada Lovelace",
        phone: "+1 473 555 0100",
        signOutAction: SIGN_OUT_ACTION,
      },
    });
    // Always the session's own token: the API answers for that person only.
    expect(getMyChoices).toHaveBeenCalledWith("sea-salt", "ada-own-token");
  });

  it("is a person with no history: details only, no shortcuts", async () => {
    vi.mocked(getSession).mockResolvedValue(session);
    vi.mocked(getMyChoices).mockResolvedValue({ phone: null, recent: [] });
    const visitor = await loadVisitor("sea-salt");
    expect(visitor?.bookAgain).toEqual([]);
    expect(visitor?.signedIn.phone).toBe("");
  });

  it("keeps the name empty when the account has none, so the email is not typed as a name", async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...session,
      fullName: "",
      name: "ada@example.com",
    });
    vi.mocked(getMyChoices).mockResolvedValue(null);
    const visitor = await loadVisitor("sea-salt");
    expect(visitor?.signedIn.name).toBe("");
    expect(visitor?.signedIn.email).toBe("ada@example.com");
  });

  it("still prefills when the history cannot be read, and reports it", async () => {
    vi.mocked(getSession).mockResolvedValue(session);
    vi.mocked(getMyChoices).mockRejectedValue(new Error("api down"));
    const visitor = await loadVisitor("sea-salt");
    expect(visitor?.signedIn.email).toBe("ada@example.com");
    expect(visitor?.bookAgain).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "bookings-public-choices"
    );
  });

  it("treats a sign-in fault as a guest and reports it without personal data", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("auth down"));
    expect(await loadVisitor("sea-salt")).toBeNull();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "bookings-public-session"
    );
    for (const call of reportError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });
});
