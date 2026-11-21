import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShellEvent } from "@/lib/dash-navigation";
import { DashShell } from "./dash-shell";

const RE_ORDERS = /Orders/u;
const RE_ATTENDEES = /Attendees/u;
const RE_DOOR_BOX_OFFICE = /Door & box office/u;
const RE_FINANCE = /Finance/u;
const RE_TICKETS_CAPACITY = /Tickets & capacity/u;
const RE_LATER_STEP = /later step/u;
const RE_HARBOUR_FETE = /Harbour Fete/u;
const RE_FEEL_FREE_PROMOTIONS = /Feel Free Promotions/u;
const RE_NOTIFICATIONS = /notifications/iu;

const rememberEventChoice = vi.fn();
const reportError = vi.fn();

/** A server action always returns a promise; the mock must too. */
function resolvedAction() {
  rememberEventChoice.mockReset();
  rememberEventChoice.mockResolvedValue(undefined);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/dash",
}));
vi.mock("@/data/actions", () => ({
  switchOrganiser: () => undefined,
  rememberEventChoice: (...args: unknown[]) => rememberEventChoice(...args),
}));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const VIEWER = "Ada Byron";
const ticketed: ShellEvent = {
  id: "evt-1",
  ticketed: true,
  title: "Harbour Fete",
};
const free: ShellEvent = { id: "evt-2", ticketed: false, title: "Open Mic" };
const organisers = [
  { slug: "alpha", name: "Alpha", organisationId: "org_a" },
  { slug: "beta", name: "Beta", organisationId: null },
];

function shell(
  props: Partial<Parameters<typeof DashShell>[0]> = {}
): ReturnType<typeof render> {
  return render(
    <DashShell
      active="overview"
      eventName="Feel Free Promotions"
      viewerName={VIEWER}
      {...props}
    >
      <p>content</p>
    </DashShell>
  );
}

/** The desktop sidebar's workspace nav (the sheet is not rendered until opened). */
function workspace() {
  return screen.getByRole("navigation", { name: "Event workspace" });
}

beforeEach(() => {
  resolvedAction();
  reportError.mockReset();
});

describe("DashShell navigation", () => {
  it("points Build event at the create route, not a demo event id", () => {
    shell();
    const links = screen.getAllByRole("link", { name: "Build event" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dash/events/new");
    }
  });

  it("links event screens into the selected event", () => {
    shell({ event: ticketed });
    const nav = within(workspace());
    expect(nav.getByRole("link", { name: RE_ORDERS })).toHaveAttribute(
      "href",
      "/dash/events/evt-1/orders"
    );
    expect(nav.getByRole("link", { name: RE_ATTENDEES })).toHaveAttribute(
      "href",
      "/dash/events/evt-1/attendees"
    );
    expect(nav.getByRole("link", { name: RE_DOOR_BOX_OFFICE })).toHaveAttribute(
      "href",
      "/dash/events/evt-1/door"
    );
    expect(nav.getByRole("link", { name: RE_FINANCE })).toHaveAttribute(
      "href",
      "/dash/events/evt-1/settlement"
    );
    expect(
      nav.getByRole("link", { name: RE_TICKETS_CAPACITY })
    ).toHaveAttribute("href", "/dash/events/evt-1#admission");
  });

  it("sends a non-ticketed event's ticket-only items to its editor", () => {
    shell({ event: free });
    const nav = within(workspace());
    expect(nav.getByRole("link", { name: RE_ORDERS })).toHaveAttribute(
      "href",
      "/dash/events/evt-2"
    );
    // Orders, Attendees, Door and Finance each carry the hint.
    expect(nav.getAllByText("Ticketed events only")).toHaveLength(4);
  });

  it("links to the event list with a visible hint when no event is selected", () => {
    shell();
    const nav = within(workspace());
    const orders = nav.getByRole("link", { name: RE_ORDERS });
    expect(orders).toHaveAttribute("href", "/dash/events");
    expect(orders).toHaveTextContent("Pick an event");
    expect(orders).not.toHaveAttribute("title");
  });

  it("marks Settings Coming soon with disabled styling and no misleading title", () => {
    shell({ event: ticketed });
    const settings = within(workspace())
      .getByText("Settings")
      .closest('[aria-disabled="true"]');
    expect(settings).toHaveAttribute("aria-disabled", "true");
    expect(settings).toHaveTextContent("Coming soon");
    expect(settings).not.toHaveAttribute("title");
    expect(screen.queryByText(RE_LATER_STEP)).toBeNull();
  });

  it("marks the current section by its key", () => {
    shell({ active: "orders", event: ticketed });
    const orders = within(workspace()).getByRole("link", { name: RE_ORDERS });
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(
      within(workspace()).getByRole("link", { name: RE_ATTENDEES })
    ).not.toHaveAttribute("aria-current");
  });

  it("shows the selected event title in the event selector", () => {
    shell({ event: ticketed });
    const selector = screen.getByRole("link", { name: RE_HARBOUR_FETE });
    expect(selector).toHaveAttribute("href", "/dash/events");
    expect(selector).toHaveTextContent("Selected event");
  });

  it("falls back to the organiser name in the selector with no event", () => {
    shell();
    const selector = screen.getByRole("link", {
      name: RE_FEEL_FREE_PROMOTIONS,
    });
    expect(selector).toHaveAttribute("href", "/dash/events");
    expect(selector).toHaveTextContent("Organiser");
  });
});

describe("DashShell viewer and dead controls", () => {
  it("shows the real signed-in viewer, not a hard-coded owner", () => {
    shell();
    expect(screen.getAllByText(VIEWER).length).toBeGreaterThan(0);
    expect(screen.queryByText("Eugine G.")).toBeNull();
    expect(screen.queryByText("Owner")).toBeNull();
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("has no hard-coded count badge on Door & box office", () => {
    shell({ event: ticketed });
    const door = within(workspace()).getByRole("link", {
      name: RE_DOOR_BOX_OFFICE,
    });
    expect(door.textContent).toBe("Door & box office");
  });

  it("makes Support a real mailto link", () => {
    shell();
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "mailto:support@barrels.gd"
    );
  });

  it("does not render the dead notifications bell", () => {
    shell();
    expect(screen.queryByRole("button", { name: RE_NOTIFICATIONS })).toBeNull();
  });

  it("uses the organiser switcher only with several organisers", () => {
    shell({ currentOrganiser: "beta", organisers });
    expect(screen.getByRole("combobox", { name: "Organiser" })).toHaveValue(
      "beta"
    );
  });
});

describe("DashShell remembered event", () => {
  it("remembers the event the member has open", () => {
    shell({ event: ticketed });
    expect(rememberEventChoice).toHaveBeenCalledWith("evt-1");
  });

  it("does not write a cookie when there is no event", () => {
    shell();
    expect(rememberEventChoice).not.toHaveBeenCalled();
  });
});

describe("DashShell mobile menu", () => {
  it("replaces the pill row with one menu button that opens the navigation", () => {
    shell({ event: ticketed });
    expect(
      screen.queryByRole("navigation", { name: "Mobile event workspace" })
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Open organiser menu" })
    );

    const sheet = screen.getByRole("dialog");
    const nav = within(sheet).getByRole("navigation", {
      name: "Mobile event workspace",
    });
    expect(within(nav).getByRole("link", { name: RE_ORDERS })).toHaveAttribute(
      "href",
      "/dash/events/evt-1/orders"
    );
    expect(
      within(sheet).getByRole("link", { name: "View public site" })
    ).toHaveAttribute("href", "/");
    expect(
      within(sheet).getByRole("link", { name: "Support" })
    ).toHaveAttribute("href", "mailto:support@barrels.gd");
    expect(within(sheet).getByText(VIEWER)).toBeInTheDocument();
  });

  it("shows the organiser switcher inside the menu when there are several", () => {
    shell({ currentOrganiser: "alpha", organisers });
    fireEvent.click(
      screen.getByRole("button", { name: "Open organiser menu" })
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("combobox", {
        name: "Organiser",
      })
    ).toHaveValue("alpha");
  });
});
