import type { FeatureFlagAdmin } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FlagsError,
  FlagsLoading,
  FlagsPanel,
  PropagationWarning,
} from "@/components/flag-panels";

vi.mock("@/app/(console)/flags/actions", () => {
  const action = () => Promise.resolve(undefined as never);
  return { deleteFlagAction: action, saveFlagAction: action };
});

const NO_FLAGS = /No feature flags yet/u;
const THIRTY = /up to 30 seconds/u;
const METRIC_LABEL = /Success metric/u;

const flag: FeatureFlagAdmin = {
  id: "flag_1",
  key: "new-checkout",
  description: "Checkout rewrite",
  enabled: true,
  exposed: true,
  audience: {
    organisation_ids: ["gaa"],
    percentage: 20,
    environments: ["production"],
  },
  success_metric: "Checkout conversion",
  owner: "payments",
  expires_at: null,
  review_by: "2026-09-01T00:00:00Z",
  stale: false,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

describe("FlagsPanel", () => {
  it("lists key, state, audience, owner, metric and dates", () => {
    render(<FlagsPanel flags={[flag]} staleIds={[]} />);
    expect(screen.getByText("Flags (1)")).toBeTruthy();
    expect(screen.getByText("new-checkout")).toBeTruthy();
    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Exposed").length).toBeGreaterThan(0);
    expect(
      screen.getByText("1 organisation, 20% rollout (only in production)")
    ).toBeTruthy();
    expect(screen.getByText("payments")).toBeTruthy();
    expect(screen.getAllByText("Checkout conversion").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("2026-09-01")).toBeTruthy();
    expect(screen.getByText("Never")).toBeTruthy();
    expect(screen.queryByText("Stale")).toBeNull();
  });

  it("badges a flag the stale list names", () => {
    render(<FlagsPanel flags={[flag]} staleIds={["flag_1"]} />);
    expect(screen.getByText("Stale")).toBeTruthy();
  });

  it("offers an edit form with the success metric field and delete", () => {
    render(<FlagsPanel flags={[flag]} staleIds={[]} />);
    expect(screen.getByLabelText(METRIC_LABEL)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete flag" })).toBeTruthy();
  });

  it("says so when there are no flags", () => {
    render(<FlagsPanel flags={[]} staleIds={[]} />);
    expect(screen.getByRole("status").textContent).toMatch(NO_FLAGS);
  });
});

describe("states", () => {
  it("warns about the 30 second propagation delay", () => {
    render(<PropagationWarning />);
    expect(screen.getByRole("note").textContent).toMatch(THIRTY);
  });

  it("shows loading and error states", () => {
    const { unmount } = render(<FlagsLoading />);
    expect(screen.getByText("Loading flags")).toBeTruthy();
    unmount();
    render(<FlagsError />);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded"
    );
  });
});
