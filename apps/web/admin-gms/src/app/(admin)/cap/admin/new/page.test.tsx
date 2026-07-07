import { configureApiClient } from "@grenmet/api-client";
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
import NewAlertPage from "./page";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const BASE = "http://localhost";
const CREATE_URL = `${BASE}/api/v1/cap/alerts`;
const SAVE_DRAFT = /save draft/i;

let capturedBody: unknown = null;

const server = setupServer(
  http.post(CREATE_URL, async ({ request }) => {
    capturedBody = await request.json();
    return HttpResponse.json(
      { id: "alert_new", identifier: "GD-2026-NEW" },
      { status: 201 }
    );
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  capturedBody = null;
  pushMock.mockReset();
  refreshMock.mockReset();
});
afterAll(() => server.close());

function fill(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value },
  });
}

function clickSaveDraft() {
  fireEvent.click(screen.getAllByRole("button", { name: SAVE_DRAFT })[0]);
}

describe("NewAlertPage", () => {
  it("submits a CapAlertCreate payload and redirects to the dashboard", async () => {
    render(<NewAlertPage />);

    fill("e.g. Tropical Storm Warning for Grenada", "Flood warning");
    fill("e.g. Tropical Storm", "Flash Flood");
    fill(
      "Describe the hazard and expected impact…",
      "Rapid flooding expected."
    );
    fill("Area 1 description", "Saint George");
    clickSaveDraft();

    await waitFor(() => expect(capturedBody).not.toBeNull());

    const body = capturedBody as {
      scope: string;
      status: string;
      msg_type: string;
      info: {
        headline: string;
        event: string;
        description: string;
        areas: { kind: string; area_desc: string }[];
      }[];
    };
    expect(body.scope).toBe("Public");
    expect(body.status).toBe("Actual");
    expect(body.msg_type).toBe("Alert");
    expect(body.info[0]?.headline).toBe("Flood warning");
    expect(body.info[0]?.event).toBe("Flash Flood");
    expect(body.info[0]?.description).toBe("Rapid flooding expected.");
    expect(body.info[0]?.areas).toEqual([
      { kind: "AREA", area_desc: "Saint George" },
    ]);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/cap/admin"));
  });

  it("blocks submission and shows an error when required fields are empty", async () => {
    render(<NewAlertPage />);

    clickSaveDraft();

    expect(
      await screen.findByText("Headline, event, and description are required.")
    ).toBeInTheDocument();
    expect(capturedBody).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
