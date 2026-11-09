import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gmsCatalogueFixture } from "@/test/cap-gms-catalogue.fixture";

const mocks = vi.hoisted(() => ({
  getGmsCatalogue: vi.fn(),
  listHazardProfiles: vi.fn(),
  requireDeskGate: vi.fn(),
  reportError: vi.fn(),
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/desk/gate", () => ({ requireDeskGate: mocks.requireDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  getGmsCatalogue: mocks.getGmsCatalogue,
  listHazardProfiles: mocks.listHazardProfiles,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: mocks.isAuthApiError }));
vi.mock("@/components/desk/profile-approval", () => ({
  ProfileApproval: () => <div>approval-stub</div>,
}));
// The stubs show the gate each editor receives, so the page's wiring is tested
// without a router or a catalogue provider in the client components.
vi.mock("@/components/desk/profile-editor", () => ({
  ProfileVersionDrafter: ({
    buttonLabel,
    check,
    source,
  }: {
    buttonLabel: string;
    check: { allowed: boolean; reason?: string };
    source: { version: number } | null;
  }) => (
    <div>
      {source ? `version ${source.version} drafter` : "new profile drafter"} ·{" "}
      {buttonLabel} · {check.allowed ? "allowed" : check.reason}
    </div>
  ),
}));
vi.mock("@/components/desk/profile-alert-starter", () => ({
  ProfileAlertStarter: ({
    check,
  }: {
    check: { allowed: boolean; reason?: string };
  }) => <div>starter · {check.allowed ? "allowed" : check.reason}</div>,
}));

import LoadingHazardProfiles from "./loading";
import HazardProfilesPage from "./page";

const STAFF = {
  accessToken: "t",
  email: "reviewer@example.org",
  permissions: { approve: true, create: true, libraryManage: true },
  status: "staff",
  userId: "u2",
};
const NO_LIBRARY = {
  ...STAFF,
  permissions: { approve: true, create: true, libraryManage: false },
};
const NO_LIBRARY_REASON =
  "You need hazard library access to draft a profile version. Ask a GMS administrator.";
const APPROVE_FIRST = "Approve this version before starting a warning from it.";

const PROFILE = {
  approval_errors: [],
  approved_at: null,
  approved_by: null,
  created_at: "2026-10-01T10:00:00Z",
  created_by: "u1",
  definition: { name: "Flood", subtypes: [], templates: [] },
  id: "11111111-2222-4333-8444-555555555555",
  key: "flood",
  state: "DRAFT",
  version: 2,
};

describe("hazard profiles page", () => {
  beforeEach(() => {
    mocks.getGmsCatalogue.mockReset();
    mocks.getGmsCatalogue.mockResolvedValue(gmsCatalogueFixture);
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

  it("shows unavailable, not a half page, when the GMS catalogue fails", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([PROFILE]);
    mocks.getGmsCatalogue.mockRejectedValue({ status: 502 });
    render(await HazardProfilesPage());
    expect(
      screen.getByText("The hazard profiles could not be loaded")
    ).toBeInTheDocument();
    expect(screen.queryByText("Flood")).toBeNull();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("shows an honest empty state with the new-profile section still visible", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([]);
    render(await HazardProfilesPage());
    expect(
      screen.getByText("No hazard profiles have been saved yet.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Start a new hazard profile" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("new profile drafter · Start a new profile · allowed")
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

  it("offers Edit draft for a draft and gives the approval reason for starting a warning", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([PROFILE]);
    render(await HazardProfilesPage());
    expect(
      screen.getByText("version 2 drafter · Edit draft · allowed")
    ).toBeInTheDocument();
    expect(screen.getByText(`starter · ${APPROVE_FIRST}`)).toBeInTheDocument();
  });

  it("offers Draft new version from an approved latest version and allows the warning start", async () => {
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue([
      { ...PROFILE, approved_at: "2026-10-02T09:00:00Z", state: "APPROVED" },
    ]);
    render(await HazardProfilesPage());
    expect(
      screen.getByText("version 2 drafter · Draft new version · allowed")
    ).toBeInTheDocument();
    expect(screen.getByText("starter · allowed")).toBeInTheDocument();
  });

  it("explains the missing library access in plain words, and keeps the section visible", async () => {
    mocks.requireDeskGate.mockResolvedValue(NO_LIBRARY);
    mocks.listHazardProfiles.mockResolvedValue([
      { ...PROFILE, approved_at: "2026-10-02T09:00:00Z", state: "APPROVED" },
    ]);
    render(await HazardProfilesPage());
    expect(
      screen.getByText(
        `version 2 drafter · Draft new version · ${NO_LIBRARY_REASON}`
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `new profile drafter · Start a new profile · ${NO_LIBRARY_REASON}`
      )
    ).toBeInTheDocument();
  });
});
