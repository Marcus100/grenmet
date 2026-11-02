import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ requireDeskGate: vi.fn() }));
const api = vi.hoisted(() => ({
  getGmsCatalogue: vi.fn(),
  listPredefinedAreas: vi.fn(),
}));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/api", () => api);
vi.mock("@/lib/report-error", () => report);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/desk/areas/actions", () => ({ savePredefinedArea: vi.fn() }));
vi.mock("@/components/desk/area-picker", () => ({ AreaPicker: () => null }));

import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";

const NO_ACCESS_TEXT = /No access to save predefined areas/;

import Loading from "./loading";
import AreasPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  gate.requireDeskGate.mockResolvedValue(staffGate());
  api.getGmsCatalogue.mockResolvedValue(gmsCatalogueFixture);
  api.listPredefinedAreas.mockResolvedValue([]);
});

describe("/desk/areas", () => {
  it("shows the loading state", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading predefined areas"
    );
  });

  it("shows unavailable and reports an unexpected failure", async () => {
    const boom = new Error("down");
    api.listPredefinedAreas.mockRejectedValue(boom);
    render(await AreasPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Predefined areas could not be loaded"
    );
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-areas");
  });

  it("shows the empty list and the save form for a user with cap.settings.manage", async () => {
    render(await AreasPage());
    expect(
      screen.getByText("No predefined areas are saved yet.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Area name")).toBeInTheDocument();
  });

  it("shows no access to saving, but still lists areas, without cap.settings.manage", async () => {
    gate.requireDeskGate.mockResolvedValue(
      staffGate({ settingsManage: false })
    );
    render(await AreasPage());
    expect(screen.getByText(NO_ACCESS_TEXT)).toBeInTheDocument();
    expect(screen.queryByLabelText("Area name")).toBeNull();
    expect(
      screen.getByText("No predefined areas are saved yet.")
    ).toBeInTheDocument();
  });
});
