import { describe, expect, it } from "vitest";
import { makeManagedEvent } from "@/test/factories";
import {
  COMING_SOON_HINT,
  dashNavigation,
  initialsOf,
  PICK_EVENT_HINT,
  shellEventOf,
  TICKETED_ONLY_HINT,
} from "./dash-navigation";

const ticketed = { id: "evt-1", ticketed: true, title: "Harbour Fete" };
const free = { id: "evt-2", ticketed: false, title: "Open Mic" };

function item(
  nav: ReturnType<typeof dashNavigation>,
  key: string
): ReturnType<typeof dashNavigation>[number] {
  const found = nav.find((entry) => entry.key === key);
  if (!found) {
    throw new Error(`no nav item ${key}`);
  }
  return found;
}

describe("dashNavigation with a selected ticketed event", () => {
  const nav = dashNavigation(ticketed);

  it("links each event screen into the event", () => {
    expect(item(nav, "tickets").href).toBe("/dash/events/evt-1#admission");
    expect(item(nav, "orders").href).toBe("/dash/events/evt-1/orders");
    expect(item(nav, "attendees").href).toBe("/dash/events/evt-1/attendees");
    expect(item(nav, "door").href).toBe("/dash/events/evt-1/door");
    expect(item(nav, "finance").href).toBe("/dash/events/evt-1/settlement");
  });

  it("shows no hint on the event-scoped items", () => {
    expect(item(nav, "orders").hint).toBeUndefined();
    expect(item(nav, "door").hint).toBeUndefined();
  });

  it("keeps the organiser-wide items as they were", () => {
    expect(item(nav, "overview").href).toBe("/dash");
    expect(item(nav, "events").href).toBe("/dash/events");
    expect(item(nav, "build").href).toBe("/dash/events/new");
    expect(item(nav, "team").href).toBe("/dash/team");
  });

  it("leaves Settings unlinked and marked Coming soon, with no badge", () => {
    const settings = item(nav, "settings");
    expect(settings.href).toBeNull();
    expect(settings.hint).toBe(COMING_SOON_HINT);
  });

  it("has no hard-coded badge text on any item", () => {
    for (const entry of nav) {
      expect(entry).not.toHaveProperty("badge");
    }
  });
});

describe("dashNavigation with no selected event", () => {
  const nav = dashNavigation(null);

  it("sends event-scoped items to the event list with a hint", () => {
    for (const key of ["tickets", "orders", "attendees", "door", "finance"]) {
      const entry = item(nav, key);
      expect(entry.href).toBe("/dash/events");
      expect(entry.hint).toBe(PICK_EVENT_HINT);
    }
  });

  it("still links the organiser-wide items", () => {
    expect(item(nav, "events").href).toBe("/dash/events");
    expect(item(nav, "team").href).toBe("/dash/team");
  });
});

describe("dashNavigation with a non-ticketed event", () => {
  const nav = dashNavigation(free);

  it("sends ticket-only screens to the event editor", () => {
    for (const key of ["orders", "attendees", "door", "finance"]) {
      const entry = item(nav, key);
      expect(entry.href).toBe("/dash/events/evt-2");
      expect(entry.hint).toBe(TICKETED_ONLY_HINT);
    }
  });

  it("still links Tickets & capacity to the editor's admission section", () => {
    const tickets = item(nav, "tickets");
    expect(tickets.href).toBe("/dash/events/evt-2#admission");
    expect(tickets.hint).toBeUndefined();
  });
});

describe("dashNavigation URL encoding", () => {
  it("encodes the event id in every event link", () => {
    const nav = dashNavigation({ id: "a b/c", ticketed: true, title: "T" });
    expect(item(nav, "orders").href).toBe("/dash/events/a%20b%2Fc/orders");
  });
});

describe("shellEventOf", () => {
  it("marks only ticketed admission as ticketed", () => {
    const ticketedListing = makeManagedEvent({
      admission: "ticketed",
      id: "evt-1",
      title: "Harbour Fete",
    });
    const freeListing = makeManagedEvent({
      admission: "free",
      id: "evt-2",
      title: "Open Mic",
    });
    expect(shellEventOf(ticketedListing)).toEqual(ticketed);
    expect(shellEventOf(freeListing)).toEqual(free);
  });
});

describe("initialsOf", () => {
  it.each([
    ["Ada Byron", "AB"],
    ["  ada   lovelace-king ", "AL"],
    ["Ada", "AD"],
    ["Ada Mary Byron", "AB"],
    ["", "?"],
    ["   ", "?"],
  ])("%j gives %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
