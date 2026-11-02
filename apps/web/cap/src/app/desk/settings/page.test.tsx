import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";
import { deskSettings } from "@/test/desk-settings.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({ getSettings: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/desk/settings/actions", () => ({ saveCapSettings: vi.fn() }));

import Loading from "./loading";
import SettingsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
});

describe("/desk/settings", () => {
  it("shows the loading state while data arrives", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading CAP settings"
    );
  });

  it("shows no access, and does not read settings, without cap.settings.manage", async () => {
    gate.requireDeskGate.mockResolvedValue(
      staffGate({ settingsManage: false })
    );
    render(await SettingsPage());
    expect(
      screen.getByRole("heading", { name: "No access to CAP settings" })
    ).toBeInTheDocument();
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it("shows an unavailable state and reports an unexpected read failure", async () => {
    const boom = new Error("down");
    api.getSettings.mockRejectedValue(boom);
    render(await SettingsPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "CAP settings could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-settings");
  });

  it("shows the current sender details in an editable form", async () => {
    api.getSettings.mockResolvedValue(deskSettings());
    render(await SettingsPage());
    expect(screen.getByLabelText("Sender name")).toHaveValue(
      "Grenada Meteorological Service"
    );
    expect(screen.getByLabelText("Feed limit")).toHaveValue(50);
  });
});
