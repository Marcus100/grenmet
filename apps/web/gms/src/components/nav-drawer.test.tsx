import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavDrawer } from "@/components/nav-drawer";
import { NAV_SECTIONS } from "@/lib/nav-sections";

// The theme toggle needs the preferences provider; it has its own test.
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

const FIRST_SECTION = NAV_SECTIONS[0];
const ALERTS_WITH_STATUS = /^Alerts\s*No active alerts/;

describe("NavDrawer", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <NavDrawer onClose={() => undefined} open={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every top-level section", () => {
    render(<NavDrawer onClose={() => undefined} open />);
    for (const section of NAV_SECTIONS) {
      expect(screen.getByText(section.label)).toBeInTheDocument();
    }
  });

  it("lists a section's links under their group headings, without descriptions", async () => {
    const user = userEvent.setup();
    render(<NavDrawer onClose={() => undefined} open />);

    await user.click(screen.getByText(FIRST_SECTION.label));

    for (const group of FIRST_SECTION.groups) {
      expect(screen.getByText(group.heading)).toBeInTheDocument();
      for (const link of group.links) {
        const hrefs = screen
          .getAllByRole("link", { name: link.name })
          .map((element) => element.getAttribute("href"));
        expect(hrefs).toContain(link.href);
      }
    }
    expect(
      screen.queryByText(FIRST_SECTION.groups[0].links[0].description)
    ).toBeNull();
  });

  it("keeps one section open at a time", async () => {
    const user = userEvent.setup();
    render(<NavDrawer onClose={() => undefined} open />);
    const [first, second] = NAV_SECTIONS;
    await user.click(screen.getByRole("button", { name: first.label }));
    await user.click(screen.getByRole("button", { name: second.label }));
    expect(
      screen.getByRole("button", { name: first.label })
    ).not.toHaveAttribute("data-panel-open");
  });

  it("marks the expanded section so its trigger can be styled", async () => {
    const user = userEvent.setup();
    render(<NavDrawer onClose={() => undefined} open />);

    const trigger = screen.getByRole("button", { name: FIRST_SECTION.label });
    expect(trigger).not.toHaveAttribute("data-panel-open");

    await user.click(trigger);

    // Base UI emits data-panel-open, not data-open — the open-state styling
    // hangs off this attribute, so pin it here.
    expect(trigger).toHaveAttribute("data-panel-open");
  });

  it("closes when a link is followed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NavDrawer onClose={onClose} open />);

    await user.click(screen.getByText(FIRST_SECTION.label));
    const link = screen.getByRole("link", {
      name: new RegExp(`^${FIRST_SECTION.groups[0].links[0].name}`, "i"),
    });
    expect(link).toHaveAttribute("href", FIRST_SECTION.groups[0].links[0].href);
    // Verify the close callback without asking jsdom to navigate documents.
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await user.click(link);

    expect(onClose).toHaveBeenCalled();
  });

  it("puts the warning status on the Alerts section", () => {
    render(
      <NavDrawer
        alerts={{ activeCount: 0, groups: [], status: "ok" }}
        onClose={() => undefined}
        open
      />
    );
    expect(
      screen.getByRole("button", { name: ALERTS_WITH_STATUS })
    ).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<NavDrawer onClose={onClose} open />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("omits the status tag when no alert result is supplied", () => {
    render(<NavDrawer onClose={() => undefined} open />);
    expect(screen.queryByText("No active alerts")).not.toBeInTheDocument();
  });
});
