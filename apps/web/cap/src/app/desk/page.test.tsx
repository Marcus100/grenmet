import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskAlert, deskInfo } from "@/test/desk-alert.fixture";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ listAlerts: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import Loading from "./loading";
import DeskBoard from "./page";

const LIVE = deskAlert({
  id: "bbbbbbbb-2222-4333-8444-555555555555",
  info: [deskInfo({ headline: "Strong wind for St David" })],
  lifecycle_state: "PUBLISHED",
});

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
  api.listAlerts.mockImplementation(async (_token: string, state: string) => ({
    data: state === "PUBLISHED" ? [LIVE] : [],
  }));
});

describe("/desk (board)", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the warning board"
    );
  });

  it("shows the refusal for a staff account without CAP access", async () => {
    gate.requireDeskGate.mockResolvedValue({
      email: "x@example.test",
      status: "refused",
    });
    render(await DeskBoard());
    expect(
      screen.getByRole("heading", { name: "No access to CAP warnings" })
    ).toBeInTheDocument();
  });

  it("shows unavailable and reports an unexpected failure", async () => {
    const boom = new Error("down");
    api.listAlerts.mockRejectedValue(boom);
    render(await DeskBoard());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The warning board could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-board");
  });

  it("shows every stage with its empty message and the loaded alerts", async () => {
    render(await DeskBoard());
    expect(screen.getByText("No drafts.")).toBeInTheDocument();
    expect(screen.getByText("Strong wind for St David")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Strong wind for St David" })
    ).toHaveAttribute("href", `/desk/alerts/${LIVE.id}`);
  });
});
