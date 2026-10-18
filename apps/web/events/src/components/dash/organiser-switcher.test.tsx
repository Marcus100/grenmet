import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashShell } from "./dash-shell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/data/actions", () => ({ switchOrganiser: vi.fn() }));

const organisers = [
  { slug: "alpha", name: "Alpha", organisationId: "org_a" },
  { slug: "beta", name: "Beta", organisationId: null },
];

describe("organiser switcher", () => {
  it("shows when the member manages several organisers", () => {
    render(
      <DashShell
        active="overview"
        currentOrganiser="beta"
        eventName="Beta"
        isDemo={false}
        organisers={organisers}
      >
        <p>content</p>
      </DashShell>
    );

    const selects = screen.getAllByRole("combobox", { name: "Organiser" });
    expect(selects.length).toBeGreaterThan(0);
    expect(selects[0]).toHaveValue("beta");
  });

  it("stays hidden for a single organiser", () => {
    render(
      <DashShell
        active="overview"
        currentOrganiser="alpha"
        eventName="Alpha"
        isDemo={false}
        organisers={organisers.slice(0, 1)}
      >
        <p>content</p>
      </DashShell>
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
