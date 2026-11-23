import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskAlert } from "@/test/desk-alert.fixture";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ getAlert: vi.fn(), getAlertAudit: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/report-error", () => report);
vi.mock("@/components/desk/alert-actions", () => ({
  AlertActions: () => null,
}));
vi.mock("@/components/desk/duplicate-alert-button", () => ({
  DuplicateAlertButton: () => null,
}));

import DeskAlertPage from "./page";

const ID = "11111111-2222-4333-8444-555555555555";
const AUDIT_UNAVAILABLE = /The audit history could not be loaded/u;

function page() {
  return DeskAlertPage({ params: Promise.resolve({ id: ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
  api.getAlertAudit.mockResolvedValue({
    count: 0,
    data: [],
    page: 1,
    size: 50,
  });
});

describe("/desk/alerts/[id] CAP XML link", () => {
  it("links to the alert's CAP XML when the API has one", async () => {
    api.getAlert.mockResolvedValue(
      deskAlert({ id: ID, xml_url: "/api/cap/x.xml" })
    );
    render(await page());
    expect(
      screen.getByRole("link", { name: "CAP XML for this alert" })
    ).toHaveAttribute(
      "href",
      "/feeds/alerts/urn%3Aoid%3A2.49.0.0.308.0%3Atest-1.xml"
    );
  });

  it("shows no XML link for an alert that has no XML yet", async () => {
    api.getAlert.mockResolvedValue(deskAlert({ id: ID, xml_url: null }));
    render(await page());
    expect(
      screen.queryByRole("link", { name: "CAP XML for this alert" })
    ).toBeNull();
  });
});

describe("/desk/alerts/[id] audit history", () => {
  const REVIEWER = "33333333-3333-4333-8333-333333333333";

  it("shows this alert's trail with the emergency reason and the state change", async () => {
    api.getAlert.mockResolvedValue(deskAlert({ id: ID }));
    api.getAlertAudit.mockResolvedValue({
      count: 1,
      data: [
        {
          action: "emergency_publish",
          actor_user_id: REVIEWER,
          alert_id: ID,
          created_at: "2026-10-30T12:00:00Z",
          id: "44444444-4444-4444-8444-444444444444",
          next_state: "PUBLISHED",
          note: "Flooding reported on the east coast",
          payload: {},
          previous_state: "DRAFT",
        },
      ],
      page: 1,
      size: 50,
    });
    render(await page());
    const section = screen.getByRole("region", {
      name: "Audit history for this alert",
    });
    expect(section).toHaveTextContent("emergency_publish");
    expect(section).toHaveTextContent("Actor: 33333333");
    expect(section).toHaveTextContent("DRAFT → PUBLISHED");
    expect(section).toHaveTextContent("Flooding reported on the east coast");
    expect(api.getAlertAudit).toHaveBeenCalledWith(expect.any(String), ID);
  });

  it("says so when the alert has no history, instead of hiding the section", async () => {
    api.getAlert.mockResolvedValue(deskAlert({ id: ID }));
    render(await page());
    expect(
      screen.getByText("No audit events are recorded for this alert yet.")
    ).toBeInTheDocument();
  });

  it("links to the full trail filtered to this alert", async () => {
    api.getAlert.mockResolvedValue(deskAlert({ id: ID }));
    render(await page());
    expect(
      screen.getByRole("link", { name: "Full audit history for this alert" })
    ).toHaveAttribute("href", `/desk/audit?alert_id=${ID}`);
  });

  it("keeps the alert on screen and says the trail is unavailable when it cannot be read", async () => {
    api.getAlert.mockResolvedValue(deskAlert({ id: ID }));
    const boom = new Error("audit down");
    api.getAlertAudit.mockRejectedValue(boom);
    render(await page());
    expect(screen.getByText(AUDIT_UNAVAILABLE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Full audit history for this alert" })
    ).toBeInTheDocument();
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-audit");
  });
});
