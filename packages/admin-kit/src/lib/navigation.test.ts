import { describe, expect, it } from "vitest";
import { NAVIGATION } from "../test/fixtures";
import {
  type AdminNavGroup,
  filterNavigation,
  getActiveIds,
  getSearchEntries,
  getTabItems,
  MAX_TAB_ITEMS,
} from "./navigation";

describe("getActiveIds", () => {
  it("matches the exact address", () => {
    expect([...getActiveIds(NAVIGATION, "/agenda")]).toEqual(["agenda"]);
  });

  it("matches by prefix, so a detail page keeps its section current", () => {
    expect(getActiveIds(NAVIGATION, "/people/42").has("people")).toBe(true);
  });

  it("does not match a longer word that merely starts the same", () => {
    expect(getActiveIds(NAVIGATION, "/peoplefinder").size).toBe(0);
  });

  it("never lights Home on every page", () => {
    expect(getActiveIds(NAVIGATION, "/agenda").has("home")).toBe(false);
    expect(getActiveIds(NAVIGATION, "/").has("home")).toBe(true);
  });

  it("marks only the most specific item and its parent", () => {
    const active = getActiveIds(NAVIGATION, "/settings/billing");
    expect(active.has("settings-billing")).toBe(true);
    expect(active.has("settings-general")).toBe(false);
    expect(active.has("settings")).toBe(true);
  });

  it("honours exact matching", () => {
    const groups: AdminNavGroup[] = [
      {
        id: "g",
        items: [{ activeMatch: "exact", id: "a", title: "A", url: "/a" }],
      },
    ];
    expect(getActiveIds(groups, "/a/deeper").size).toBe(0);
    expect(getActiveIds(groups, "/a").has("a")).toBe(true);
  });

  it("ignores a query string in the item URL and never matches external links", () => {
    const groups: AdminNavGroup[] = [
      {
        id: "g",
        items: [
          { id: "a", title: "A", url: "/a?tab=1" },
          { id: "x", title: "X", url: "https://example.com/a" },
        ],
      },
    ];
    expect([...getActiveIds(groups, "/a")]).toEqual(["a"]);
  });

  it("lets an item bring its own matcher", () => {
    const groups: AdminNavGroup[] = [
      {
        id: "g",
        items: [
          {
            id: "a",
            isActive: (path) => path.includes("special"),
            title: "A",
            url: "/a",
          },
        ],
      },
    ];
    expect(getActiveIds(groups, "/x/special").has("a")).toBe(true);
    expect(getActiveIds(groups, "/a").has("a")).toBe(false);
  });
});

describe("getTabItems", () => {
  it("returns flagged links in order", () => {
    expect(getTabItems(NAVIGATION).map((item) => item.id)).toEqual([
      "home",
      "agenda",
      "people",
    ]);
  });

  it("stops at four", () => {
    const many: AdminNavGroup[] = [
      {
        id: "g",
        items: Array.from({ length: 7 }, (_, i) => ({
          id: `i${i}`,
          tab: true,
          title: `Item ${i}`,
          url: `/i${i}`,
        })),
      },
    ];
    expect(getTabItems(many)).toHaveLength(MAX_TAB_ITEMS);
  });
});

describe("filterNavigation", () => {
  it("prunes by the app's rule, then empty parents and groups", () => {
    const groups: AdminNavGroup[] = [
      {
        id: "g",
        items: [
          { id: "a", requires: "admin", title: "A", url: "/a" },
          {
            id: "p",
            subItems: [
              { id: "p1", requires: "admin", title: "P1", url: "/p1" },
            ],
            title: "P",
          },
        ],
      },
      { id: "h", items: [{ id: "b", title: "B", url: "/b" }] },
    ];
    const result = filterNavigation(
      groups,
      (item) => item.requires !== "admin"
    );
    expect(result.map((group) => group.id)).toEqual(["h"]);
  });
});

describe("getSearchEntries", () => {
  it("lists every destination, sub-items under their parent", () => {
    const entries = getSearchEntries(NAVIGATION);
    expect(entries.map((entry) => entry.label)).toEqual([
      "Home",
      "Agenda",
      "People",
      "Reports",
      "General",
      "Billing",
    ]);
    expect(
      entries.find((entry) => entry.id === "settings-general")?.group
    ).toBe("Settings");
    expect(entries[0]?.group).toBe("Pages");
  });
});

describe("activePrefixes", () => {
  const groups: AdminNavGroup[] = [
    {
      id: "g",
      items: [
        {
          activePrefixes: ["/studio/x/bookings"],
          id: "agenda",
          title: "Agenda",
          url: "/studio/x/agenda",
        },
        { id: "new", title: "New booking", url: "/studio/x/bookings/new" },
        { id: "people", title: "People", url: "/studio/x/people" },
      ],
    },
  ];

  it("keeps the owning item current on a detail page", () => {
    expect([...getActiveIds(groups, "/studio/x/bookings/42")]).toEqual([
      "agenda",
    ]);
  });

  it("lets a more specific direct match win", () => {
    expect([...getActiveIds(groups, "/studio/x/bookings/new")]).toEqual([
      "new",
    ]);
  });

  it("does not match a longer word that starts the same", () => {
    expect(getActiveIds(groups, "/studio/x/bookingsx").size).toBe(0);
  });
});
