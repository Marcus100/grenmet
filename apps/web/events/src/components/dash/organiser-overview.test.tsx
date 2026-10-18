import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManagedEvent } from "@/domain/types";
import { makeEvent, makeOrganiser } from "@/test/factories";
import { countListings, OrganiserOverview } from "./organiser-overview";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dash",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock("@/data/actions", () => ({
  finishUpload: () => undefined,
  saveOrganiserLogo: () => undefined,
  startUpload: () => undefined,
  switchOrganiser: () => undefined,
}));

const AVAILABLE_LABEL = /Available when ticketing launches/;
const SAMPLE_LABEL = /sample data/i;
const NEW_EVENT_LABEL = /New event/;

const NOW = new Date("2026-10-17T12:00:00Z");

function managed(overrides: Partial<ManagedEvent>): ManagedEvent {
  const base = makeEvent({ id: "evt-x", title: "Untitled" });
  return {
    ...base,
    capacity: 100,
    group: null,
    organiser: makeOrganiser(),
    status: "published",
    tiers: [],
    visibility: "public",
    ...overrides,
  };
}

const listings: ManagedEvent[] = [
  managed({
    id: "evt-a",
    title: "Harbour Lights Fete",
    startsAt: "2026-11-01T20:00:00Z",
    endsAt: "2026-11-01T23:00:00Z",
  }),
  managed({
    id: "evt-b",
    title: "Past Jam",
    startsAt: "2026-09-01T20:00:00Z",
    endsAt: "2026-09-01T23:00:00Z",
  }),
  managed({
    id: "evt-c",
    title: "Secret Draft",
    status: "draft",
    startsAt: "2026-12-01T20:00:00Z",
    endsAt: "2026-12-01T23:00:00Z",
  }),
];

describe("countListings", () => {
  it("counts published, upcoming and draft listings from the API rows", () => {
    expect(countListings(listings, NOW)).toEqual({
      drafts: 1,
      published: 2,
      total: 3,
      upcoming: 1,
    });
  });

  it("is all zeros with no listings", () => {
    expect(countListings([], NOW)).toEqual({
      drafts: 0,
      published: 0,
      total: 0,
      upcoming: 0,
    });
  });
});

describe("OrganiserOverview", () => {
  it("lists real event titles, labels sales as unavailable and shows settlement", () => {
    render(
      <OrganiserOverview
        listings={listings}
        now={NOW}
        organiser={makeOrganiser({ name: "Feel Free Promotions" })}
      />
    );

    expect(screen.getByText("Harbour Lights Fete")).toBeInTheDocument();
    expect(screen.getByText("Secret Draft")).toBeInTheDocument();
    expect(screen.getAllByText(AVAILABLE_LABEL)).toHaveLength(1);
    expect(
      screen.getByText("No ticketed events to settle yet.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Demo workspace")).toBeNull();
    expect(screen.queryByText(SAMPLE_LABEL)).toBeNull();
  });

  it("shows an empty state with a create link when there are no listings", () => {
    render(
      <OrganiserOverview
        listings={[]}
        now={NOW}
        organiser={makeOrganiser({ name: "Feel Free Promotions" })}
      />
    );

    expect(
      screen.getByText("No events yet. Create your first one.")
    ).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(
      within(main).getAllByRole("link", { name: NEW_EVENT_LABEL })[0]
    ).toHaveAttribute("href", "/dash/events/new");
  });
});
