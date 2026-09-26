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
// MapLibre needs WebGL, which jsdom lacks; render markers as plain elements.
vi.mock("react-map-gl/maplibre", () => ({
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="stops-map">{children}</div>
  ),
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
  NavigationControl: () => null,
  ScaleControl: () => null,
  AttributionControl: () => null,
}));

import { StopsManager, toStopInput } from "./stops-manager";
import { catalogue } from "./test-fixtures";

const MAP_COVERAGE = /1 of 2 stops are on the map/;

const BASE = "http://localhost";
let received: unknown;
const server = setupServer(
  http.put(`${BASE}/api/v1/transport/stops/12`, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json(catalogue.stops[1]);
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderManager(canManage = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StopsManager canManage={canManage} stops={catalogue.stops} />
    </QueryClientProvider>
  );
}

describe("toStopInput", () => {
  it("normalises the code and sends a location only as a pair", () => {
    expect(
      toStopInput({
        code: " grd-01 ",
        name: "Grand Anse ",
        landmark: "",
        latitude: "12.02",
        longitude: "",
        active: true,
      })
    ).toEqual({
      code: "GRD-01",
      name: "Grand Anse",
      landmark: null,
      latitude: null,
      longitude: null,
      active: true,
    });
  });
});

describe("StopsManager", () => {
  it("shows map coverage and filters by name, code or landmark", () => {
    renderManager();
    expect(screen.getByText(MAP_COVERAGE)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search stops"), {
      target: { value: "church" },
    });
    expect(screen.getByText("Mardigras")).toBeVisible();
    expect(screen.queryByText("Victoria Police Station")).toBeNull();
  });

  it("saves a stop's landmark and location", async () => {
    renderManager();
    fireEvent.click(screen.getByRole("button", { name: "Edit Mardigras" }));
    fireEvent.change(screen.getByLabelText("Latitude"), {
      target: { value: "12.1102" },
    });
    fireEvent.change(screen.getByLabelText("Longitude"), {
      target: { value: "-61.6511" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save stop" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(received).toEqual({
      code: "MARDIGRAS",
      name: "Mardigras",
      landmark: "Junction by the church",
      latitude: 12.1102,
      longitude: -61.6511,
      active: true,
    });
  });

  it("hides editing controls from viewers", () => {
    renderManager(false);
    expect(screen.queryByRole("button", { name: "Add stop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Mardigras" })).toBeNull();
  });
});
