import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  Explained,
  PublicationsAndAlerts,
  Stories,
} from "@/components/home/live-sections";
import { fetchHomeContent, type HomeContent } from "@/lib/cms";

vi.mock("@/lib/cms", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cms")>();
  const fetchHome = vi.fn();
  return {
    ...actual,
    fetchHomeContent: fetchHome,
    isSectionHidden: async (key: string) =>
      ((await fetchHome()) as HomeContent).settings.hiddenSections.includes(
        key
      ),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const hidden = (sections: string[]): HomeContent => ({
  deskUpdates: { status: "ok", articles: [] },
  stories: { status: "ok", articles: [] },
  questions: { status: "ok", questions: [] },
  weatherNow: null,
  discover: null,
  settings: { discoverCards: [], hiddenSections: sections },
});

it("drops sections editors hide", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(
    hidden(["stories", "questions"])
  );
  expect(await Stories()).toBeNull();
  expect(await Explained()).toBeNull();
});

it("keeps the official alerts band when reports are hidden", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden(["reports"]));
  render(await PublicationsAndAlerts());
  expect(screen.queryByText("Latest reports")).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Get official alerts first" })
  ).toBeInTheDocument();
});

it("shows an empty state, not a stale list, when no questions are published", async () => {
  vi.mocked(fetchHomeContent).mockResolvedValue(hidden([]));
  render(await Explained());
  expect(
    screen.getByText("No questions are published yet.")
  ).toBeInTheDocument();
});

it("lists current bulletins and outlooks, never daily forecasts", async () => {
  const { latestReports } = await import("@/components/home/live-sections");
  const product = (id: string, kind: string, issuedAt: string) =>
    ({
      id,
      kind,
      revision: 1,
      publishedAt: issuedAt,
      values: { issuedAt },
    }) as never;
  const reports = latestReports([
    product("a", "morning", "2026-09-29T07:00"),
    product("b", "outlook", "2026-09-29T14:00"),
    product("c", "outlook", "2026-09-29T08:00"),
  ]);
  expect(reports.map((item: { id: string }) => item.id)).toEqual(["b", "c"]);
});
