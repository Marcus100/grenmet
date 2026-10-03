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

import { SetupManager, toAreaCreate } from "./setup-manager";

const FIRST_BUILDING = /Add the first building/;

const BASE = "http://localhost";
let received: unknown;
const server = setupServer(
  http.post(`${BASE}/api/v1/janitorial/buildings`, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json(
      {
        id: 50,
        siteId: 2,
        code: "cru-lauriston-terminal",
        name: "Lauriston Terminal",
        kind: "terminal",
        active: true,
        revision: 1,
        sections: [],
        areas: [],
      },
      { status: 201 }
    );
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  received = undefined;
});
afterAll(() => server.close());

describe("toAreaCreate", () => {
  it("lets the API infer type and level when no space type is chosen", () => {
    expect(
      toAreaCreate(5, {
        cleanlinessLevel: "2",
        name: " Washrooms ",
        quantity: "3",
        sectionId: "",
        spaceType: "",
      })
    ).toEqual({
      buildingId: 5,
      sectionId: null,
      name: "Washrooms",
      spaceType: null,
      cleanlinessLevel: null,
      quantity: 3,
    });
  });
});

describe("SetupManager", () => {
  it("starts an empty site by adding its first building", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SetupManager
          buildings={[]}
          canAddBuildings
          siteCode="CRU"
          siteId={2}
          siteName="Lauriston Airport"
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(FIRST_BUILDING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add building" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Lauriston Terminal" },
    });
    fireEvent.change(screen.getByLabelText("Kind"), {
      target: { value: "terminal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save building" }));

    await waitFor(() =>
      expect(received).toEqual({
        siteId: 2,
        name: "Lauriston Terminal",
        kind: "terminal",
      })
    );
  });
});
