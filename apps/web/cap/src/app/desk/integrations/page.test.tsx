import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ getIntegrations: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);

import Loading from "./loading";
import IntegrationsPage from "./page";

const NOT_CONFIGURED = /Not configured/;
const EMPTY_WEBHOOKS = "Not configured: no webhook endpoint is set up.";
const EMPTY_MQTT = "Not configured: no MQTT broker is set up.";

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
});

describe("/desk/integrations", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading integrations"
    );
  });

  it("shows no access without cap.integrations.manage and does not read", async () => {
    gate.requireDeskGate.mockResolvedValue(
      staffGate({ integrationsManage: false })
    );
    render(await IntegrationsPage());
    expect(
      screen.getByRole("heading", { name: "No access to CAP integrations" })
    ).toBeInTheDocument();
    expect(api.getIntegrations).not.toHaveBeenCalled();
  });

  it("shows unavailable and reports an unexpected failure", async () => {
    const boom = new Error("down");
    api.getIntegrations.mockRejectedValue(boom);
    render(await IntegrationsPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "CAP integrations could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(
      boom,
      "cap-desk-integrations"
    );
  });

  it("says each empty channel is not configured, never working", async () => {
    api.getIntegrations.mockResolvedValue({});
    const { container } = render(await IntegrationsPage());
    expect(screen.getByText(EMPTY_WEBHOOKS)).toBeInTheDocument();
    expect(screen.getByText(EMPTY_MQTT)).toBeInTheDocument();
    expect(container.querySelectorAll("dd")).toHaveLength(0);
  });

  it("shows a configured channel with its status in words", async () => {
    api.getIntegrations.mockResolvedValue({
      publish_channels: [
        {
          kind: "publish.wis2box",
          name: "WIS2 (wis2box)",
          reason: "Publishing starts once the local wis2box is live.",
          status: "not_configured",
        },
      ],
    });
    render(await IntegrationsPage());
    expect(screen.getByText("WIS2 (wis2box)")).toBeInTheDocument();
    expect(screen.getAllByText(NOT_CONFIGURED).length).toBeGreaterThan(0);
  });
});
