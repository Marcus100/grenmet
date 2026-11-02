import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskAlert } from "@/test/desk-alert.fixture";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ getAlert: vi.fn(), getAlertAudit: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/components/desk/alert-actions", () => ({
  AlertActions: () => null,
}));
vi.mock("@/components/desk/duplicate-alert-button", () => ({
  DuplicateAlertButton: () => null,
}));

import DeskAlertPage from "./page";

const ID = "11111111-2222-4333-8444-555555555555";

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
