import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  startAppSubscriptionCheckout: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  findOrganisation,
  startAppSubscriptionCheckout,
} from "@/lib/studio-api";
import { startSubscriptionAction } from "./actions";

const SLUG = "sea-salt";
const IDLE = { status: "idle" } as const;
const CHECKOUT = "https://checkout.stripe.com/c/pay/cs_test_123";

function form(orgSlug: string = SLUG): FormData {
  const data = new FormData();
  data.set("orgSlug", orgSlug);
  return data;
}

function role(value: "member" | "admin") {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: SLUG,
    role: value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session);
  role("admin");
});

describe("startSubscriptionAction", () => {
  it("starts the Bookings plan and redirects to the Stripe checkout URL", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      url: CHECKOUT,
    });
    await expect(startSubscriptionAction(IDLE, form())).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(startAppSubscriptionCheckout).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      "bookings-monthly"
    );
    expect(redirect).toHaveBeenCalledWith(CHECKOUT);
  });

  it("takes the plan from the server, never from the form", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      url: CHECKOUT,
    });
    const data = form();
    data.set("plan_key", "bookings-free");
    await expect(startSubscriptionAction(IDLE, data)).rejects.toThrow();
    expect(startAppSubscriptionCheckout).toHaveBeenCalledWith(
      "tok",
      ORG_ID,
      "bookings-monthly"
    );
  });

  it("sends a member away before any billing call", async () => {
    role("member");
    const result = await startSubscriptionAction(IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      kind: "forbidden",
      message: "Only the business owner or an admin can manage the plan.",
    });
    expect(startAppSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("refuses a slug that is not a business slug, before any call", async () => {
    const result = await startSubscriptionAction(IDLE, form("../evil"));
    expect(result).toMatchObject({ status: "error", kind: "not_found" });
    expect(startAppSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("sends a signed-out person to sign in, keeping the plan page", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(startSubscriptionAction(IDLE, form())).rejects.toThrow(
      "NEXT_REDIRECT"
    );
    expect(redirect).toHaveBeenCalledWith(
      `/signin?${new URLSearchParams({ returnTo: `/studio/${SLUG}/plan` })}`
    );
    expect(startAppSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("returns the 409 wording with a reload step, and does not report it", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockRejectedValue(apiError(409));
    const result = await startSubscriptionAction(IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      kind: "conflict",
      message:
        "This business already has a subscription in progress or active.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("returns 'Billing is not switched on yet.' for a 503", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockRejectedValue(apiError(503));
    const result = await startSubscriptionAction(IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      kind: "unavailable",
      message: "Billing is not switched on yet.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a server fault and shows a plain message", async () => {
    const error = apiError(500);
    vi.mocked(startAppSubscriptionCheckout).mockRejectedValue(error);
    const result = await startSubscriptionAction(IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      message: "The plan is not available right now.",
    });
    expect(reportError).toHaveBeenCalledWith(error, "studio");
  });

  it("refuses a checkout URL that is not Stripe, and reports it", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockResolvedValue({
      id: "66666666-6666-4666-8666-666666666666",
      url: "https://evil.example/pay",
    });
    const result = await startSubscriptionAction(IDLE, form());
    expect(result).toMatchObject({
      status: "error",
      message: "Billing did not return a checkout page.",
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalled();
  });

  it("rethrows a non-API failure to error.tsx", async () => {
    vi.mocked(startAppSubscriptionCheckout).mockRejectedValue(
      new TypeError("boom")
    );
    await expect(startSubscriptionAction(IDLE, form())).rejects.toThrow("boom");
  });
});
