import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getJanitorialSpec } = vi.hoisted(() => ({
  getJanitorialSpec: vi.fn(),
}));
vi.mock("@/db/janitorial/queries", () => ({ getJanitorialSpec }));

import JanitorPage from "./page";

const AREA_SUMMARY = /1 buildings · 2 areas/;

const terminal = {
  id: 1,
  name: "Air Terminal Building (ATB)",
  sections: [
    {
      id: null,
      name: null,
      areas: [
        {
          id: 10,
          name: "Restrooms",
          tasks: [
            {
              id: 100,
              activity: "Clean Mirrors",
              mode: null,
              frequency: { count: 1, periodValue: 15, periodUnit: "minute" },
            },
          ],
          bundles: [],
        },
      ],
    },
    {
      id: 2,
      name: "Meeting Rooms & Office Spaces",
      areas: [
        {
          id: 11,
          name: "Reception Area",
          tasks: [],
          bundles: [
            {
              id: 5,
              name: "Terrazzo Maintenance and Floor Care",
              items: [
                {
                  activity: "Buff Terrazzo Floor",
                  frequency: { count: 3, periodValue: 5, periodUnit: "day" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("JanitorPage", () => {
  it("shows areas without a section alongside sectioned areas", async () => {
    getJanitorialSpec.mockResolvedValue([terminal]);
    render(await JanitorPage());

    expect(screen.getByText("Restrooms")).toBeInTheDocument();
    expect(screen.getByText("1×/15 mins")).toBeInTheDocument();
    expect(
      screen.getByText("Meeting Rooms & Office Spaces")
    ).toBeInTheDocument();
    expect(screen.getByText(AREA_SUMMARY)).toBeInTheDocument();
  });

  it("names the task bundles an area uses", async () => {
    getJanitorialSpec.mockResolvedValue([terminal]);
    render(await JanitorPage());

    expect(
      screen.getByText("0 tasks + Terrazzo Maintenance and Floor Care")
    ).toBeInTheDocument();
  });

  it("lets API failures reach the admin error boundary", async () => {
    getJanitorialSpec.mockImplementation(() =>
      Promise.reject(new Error("unavailable"))
    );
    let thrown: unknown;
    try {
      await JanitorPage();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("unavailable");
  });
});
