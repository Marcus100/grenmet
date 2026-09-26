import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getTimetableVersion: vi.fn(),
  getTransportAccess: vi.fn(),
  getTransportCatalogue: vi.fn(),
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  })
);
vi.mock("@/db/transport/queries", () => queries);
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/bus/draft-editor", () => ({
  DraftEditor: () => <div data-testid="draft-editor" />,
}));

import {
  catalogue,
  detail,
  fullAccess,
  staffAccess,
  summary,
  viewerAccess,
} from "@/components/bus/test-fixtures";
import TimetableVersionPage from "./page";

const EFFECTIVE_DATE = /effective 25 Sep 2026/;

const load = (versionId: string) =>
  TimetableVersionPage({ params: Promise.resolve({ versionId }) });

const draft = () =>
  detail({
    version: summary({
      id: 9,
      label: "November changes",
      state: "draft",
      status: "draft",
      effectiveDate: null,
    }),
  });

describe("TimetableVersionPage", () => {
  beforeEach(() => {
    queries.getTransportAccess.mockResolvedValue(fullAccess);
    queries.getTransportCatalogue.mockResolvedValue(catalogue);
    queries.getTimetableVersion.mockResolvedValue(draft());
  });

  it("opens the editor for a draft when the user can manage timetables", async () => {
    render(await load("9"));
    expect(screen.getByTestId("draft-editor")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows a draft read-only, with its validation, to viewers", async () => {
    queries.getTransportAccess.mockResolvedValue(viewerAccess);
    render(await load("9"));
    expect(screen.queryByTestId("draft-editor")).toBeNull();
    expect(screen.getByRole("heading", { name: "Validation" })).toBeVisible();
  });

  it("shows published versions read-only even to managers", async () => {
    queries.getTimetableVersion.mockResolvedValue(detail());
    render(await load("1"));
    expect(screen.queryByTestId("draft-editor")).toBeNull();
    expect(screen.getByText(EFFECTIVE_DATE)).toBeVisible();
  });

  it.each([
    ["an invalid id", "abc", fullAccess, draft()],
    ["an unknown version", "404", fullAccess, null],
    ["a user without portal access", "9", staffAccess, draft()],
  ])("is not found for %s", async (_case, id, access, version) => {
    queries.getTransportAccess.mockResolvedValue(access);
    queries.getTimetableVersion.mockResolvedValue(version);
    let thrown: unknown;
    try {
      await load(id);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe("NEXT_NOT_FOUND");
  });
});
