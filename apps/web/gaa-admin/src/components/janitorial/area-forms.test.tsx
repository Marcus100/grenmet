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

import { terminal } from "@/lib/janitorial/test-fixtures";
import {
  AreaEditButton,
  TaskButton,
  toAreaUpdate,
  toTaskInput,
} from "./area-forms";

const BASE = "http://localhost";
const restrooms = terminal.areas[0];
let received: unknown;
const server = setupServer();

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  received = undefined;
});
afterAll(() => server.close());

function wrap(node: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
  );
}

describe("form mapping", () => {
  it("maps area form state to an update with the read revision", () => {
    expect(
      toAreaUpdate(
        {
          active: true,
          cleanlinessLevel: "",
          name: " Restrooms ",
          quantity: "6",
          sectionId: "2",
          spaceType: "restroom",
        },
        3
      )
    ).toEqual({
      sectionId: 2,
      name: "Restrooms",
      spaceType: "restroom",
      cleanlinessLevel: null,
      quantity: 6,
      active: true,
      expectedRevision: 3,
    });
  });

  it("maps task form state and drops an empty mode", () => {
    expect(
      toTaskInput({
        active: true,
        activity: "Mop",
        count: "2",
        mode: " ",
        periodUnit: "day",
        periodValue: "1",
      })
    ).toEqual({
      activity: "Mop",
      frequency: { count: 2, periodValue: 1, periodUnit: "day" },
      mode: null,
    });
  });
});

describe("AreaEditButton", () => {
  it("saves the area with its revision and refreshes", async () => {
    server.use(
      http.patch(`${BASE}/api/v1/janitorial/areas/10`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ...restrooms, quantity: 8, revision: 2 });
      })
    );
    wrap(<AreaEditButton area={restrooms} sections={terminal.sections} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit area" }));
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save area" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(received).toMatchObject({ quantity: 8, expectedRevision: 1 });
  });

  it("shows the API's conflict message", async () => {
    server.use(
      http.patch(`${BASE}/api/v1/janitorial/areas/10`, () =>
        HttpResponse.json(
          {
            detail:
              "This record was changed by someone else. Reload and try again.",
          },
          { status: 409 }
        )
      )
    );
    wrap(<AreaEditButton area={restrooms} sections={terminal.sections} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit area" }));
    fireEvent.click(screen.getByRole("button", { name: "Save area" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed by someone else"
    );
  });
});

describe("TaskButton", () => {
  it("adds a task to the area", async () => {
    server.use(
      http.post(
        `${BASE}/api/v1/janitorial/areas/10/tasks`,
        async ({ request }) => {
          received = await request.json();
          return HttpResponse.json(restrooms.tasks[0], { status: 201 });
        }
      )
    );
    wrap(<TaskButton areaId={10} task={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByLabelText("Activity"), {
      target: { value: "Refill soap" },
    });
    fireEvent.change(screen.getByLabelText("Times"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() =>
      expect(received).toEqual({
        activity: "Refill soap",
        frequency: { count: 4, periodValue: 1, periodUnit: "day" },
        mode: null,
      })
    );
  });
});
