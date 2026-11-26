import type { AppSubscriptionPublic } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError, ORG_ID, session } from "@/test/studio";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(() => Promise.resolve(session)),
}));
vi.mock("@/lib/studio-api", () => ({
  findOrganisation: vi.fn(),
  listAppSubscriptions: vi.fn(),
  startAppSubscriptionCheckout: vi.fn(),
}));
vi.mock("./actions", () => ({
  startSubscriptionAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));

import { findOrganisation, listAppSubscriptions } from "@/lib/studio-api";
import PlanPage from "./page";

const SLUG = "sea-salt";
const params = Promise.resolve({ orgSlug: SLUG });
const PURCHASABLE = "bookings-monthly:XCD";
const NO_ACCESS = /Only the business owner or an admin can manage the plan/u;
const SUPPORT_LINK = "Email support@barrels.gd";
const USD_NOTE = /about USD 11\.11 a month, for reference/u;
const FREE_TRIAL_2099 = /Your free trial ends on 23 December 2099/u;
const ACTIVE_UNTIL = /Active until 23 December 2026/u;
const CONFIRMS_PAYMENT = /once Stripe confirms the payment/u;
const NOTHING_CHARGED = /Nothing was charged/u;
const SOON_TITLE = "Paid plans open soon";
const START = { name: "Start subscription" };
const CONTINUE = { name: "Continue checkout" };

function row(
  overrides: Partial<AppSubscriptionPublic> = {}
): AppSubscriptionPublic {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    app_key: "bookings",
    plan_key: "bookings-monthly",
    channel: "stripe",
    status: "active",
    currency: "XCD",
    amount_minor: 3000,
    current_period_end: "2026-12-23T12:00:00Z",
    cancel_at_period_end: false,
    trial_end: null,
    created_at: "2026-11-22T10:00:00Z",
    ...overrides,
  };
}

/** The list body the API returns: rows plus the purchasable plan keys. */
function listing(
  data: AppSubscriptionPublic[],
  purchasable: string[] | undefined = [PURCHASABLE]
) {
  return { data, purchasable };
}

function role(value: "member" | "admin") {
  vi.mocked(findOrganisation).mockResolvedValue({
    id: ORG_ID,
    name: "Sea Salt Spa",
    slug: SLUG,
    role: value,
  });
}

async function renderPage(search: Record<string, string> = {}): Promise<void> {
  render(
    await PlanPage({
      params,
      searchParams: Promise.resolve(search),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  role("admin");
  vi.mocked(listAppSubscriptions).mockResolvedValue(listing([]));
});

describe("/studio/[orgSlug]/plan", () => {
  it("shows the plan price, the USD note and the page heading", async () => {
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 1, name: "Plan & billing" })
    ).toBeInTheDocument();
    expect(screen.getByText("XCD 30 a month")).toBeInTheDocument();
    expect(screen.getByText(USD_NOTE)).toBeInTheDocument();
  });

  it("says No subscription yet and offers Start subscription when the plan is purchasable", async () => {
    await renderPage();
    expect(screen.getByText("No subscription yet")).toBeInTheDocument();
    expect(screen.getByRole("button", START)).toBeInTheDocument();
    expect(screen.queryByText(SOON_TITLE)).not.toBeInTheDocument();
  });

  it("hides Subscribe and says paid plans open soon when purchasable is missing", async () => {
    // No `purchasable` key at all (an older API body): not purchasable.
    vi.mocked(listAppSubscriptions).mockResolvedValue({ data: [] });
    await renderPage();
    expect(screen.getByText("No subscription yet")).toBeInTheDocument();
    expect(screen.getByText(SOON_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides Subscribe and says paid plans open soon when purchasable is empty", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(listing([], []));
    await renderPage();
    expect(screen.getByText(SOON_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not treat another plan or currency as purchasable", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([], ["bookings-monthly:USD", "events-monthly:XCD"])
    );
    await renderPage();
    expect(screen.getByText(SOON_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides Continue checkout too when the plan is not purchasable", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "incomplete" })], [])
    );
    await renderPage();
    expect(screen.getByText("Checkout not finished")).toBeInTheDocument();
    expect(screen.getByText(SOON_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", CONTINUE)).not.toBeInTheDocument();
  });

  it("offers Continue checkout while a checkout is open and the plan is purchasable", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "incomplete" })])
    );
    await renderPage();
    expect(screen.getByText("Checkout not finished")).toBeInTheDocument();
    expect(screen.getByRole("button", CONTINUE)).toBeInTheDocument();
    expect(screen.queryByText(SOON_TITLE)).not.toBeInTheDocument();
  });

  it("ignores another app's subscription rows", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ app_key: "events", status: "active" })])
    );
    await renderPage();
    expect(screen.getByText("No subscription yet")).toBeInTheDocument();
  });

  it("shows the free trial end date during a trial, with no paid-plans note", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ trial_end: "2099-12-23T12:00:00Z" })], [])
    );
    await renderPage();
    expect(screen.getByText("Free trial")).toBeInTheDocument();
    expect(screen.getByText(FREE_TRIAL_2099)).toBeInTheDocument();
    expect(screen.queryByText(SOON_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an active plan with its renewal day and no button", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(listing([row()]));
    await renderPage();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Renews on 23 December 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(SOON_TITLE)).not.toBeInTheDocument();
  });

  it("shows an ending plan with the day it stops", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ cancel_at_period_end: true })])
    );
    await renderPage();
    expect(screen.getByText("Ending")).toBeInTheDocument();
    expect(screen.getByText(ACTIVE_UNTIL)).toBeInTheDocument();
  });

  it("shows payment overdue for past_due, with no button", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "past_due" })])
    );
    await renderPage();
    expect(screen.getByText("Payment overdue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SUPPORT_LINK })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows unpaid with no button", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "unpaid" })])
    );
    await renderPage();
    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: SUPPORT_LINK })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows cancelled and offers to start again when purchasable", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "canceled" })])
    );
    await renderPage();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", START)).toBeInTheDocument();
  });

  it("shows cancelled with the paid-plans note and no button when not purchasable", async () => {
    vi.mocked(listAppSubscriptions).mockResolvedValue(
      listing([row({ status: "canceled" })], [])
    );
    await renderPage();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText(SOON_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says billing is not switched on yet when the billing read answers 503", async () => {
    vi.mocked(listAppSubscriptions).mockRejectedValue(apiError(503));
    await renderPage();
    expect(
      screen.getByText("Billing is not switched on yet.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No subscription yet")).not.toBeInTheDocument();
    expect(screen.queryByText(SOON_TITLE)).not.toBeInTheDocument();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports a refused sign-in for billing and says so, without claiming no plan", async () => {
    const error = apiError(401);
    vi.mocked(listAppSubscriptions).mockRejectedValue(error);
    await renderPage();
    expect(
      screen.getByText("We could not check this sign-in for the plan.")
    ).toBeInTheDocument();
    expect(screen.queryByText("No subscription yet")).not.toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(error, "studio");
  });

  it("keeps the price visible when the status read fails", async () => {
    vi.mocked(listAppSubscriptions).mockRejectedValue(apiError(500));
    await renderPage();
    expect(screen.getByText("XCD 30 a month")).toBeInTheDocument();
    expect(
      screen.getByText("The plan is not available right now.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("refuses a member before any billing call, with the plain reason", async () => {
    role("member");
    await renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(NO_ACCESS);
    expect(listAppSubscriptions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", START)).not.toBeInTheDocument();
  });

  it("shows a success banner when Stripe returns the person from checkout", async () => {
    await renderPage({ checkout: "success" });
    expect(screen.getByRole("status")).toHaveTextContent(CONFIRMS_PAYMENT);
  });

  it("shows a cancelled banner that says nothing was charged", async () => {
    await renderPage({ checkout: "cancelled" });
    expect(screen.getByRole("status")).toHaveTextContent(NOTHING_CHARGED);
  });

  it("shows no banner for an unknown return value", async () => {
    await renderPage({ checkout: "paid" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
