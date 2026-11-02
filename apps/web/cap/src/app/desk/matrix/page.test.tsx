import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIbfMatrix: vi.fn(),
  listHazardProfiles: vi.fn(),
  reportError: vi.fn(),
  requireDeskGate: vi.fn(),
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/desk/gate", () => ({ requireDeskGate: mocks.requireDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  getIbfMatrix: mocks.getIbfMatrix,
  listHazardProfiles: mocks.listHazardProfiles,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: mocks.isAuthApiError }));
vi.mock("@/components/desk/matrix-advice", () => ({
  MatrixAdvice: () => <div>advice-stub</div>,
}));

import LoadingMatrix from "./loading";
import MatrixPage from "./page";

const NOT_OFFERED = /There is no hazard profile called “tsunami”/;
const STANDARD_GRID = /Standard World Meteorological/;
const STAFF = {
  accessToken: "t",
  email: "f@example.org",
  permissions: { read: true },
  status: "staff",
  userId: "u1",
};
const PROFILES = [{ key: "flood" }, { key: "wind" }];
const MATRIX = {
  cells: [["green", "yellow", "orange", "red"]],
  impacts: [
    { label: "Minimal", percent: null },
    { label: "Minor", percent: null },
    { label: "Significant", percent: null },
    { label: "Severe", percent: null },
  ],
  likelihoods: [{ label: "High", percent: 80 }],
  meanings: {},
};

function render_(search: Record<string, string>) {
  return MatrixPage({ searchParams: Promise.resolve(search) });
}

describe("impact matrix page", () => {
  beforeEach(() => {
    mocks.getIbfMatrix.mockReset();
    mocks.listHazardProfiles.mockReset();
    mocks.requireDeskGate.mockReset();
    mocks.reportError.mockReset();
    mocks.requireDeskGate.mockResolvedValue(STAFF);
    mocks.listHazardProfiles.mockResolvedValue(PROFILES);
  });

  it("shows a loading message while the matrix is fetched", () => {
    render(<LoadingMatrix />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the impact matrix…"
    );
  });

  it("shows no access to a refused account", async () => {
    mocks.requireDeskGate.mockResolvedValue({ email: "x", status: "refused" });
    render(await render_({ kind: "flood" }));
    expect(screen.getByText("No access to CAP warnings")).toBeInTheDocument();
  });

  it("shows an unavailable state when the hazard list fails", async () => {
    mocks.listHazardProfiles.mockRejectedValue({ status: 502 });
    render(await render_({}));
    expect(
      screen.getByText("The hazard list could not be loaded")
    ).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("asks for a hazard first (empty state)", async () => {
    render(await render_({}));
    expect(
      screen.getByText("Choose a hazard to see its impact matrix.")
    ).toBeInTheDocument();
    expect(mocks.getIbfMatrix).not.toHaveBeenCalled();
  });

  it("refuses a hazard with no profile, without a matrix call", async () => {
    render(await render_({ kind: "tsunami" }));
    expect(screen.getByText(NOT_OFFERED)).toBeInTheDocument();
    expect(mocks.getIbfMatrix).not.toHaveBeenCalled();
  });

  it("says plainly when a hazard has no matrix (404)", async () => {
    mocks.getIbfMatrix.mockRejectedValue({ status: 404 });
    render(await render_({ kind: "flood" }));
    expect(
      screen.getByText("This hazard has no impact matrix yet.")
    ).toBeInTheDocument();
  });

  it("shows an unavailable state and reports an unexpected failure", async () => {
    mocks.getIbfMatrix.mockRejectedValue({ status: 500 });
    render(await render_({ kind: "flood" }));
    expect(
      screen.getByText("The impact matrix could not be loaded")
    ).toBeInTheDocument();
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("shows the grid, its source and the advice panel", async () => {
    mocks.getIbfMatrix.mockResolvedValue(MATRIX);
    render(await render_({ kind: "flood" }));
    expect(
      screen.getByRole("columnheader", { name: "Severe" })
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Red" })).toBeInTheDocument();
    expect(screen.getByText(STANDARD_GRID)).toBeInTheDocument();
    expect(screen.getByText("advice-stub")).toBeInTheDocument();
  });
});
