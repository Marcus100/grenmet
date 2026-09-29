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
  publications: { status: "ok", articles: [] },
  questions: { status: "ok", questions: [] },
  weatherNow: null,
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
