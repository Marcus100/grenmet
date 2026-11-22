import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManagedEvent, SettlementSummary } from "@/domain/types";
import { makeManagedEvent, makeOrganiser } from "@/test/factories";
import {
  countListings,
  OrganiserOverview,
  overviewOrder,
  salesTotals,
} from "./organiser-overview";

const RE_NO_TICKETED_EVENTS_YET = /No ticketed events yet/u;
const RE_SAMPLE_DATA = /sample data/iu;
const RE_NEW_EVENT = /New event/u;
const RE_ONLINE_PAYMENTS_ARE_NOT_TOTALLED_HERE =
  /Online payments are not totalled here/u;

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

const NO_SALES_LABEL = RE_NO_TICKETED_EVENTS_YET;
const SAMPLE_LABEL = RE_SAMPLE_DATA;
const NEW_EVENT_LABEL = RE_NEW_EVENT;

const NOW = new Date("2026-10-17T12:00:00Z");

function managed(overrides: Partial<ManagedEvent>): ManagedEvent {
  return makeManagedEvent({ id: "evt-x", title: "Untitled", ...overrides });
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

function summary(overrides: Partial<SettlementSummary>): SettlementSummary {
  return {
    admitted: 0,
    cancelled: 0,
    refunded: 0,
    cashCollectedMinor: 0,
    cashCountedMinor: 0,
    cashExpectedMinor: 0,
    claimed: 0,
    issued: 0,
    issues: 0,
    listingId: "evt-s",
    startsAt: "2026-11-01T20:00:00Z",
    status: "published",
    title: "Summary",
    ...overrides,
  };
}

describe("overviewOrder", () => {
  it("lists upcoming events soonest first, then ended ones most recent first", () => {
    const ordered = overviewOrder(
      [
        managed({
          id: "old",
          startsAt: "2026-08-01T20:00:00Z",
          endsAt: "2026-08-01T23:00:00Z",
        }),
        managed({
          id: "later",
          startsAt: "2026-12-20T20:00:00Z",
          endsAt: "2026-12-20T23:00:00Z",
        }),
        managed({
          id: "recent",
          startsAt: "2026-10-10T20:00:00Z",
          endsAt: "2026-10-10T23:00:00Z",
        }),
        managed({
          id: "soon",
          startsAt: "2026-10-30T20:00:00Z",
          endsAt: "2026-10-30T23:00:00Z",
        }),
      ],
      NOW
    );
    expect(ordered.map((event) => event.id)).toEqual([
      "soon",
      "later",
      "recent",
      "old",
    ]);
  });

  it("does not mutate the list it is given", () => {
    const input = [
      managed({
        id: "b",
        startsAt: "2026-12-01T20:00:00Z",
        endsAt: "2026-12-01T23:00:00Z",
      }),
      managed({
        id: "a",
        startsAt: "2026-11-01T20:00:00Z",
        endsAt: "2026-11-01T23:00:00Z",
      }),
    ];
    overviewOrder(input, NOW);
    expect(input.map((event) => event.id)).toEqual(["b", "a"]);
  });
});

describe("salesTotals", () => {
  it("adds issued, refunded, admitted and cash across the ticketed events", () => {
    expect(
      salesTotals([
        summary({
          issued: 40,
          refunded: 4,
          admitted: 31,
          cashCollectedMinor: 15_000,
        }),
        summary({ issued: 10, admitted: 2, cashCollectedMinor: 2500 }),
      ])
    ).toEqual({
      active: 46,
      admitted: 33,
      cashMinor: 17_500,
      issued: 50,
      refunded: 4,
    });
  });

  it("is all zeros with no ticketed events", () => {
    expect(salesTotals([])).toEqual({
      active: 0,
      admitted: 0,
      cashMinor: 0,
      issued: 0,
      refunded: 0,
    });
  });
});

describe("OrganiserOverview sales panel", () => {
  it("shows the totals from settlement, labelled, and not online revenue", () => {
    render(
      <OrganiserOverview
        listings={listings}
        now={NOW}
        organiser={makeOrganiser({ name: "Feel Free Promotions" })}
        settlement={[
          summary({
            issued: 40,
            refunded: 4,
            admitted: 31,
            cashCollectedMinor: 15_000,
            listingId: "evt-a",
            title: "Harbour Lights Fete",
          }),
          summary({
            issued: 10,
            admitted: 2,
            cashCollectedMinor: 2500,
            listingId: "evt-b",
            title: "Past Jam",
          }),
        ]}
        viewerName="Ada Byron"
      />
    );
    const panel = screen
      .getByRole("heading", { name: "Ticket sales" })
      .closest("section");
    expect(panel).not.toBeNull();
    const scoped = within(panel as HTMLElement);
    expect(scoped.getByText("Tickets active")).toBeInTheDocument();
    expect(scoped.getByText("46")).toBeInTheDocument();
    expect(scoped.getByText("50 issued, 4 refunded")).toBeInTheDocument();
    expect(scoped.queryByText("Tickets issued")).toBeNull();
    expect(scoped.getByText("33")).toBeInTheDocument();
    expect(scoped.getByText("EC$175.00")).toBeInTheDocument();
    expect(
      scoped.getByText(RE_ONLINE_PAYMENTS_ARE_NOT_TOTALLED_HERE)
    ).toBeInTheDocument();
    expect(scoped.queryByText(NO_SALES_LABEL)).toBeNull();
  });

  it("says there are no sales yet when no ticketed event has settlement", () => {
    render(
      <OrganiserOverview
        listings={listings}
        now={NOW}
        organiser={makeOrganiser({ name: "Feel Free Promotions" })}
        viewerName="Ada Byron"
      />
    );
    expect(screen.getByText(NO_SALES_LABEL)).toBeInTheDocument();
    expect(screen.queryByText("Tickets active")).toBeNull();
  });
});

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
  it("lists real event titles, says there are no sales yet and shows settlement", () => {
    render(
      <OrganiserOverview
        listings={listings}
        now={NOW}
        organiser={makeOrganiser({ name: "Feel Free Promotions" })}
        viewerName="Ada Byron"
      />
    );

    expect(screen.getByText("Harbour Lights Fete")).toBeInTheDocument();
    expect(screen.getByText("Secret Draft")).toBeInTheDocument();
    expect(screen.getByText(NO_SALES_LABEL)).toBeInTheDocument();
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
        viewerName="Ada Byron"
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
