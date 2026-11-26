import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  approveListing: vi.fn(),
  withdrawListing: vi.fn(),
}));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
const gate = vi.hoisted(() => ({ requireGate: vi.fn() }));

vi.mock("@/lib/bookings-listing-api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("@/lib/staff-gate", () => gate);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { approveListingAction, withdrawListingAction } = await import(
  "./actions"
);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirected(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) {
      return error.message.slice("REDIRECT:".length);
    }
    throw error;
  }
  throw new Error("expected a redirect");
}

const ORG = "11111111-2222-4333-8444-555555555555";

describe("bookings listing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.requireGate.mockResolvedValue({ status: "staff", accessToken: "tok" });
  });

  it("approve calls the client with the organisation id and returns to the queue", async () => {
    api.approveListing.mockResolvedValue({});
    const url = await redirected(
      approveListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(api.approveListing).toHaveBeenCalledWith("tok", ORG);
    expect(api.withdrawListing).not.toHaveBeenCalled();
    expect(url).toBe("/bookings/listings?queue=pending&notice=approved");
  });

  it("withdraw calls the client with the organisation id and keeps the queue", async () => {
    api.withdrawListing.mockResolvedValue({});
    const url = await redirected(
      withdrawListingAction(form({ organisation_id: ORG, queue: "approved" }))
    );
    expect(api.withdrawListing).toHaveBeenCalledWith("tok", ORG);
    expect(api.approveListing).not.toHaveBeenCalled();
    expect(url).toBe("/bookings/listings?queue=approved&notice=withdrawn");
  });

  it("maps a repeat approval (409) to a plain notice without reporting it", async () => {
    api.approveListing.mockRejectedValue(
      new AuthApiError(409, "This listing is already approved")
    );
    const url = await redirected(
      approveListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(url).toBe(
      "/bookings/listings?queue=pending&notice=already-approved"
    );
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("maps withdrawing a listing that is not approved (409) to not-approved", async () => {
    api.withdrawListing.mockRejectedValue(
      new AuthApiError(409, "This listing is not approved")
    );
    const url = await redirected(
      withdrawListingAction(form({ organisation_id: ORG, queue: "all" }))
    );
    expect(url).toBe("/bookings/listings?queue=all&notice=not-approved");
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("maps a refused permission (403) to forbidden without reporting it", async () => {
    api.approveListing.mockRejectedValue(new AuthApiError(403, "Forbidden"));
    const url = await redirected(
      approveListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(url).toBe("/bookings/listings?queue=pending&notice=forbidden");
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("reports unexpected API failures under admin-bookings-listings", async () => {
    const error = new AuthApiError(500, "boom");
    api.withdrawListing.mockRejectedValue(error);
    const url = await redirected(
      withdrawListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(url).toBe("/bookings/listings?queue=pending&notice=failed");
    expect(report.reportError).toHaveBeenCalledWith(
      error,
      "admin-bookings-listings"
    );
  });

  it("sends an ended session to sign-in", async () => {
    api.approveListing.mockRejectedValue(new AuthApiError(401, "x"));
    const url = await redirected(
      approveListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(url).toBe("/signin?sign_in=expired");
  });

  it("does not trust a malformed id and never calls the API", async () => {
    const url = await redirected(
      approveListingAction(form({ organisation_id: "../x", queue: "pending" }))
    );
    expect(url).toBe("/bookings/listings?queue=pending&notice=invalid");
    expect(api.approveListing).not.toHaveBeenCalled();
  });

  it("sends a non-staff session away without calling the API", async () => {
    gate.requireGate.mockResolvedValue({ status: "refused", email: "a@b.c" });
    const url = await redirected(
      withdrawListingAction(form({ organisation_id: ORG, queue: "pending" }))
    );
    expect(url).toBe("/");
    expect(api.withdrawListing).not.toHaveBeenCalled();
  });
});
