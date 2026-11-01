import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listHazardProfiles: vi.fn(),
  requireDeskGate: vi.fn(),
  reportError: vi.fn(),
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/desk/gate", () => ({ requireDeskGate: mocks.requireDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  listHazardProfiles: mocks.listHazardProfiles,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: mocks.isAuthApiError }));
vi.mock("@/components/desk/profile-approval", () => ({
  ProfileApproval: () => <div>approval-stub</div>,
}));

import LoadingHazardProfiles from "./loading";
import HazardProfilesPage from "./page";

const STAFF = {
  accessToken: "t",
  email: "reviewer@example.org",
  permissions: { approve: true, libraryManage: true },
  status: "staff",
  userId: "u2",
};

const PROFILE = {
  approval_errors: [],
  approved_at: null,
  approved_by: null,
  created_at: "2026-10-01T10:00:00Z",
  created_by: "u1",
  definition: { name: "Flood" },
  id: "11111111-2222-4333-8444-555555555555",
  key: "flood",
  state: "DRAFT",
  version: 2,
};

describe("hazard profiles page", () => {
  beforeEach(() => {
    mocks.listHazardProfiles.mockReset();
    mocks.requireDeskGate.mockReset();
    mocks.reportError.mockReset();
  });

  it("shows a loading message while the list is fetched", () => {
    render(<LoadingHazardProfiles />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading hazard profiles…"
    );
  });

  it("shows no access to a refused account", async () => {
    mocks.requireDeskGate.mockResolvedValue({
      email: "x@example.org",
      status: "refused",
    });
    render(await HazardProfilesPage());
    expect(screen.getByText("No access to CAP warnings")).toBeInTheDocument();
    expect(mocks.listHazardProfiles).not.toHaveBeenCalled();
  });

  it("shows no access when the API refuses the list", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockRejectedValue({ status: 403 });
    render(await HazardProfilesPage());
    expect(screen.getByText("No access to CAP warnings")).toBeInTheDocument();
  });

  it("shows an unavailable state and reports an unexpected failure", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockRejectedValue({ status: 502 });
    render(await HazardProfilesPage());
    expect(
      screen.getByText("The hazard profiles could not be loaded")
    ).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("shows an honest empty state", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([]);
    render(await HazardProfilesPage());
    expect(
      screen.getByText("No hazard profiles have been saved yet.")
    ).toBeInTheDocument();
  });

  it("lists the latest version, its approval and the full history", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([
      PROFILE,
      {
        ...PROFILE,
        approved_at: "2026-10-02T09:00:00Z",
        approved_by: "u3",
        id: "22222222-2222-4333-8444-555555555555",
        state: "APPROVED",
        version: 1,
      },
    ]);
    render(await HazardProfilesPage());
    expect(screen.getByRole("heading", { name: "Flood" })).toBeInTheDocument();
    expect(
      screen.getByText("Version 2: draft, not approved")
    ).toBeInTheDocument();
    expect(screen.getByText("approval-stub")).toBeInTheDocument();
    expect(screen.getByText("Version history (2)")).toBeInTheDocument();
    expect(screen.getByText("u3")).toBeInTheDocument();
  });
});
