import {
  getActiveIds,
  getSearchEntries,
  getTabItems,
} from "@barrelsgd/admin-kit/lib/navigation";
import { describe, expect, it } from "vitest";
import { studioNavigation } from "./studio-navigation";

const OWNER = {
  canManage: true,
  orgSlug: "sea-salt",
  pendingCount: null,
  publicHref: "/sea-salt-spa",
};

function urls(input: Parameters<typeof studioNavigation>[0]) {
  return studioNavigation(input).flatMap((group) =>
    group.items.map((item) => ("url" in item ? item.url : undefined))
  );
}

describe("studioNavigation", () => {
  it("links every studio route for an owner or admin", () => {
    expect(urls(OWNER)).toEqual([
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/bookings/new",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
      "/studio/sea-salt/settings",
      "/studio/sea-salt/plan",
      "/sea-salt-spa",
    ]);
  });

  it("leaves New booking and Plan & billing out for a member", () => {
    const member = { ...OWNER, canManage: false };
    expect(urls(member)).toEqual([
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
      "/studio/sea-salt/settings",
      "/sea-salt-spa",
    ]);
    const titles = getSearchEntries(studioNavigation(member)).map(
      (entry) => entry.label
    );
    expect(titles).not.toContain("New booking");
    expect(titles).not.toContain("Plan & billing");
  });

  it("leaves the page link out when the business has no booking page", () => {
    expect(urls({ ...OWNER, publicHref: null })).not.toContain("/sea-salt-spa");
  });

  it("opens the customers' page in a new tab", () => {
    const page = studioNavigation(OWNER)
      .flatMap((group) => group.items)
      .find((item) => item.id === "view-page");
    expect(page).toMatchObject({ newTab: true });
  });

  it("offers Agenda, Services and People on the phone tab bar, in that order", () => {
    expect(
      getTabItems(studioNavigation(OWNER)).map((item) => item.title)
    ).toEqual(["Agenda", "Services", "People"]);
  });

  it("puts the waiting count on Agenda only when there is one", () => {
    const agenda = (pendingCount: number | null) =>
      studioNavigation({ ...OWNER, pendingCount })[0]?.items[0];
    expect(agenda(3)).toMatchObject({
      badge: 3,
      badgeLabel: "3 waiting to be confirmed",
    });
    expect(agenda(0)).not.toHaveProperty("badge");
    expect(agenda(null)).not.toHaveProperty("badge");
  });

  it("keeps Agenda current on a booking's detail page", () => {
    const nav = studioNavigation(OWNER);
    expect([
      ...getActiveIds(nav, "/studio/sea-salt/bookings/22222222-2222"),
    ]).toEqual(["agenda"]);
  });

  it("keeps Agenda current on a booking page for a member too", () => {
    const nav = studioNavigation({ ...OWNER, canManage: false });
    expect([...getActiveIds(nav, "/studio/sea-salt/bookings/abc")]).toEqual([
      "agenda",
    ]);
  });

  it.each([
    ["/studio/sea-salt/agenda", "agenda"],
    ["/studio/sea-salt/bookings/new", "new-booking"],
    ["/studio/sea-salt/services", "services"],
    ["/studio/sea-salt/people", "people"],
    ["/studio/sea-salt/plan", "plan"],
    ["/studio/sea-salt/settings", "settings"],
  ])("marks one item current on %s", (path, id) => {
    expect([...getActiveIds(studioNavigation(OWNER), path)]).toEqual([id]);
  });
});
