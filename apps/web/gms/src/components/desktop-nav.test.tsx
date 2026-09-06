import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesktopNav } from "@/components/desktop-nav";
import type { AlertsResult } from "@/lib/cap";
import { NAV_SECTIONS } from "@/lib/nav-sections";

const anchor = { current: null };
const alerts: AlertsResult = { activeCount: 0, groups: [], status: "ok" };

describe("DesktopNav", () => {
  it("renders a trigger for every section that has links", () => {
    render(<DesktopNav alerts={alerts} anchor={anchor} />);
    for (const section of NAV_SECTIONS.filter((s) => s.groups.length > 0)) {
      expect(screen.getByText(section.label)).toBeInTheDocument();
    }
  });

  it("renders a plain link for a section with no sub-links", () => {
    render(<DesktopNav alerts={alerts} anchor={anchor} />);
    const about = screen.getByText("About");
    expect(about.closest("a")).toHaveAttribute("href", "/about");
  });
});
