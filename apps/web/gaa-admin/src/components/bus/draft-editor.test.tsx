import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { DraftEditor, grenadaToday } from "./draft-editor";
import {
  catalogue,
  detail,
  fullAccess,
  summary,
  viewerAccess,
} from "./test-fixtures";

const BASE = "http://localhost";
const VERSION = `${BASE}/api/v1/transport/timetable/versions/9`;

let published: unknown;
const server = setupServer(
  http.post(`${VERSION}/publish`, async ({ request }) => {
    published = await request.json();
    return HttpResponse.json(detail());
  }),
  http.delete(
    `${VERSION}/trips/600`,
    () => new HttpResponse(null, { status: 204 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
  published = undefined;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const draft = (issues = detail().issues) =>
  detail({
    version: summary({ id: 9, state: "draft", status: "draft" }),
    issues,
  });

function renderEditor(value = draft(), access = fullAccess) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <DraftEditor access={access} catalogue={catalogue} detail={value} />
    </QueryClientProvider>
  );
}

describe("grenadaToday", () => {
  it("uses Grenada's calendar date, not the browser's", () => {
    // 02:00 UTC on 1 Oct is still 30 Sep in Grenada (UTC-4).
    expect(grenadaToday(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09-30");
  });
});

describe("DraftEditor", () => {
  it("publishes with the chosen effective date", async () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(published).toEqual({ effectiveDate: "2026-11-01" });
  });

  it("blocks publishing while there are blocking issues", () => {
    renderEditor(
      draft([
        {
          severity: "error",
          code: "no_trips",
          message: "The timetable has no trips",
        },
      ])
    );
    expect(screen.getByRole("button", { name: "Publish…" })).toBeDisabled();
    expect(
      screen.getByText("Fix the blocking issues before publishing.")
    ).toBeVisible();
    expect(screen.getByText("The timetable has no trips")).toBeVisible();
  });

  it("shows why the API refused to publish", async () => {
    server.use(
      http.post(`${VERSION}/publish`, () =>
        HttpResponse.json(
          { detail: "The effective date cannot be in the past" },
          { status: 422 }
        )
      )
    );
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Publish…" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The effective date cannot be in the past"
    );
  });

  it("leaves publishing to officers who hold the permission", () => {
    renderEditor(draft(), { ...viewerAccess, canManageTimetable: true });
    expect(screen.queryByRole("button", { name: "Publish…" })).toBeNull();
    expect(
      screen.getByText("A Transport officer publishes timetables.")
    ).toBeVisible();
  });

  it("removes a trip after confirmation", async () => {
    renderEditor();
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Remove trip" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
