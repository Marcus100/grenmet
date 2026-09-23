import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getTransportSpec } = vi.hoisted(() => ({ getTransportSpec: vi.fn() }));
vi.mock("@/db/transport/queries", () => ({ getTransportSpec }));

import BusPage from "./page";

const RUN_SUMMARY = /1 routes · 1 scheduled runs/;

describe("BusPage", () => {
  it("lists each route's shifts and trips", async () => {
    getTransportSpec.mockResolvedValue([
      {
        id: 6,
        number: 6,
        name: "Mardigras and Surrounding Areas",
        shifts: [
          {
            id: 1,
            name: "Morning",
            startTime: "05:30:00",
            endTime: "14:00:00",
            trips: [
              {
                id: 60,
                direction: "inbound",
                dayType: "daily",
                departTime: "04:30:00",
                arriveTime: "05:30:00",
                stops: [{ id: 1, name: "Mardigras", groupTime: "04:30:00" }],
              },
            ],
          },
        ],
      },
    ]);
    render(await BusPage());

    expect(
      screen.getByText("Route 6 — Mardigras and Surrounding Areas")
    ).toBeInTheDocument();
    expect(screen.getByText("Mardigras")).toBeInTheDocument();
    expect(screen.getByText(RUN_SUMMARY)).toBeInTheDocument();
  });

  it("lets API failures reach the admin error boundary", async () => {
    getTransportSpec.mockImplementation(() =>
      Promise.reject(new Error("unavailable"))
    );
    let thrown: unknown;
    try {
      await BusPage();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("unavailable");
  });
});
