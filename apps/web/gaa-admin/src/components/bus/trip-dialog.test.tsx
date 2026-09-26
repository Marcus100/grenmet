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
import { catalogue, route1Trip } from "./test-fixtures";
import { TripDialog, toTripInput } from "./trip-dialog";

const BASE = "http://localhost";
const TRIPS = `${BASE}/api/v1/transport/timetable/versions/9/trips`;

let received: unknown;
const server = setupServer(
  http.post(TRIPS, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json({ ...route1Trip, id: 101 }, { status: 201 });
  }),
  http.put(`${TRIPS}/100`, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json(route1Trip);
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  received = undefined;
});
afterAll(() => server.close());

function renderDialog(trip: typeof route1Trip | null) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <TripDialog
        catalogue={catalogue}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        open
        routeId={6}
        trip={trip}
        versionId={9}
      />
    </QueryClientProvider>
  );
  return { onOpenChange, onSaved };
}

describe("toTripInput", () => {
  it("sends blank optional fields as null and only stated times as exact", () => {
    const input = toTripInput({
      routeId: 1,
      shiftId: 1,
      calendarId: 1,
      direction: "inbound",
      departTime: "04:30",
      arriveTime: "",
      status: "confirmed",
      notes: "",
      sourceRef: null,
      stops: [
        { key: 1, stopId: 11, time: "", timepoint: true },
        { key: 2, stopId: 12, time: "04:45", timepoint: true },
      ],
    });
    expect(input.arriveTime).toBeNull();
    expect(input.notes).toBeNull();
    expect(input.stops).toEqual([
      { stopId: 11, time: null, timepoint: false },
      { stopId: 12, time: "04:45", timepoint: true },
    ]);
  });
});

describe("TripDialog", () => {
  it("adds a trip to the chosen route with its stops in order", async () => {
    const { onOpenChange, onSaved } = renderDialog(null);

    expect(screen.getByLabelText("Route")).toHaveValue("6");
    fireEvent.change(screen.getByLabelText("Departs"), {
      target: { value: "13:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    fireEvent.click(screen.getByRole("button", { name: "Add stop" }));
    fireEvent.change(screen.getByLabelText("Stop 2"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Time at stop 2"), {
      target: { value: "13:20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move stop 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save trip" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(received).toMatchObject({
      routeId: 6,
      departTime: "13:00",
      arriveTime: null,
      stops: [
        { stopId: 12, time: "13:20", timepoint: false },
        { stopId: 11, time: null, timepoint: false },
      ],
    });
  });

  it("replaces an existing trip", async () => {
    const { onSaved } = renderDialog(route1Trip);
    expect(screen.getByLabelText("Departs")).toHaveValue("03:30");
    fireEvent.click(screen.getByRole("button", { name: "Remove stop 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save trip" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(received).toMatchObject({ routeId: 1, stops: [] });
  });

  it("shows the API's reason when the trip is rejected", async () => {
    server.use(
      http.post(TRIPS, () =>
        HttpResponse.json(
          { detail: "Arrival cannot be before departure" },
          { status: 422 }
        )
      )
    );
    const { onSaved } = renderDialog(null);
    fireEvent.change(screen.getByLabelText("Departs"), {
      target: { value: "15:00" },
    });
    fireEvent.change(screen.getByLabelText("Arrives"), {
      target: { value: "14:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save trip" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Arrival cannot be before departure"
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("catches malformed times before calling the API", async () => {
    renderDialog(null);
    fireEvent.change(screen.getByLabelText("Departs"), {
      target: { value: "9am" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save trip" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(received).toBeUndefined();
  });
});
