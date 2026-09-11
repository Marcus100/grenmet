import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NavDrawer } from "@/components/nav-drawer";
import { NAV_SECTIONS } from "@/lib/nav-sections";

const FIRST_SECTION = NAV_SECTIONS[0];

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

  it("shows each group heading from the shared nav source", async () => {
    const user = userEvent.setup();
    render(<NavDrawer onClose={() => undefined} open />);

    await user.click(screen.getByText(FIRST_SECTION.label));

    for (const group of FIRST_SECTION.groups) {
      expect(screen.getByText(group.heading)).toBeInTheDocument();
    }
  });

  it("shows the description beneath each link, as the desktop panel does", async () => {
    const user = userEvent.setup();
    render(<NavDrawer onClose={() => undefined} open />);

    await user.click(screen.getByText(FIRST_SECTION.label));

    const [firstLink] = FIRST_SECTION.groups[0].links;
    expect(
      screen.getByRole("link", { name: new RegExp(firstLink.name, "i") })
    ).toHaveAttribute("href", firstLink.href);
    expect(screen.getByText(firstLink.description)).toBeInTheDocument();
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
      name: new RegExp(FIRST_SECTION.groups[0].links[0].name, "i"),
    });
    expect(link).toHaveAttribute("href", FIRST_SECTION.groups[0].links[0].href);
    // Verify the close callback without asking jsdom to navigate documents.
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    await user.click(link);

    expect(onClose).toHaveBeenCalled();
  });
});
