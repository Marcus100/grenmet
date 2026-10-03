import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  catalogue,
  shiftBoard,
  staffList,
} from "@/lib/janitorial/test-fixtures";
import { weekDays } from "@/lib/janitorial/week";
import { cellAssignments, ShiftBoard } from "./shift-board";

const ASSIGN = /^Assign to/;

const BASE = "http://localhost";
let received: unknown;
const server = setupServer();

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderBoard(canManage = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ShiftBoard
        assignments={shiftBoard.assignments}
        buildings={catalogue.buildings}
        canManage={canManage}
        days={weekDays("2026-10-05")}
        patterns={shiftBoard.patterns}
        siteId={1}
        staff={staffList.staff}
        zones={shiftBoard.zones}
      />
    </QueryClientProvider>
  );
}

describe("cellAssignments", () => {
  it("keeps scheduled rows for the zone and day", () => {
    const { assignments, patterns } = shiftBoard;
    expect(
      cellAssignments(assignments, patterns, 4, "2026-10-05")
    ).toHaveLength(1);
    // Tuesday's only assignment was cancelled.
    expect(cellAssignments(assignments, patterns, 4, "2026-10-06")).toEqual([]);
  });
});

describe("ShiftBoard", () => {
  it("assigns a staff member to a zone and day", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/janitorial/shift-assignments`,
        async ({ request }) => {
          received = await request.json();
          return HttpResponse.json(shiftBoard.assignments[0], { status: 201 });
        }
      )
    );
    renderBoard();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Assign to Terminal restrooms on Wed 7 Oct",
      })
    );
    fireEvent.change(screen.getByLabelText("Shift"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(received).toEqual({
        workDate: "2026-10-07",
        shiftPatternId: 2,
        staffId: staffList.staff[0]?.id,
        zoneId: 4,
        note: null,
      })
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it("cancels an assignment with its revision", async () => {
    server.use(
      http.patch(
        `${BASE}/api/v1/janitorial/shift-assignments/:id`,
        async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({
            ...shiftBoard.assignments[0],
            status: "cancelled",
          });
        }
      )
    );
    renderBoard();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel Maria Joseph, Morning, Mon 5 Oct",
      })
    );

    await waitFor(() =>
      expect(received).toMatchObject({
        status: "cancelled",
        expectedRevision: 1,
      })
    );
  });

  it("is read-only without shift management", () => {
    renderBoard(false);

    expect(screen.queryByRole("button", { name: "Add shift" })).toBeNull();
    expect(screen.queryByRole("button", { name: ASSIGN })).toBeNull();
  });
});
