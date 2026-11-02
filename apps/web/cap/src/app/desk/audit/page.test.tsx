import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ listAuditEvents: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);

import Loading from "./loading";
import AuditPage from "./page";

const ALERT = "11111111-2222-4333-8444-555555555555";
const STATE_CHANGE = /APPROVED → PUBLISHED/;
const ACTOR = /Actor: 33333333/;

function event(overrides: Record<string, unknown> = {}) {
  return {
    action: "publish",
    actor_user_id: "33333333-3333-4333-8333-333333333333",
    alert_id: ALERT,
    created_at: "2026-10-30T12:00:00Z",
    id: "44444444-4444-4444-8444-444444444444",
    next_state: "PUBLISHED",
    note: null,
    payload: {},
    previous_state: "APPROVED",
    ...overrides,
  };
}

function page(params: Record<string, string | string[]> = {}) {
  return AuditPage({ searchParams: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
});

describe("/desk/audit", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the audit history"
    );
  });

  it("shows no access and does not read the trail without cap.alert.read", async () => {
    gate.requireDeskGate.mockResolvedValue(staffGate({ read: false }));
    render(await page());
    expect(
      screen.getByRole("heading", { name: "No access to the audit history" })
    ).toBeInTheDocument();
    expect(api.listAuditEvents).not.toHaveBeenCalled();
  });

  it("refuses a malformed page without calling the API", async () => {
    render(await page({ page: "2.5" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The page number must be a whole number"
    );
    expect(api.listAuditEvents).not.toHaveBeenCalled();
  });

  it("shows unavailable and reports an unexpected read failure", async () => {
    const boom = new Error("down");
    api.listAuditEvents.mockRejectedValue(boom);
    render(await page());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The audit history could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(
      boom,
      "cap-desk-audit-page"
    );
  });

  it("says so when nothing matches the filter", async () => {
    api.listAuditEvents.mockResolvedValue({
      count: 0,
      data: [],
      page: 1,
      size: 25,
    });
    render(await page({ alert_id: ALERT }));
    expect(
      screen.getByText("No audit events match this filter.")
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "0 events · page 1 of 1"
    );
  });

  it("lists events with their states and links to the next page", async () => {
    api.listAuditEvents.mockResolvedValue({
      count: 30,
      data: [event()],
      page: 1,
      size: 25,
    });
    render(await page());
    expect(
      screen.getByRole("heading", { name: "publish" })
    ).toBeInTheDocument();
    expect(screen.getByText(STATE_CHANGE)).toBeInTheDocument();
    expect(screen.getByText(ACTOR)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "30 events · page 1 of 2"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/desk/audit?page=2"
    );
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();
    expect(api.listAuditEvents).toHaveBeenCalledWith("token-test", {
      alertId: null,
      page: 1,
      size: 25,
    });
  });
});
