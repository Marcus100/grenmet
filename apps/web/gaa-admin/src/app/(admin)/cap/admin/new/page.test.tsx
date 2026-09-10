import { configureApiClient } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const CBRNE_CATEGORY = /chemical, biological/i;

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
    fireEvent.click(screen.getByText("Edit CAP category mappings"));

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
    expect(capturedBody).toMatchObject({
      info: [
        {
          categories: ["Met"],
          severity: "Unknown",
          urgency: "Unknown",
          certainty: "Unknown",
          language: "en",
          sender_name: "Grenada Meteorological Service",
          contact: "meteorology@gaa.gd; 1-473-444-4142",
        },
      ],
    });
    expect(body.info[0]?.areas).toEqual([
      { kind: "AREA", area_desc: "Saint George" },
    ]);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/cap"));
  });

  it("narrows events by family and clears stale selections when switching families", async () => {
    const user = userEvent.setup();
    render(<NewAlertPage />);
    await user.click(screen.getByRole("combobox", { name: "Hazard family" }));
    await user.click(
      screen.getByRole("option", { name: "Hazardous materials" })
    );
    expect(
      document.querySelector('option[value="Chemical Spill"]')
    ).not.toBeNull();
    expect(
      document.querySelector('option[value="Hurricane Warning"]')
    ).toBeNull();
    fill("e.g. Tropical Storm", "Chemical Spill");
    fill("e.g. Tropical Storm Warning for Grenada", "Landslide notice");
    fill(
      "Describe the hazard and expected impact…",
      "Verified slope movement."
    );
    await user.click(screen.getByRole("combobox", { name: "Hazard family" }));
    await user.click(await screen.findByRole("option", { name: "Landslide" }));
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveValue("");
    expect(document.querySelector('option[value="Chemical Spill"]')).toBeNull();
    expect(document.querySelector('option[value="Rockfall"]')).not.toBeNull();
    clickSaveDraft();
    expect(capturedBody).toBeNull();
    fill("e.g. Tropical Storm", "Rockfall");
    clickSaveDraft();
    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        info: [{ event: "Rockfall", categories: ["Geo"], severity: "Unknown" }],
      })
    );
  });

  it("blocks submission and shows an error when required fields are empty", async () => {
    render(<NewAlertPage />);
    fireEvent.click(screen.getByText("Edit CAP category mappings"));

    clickSaveDraft();

    expect(
      await screen.findByText("Headline, event, and description are required.")
    ).toBeInTheDocument();
    expect(capturedBody).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });
  it("offers hazards beyond weather and saves a non-weather draft without an IBF", async () => {
    render(<NewAlertPage />);
    fireEvent.click(screen.getByText("Edit CAP category mappings"));
    for (const event of [
      "Earthquake",
      "Chemical Spill",
      "Pandemic",
      "Missing Child",
      "Radiation Release",
      "Dangerous Power Outage",
    ]) {
      expect(document.querySelector(`option[value="${event}"]`)).not.toBeNull();
    }
    fill("e.g. Tropical Storm Warning for Grenada", "Chemical spill exercise");
    fill("e.g. Tropical Storm", "Chemical Spill");
    fill(
      "Describe the hazard and expected impact…",
      "Exercise scenario for review."
    );
    expect(
      screen.getByRole("checkbox", { name: "Environmental" })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: CBRNE_CATEGORY })
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Meteorological" })
    ).not.toBeChecked();
    clickSaveDraft();
    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        info: [
          {
            event: "Chemical Spill",
            categories: ["CBRNE", "Env"],
            severity: "Unknown",
            urgency: "Unknown",
            certainty: "Unknown",
          },
        ],
      })
    );
    expect(capturedBody).not.toHaveProperty("ibf_assessment_id");
  });

  it("clears stale category suggestions for a custom event and requires explicit classification", async () => {
    render(<NewAlertPage />);
    fireEvent.click(screen.getByText("Edit CAP category mappings"));
    fill("e.g. Tropical Storm Warning for Grenada", "Custom incident");
    fill("Describe the hazard and expected impact…", "Incident details.");
    fill("e.g. Tropical Storm", "Hurricane Warning");
    expect(
      screen.getByRole("checkbox", { name: "Meteorological" })
    ).toBeChecked();
    fill("e.g. Tropical Storm", "Local infrastructure incident");
    expect(
      screen.getByRole("checkbox", { name: "Meteorological" })
    ).not.toBeChecked();
    clickSaveDraft();
    expect(
      await screen.findByText("Select at least one CAP category.")
    ).toBeInTheDocument();
    expect(capturedBody).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Infrastructure" }));
    clickSaveDraft();
    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        info: [
          {
            event: "Local infrastructure incident",
            categories: ["Infra"],
          },
        ],
      })
    );
  });

  it("allows categories and sender defaults to be changed before saving", async () => {
    render(<NewAlertPage />);
    fireEvent.click(screen.getByText("Edit CAP category mappings"));
    fill("e.g. Tropical Storm Warning for Grenada", "Coordinated incident");
    fill("e.g. Tropical Storm", "Chemical Spill");
    fill(
      "Describe the hazard and expected impact…",
      "Verified incident details."
    );
    fill(
      "e.g. Grenada Meteorological Service",
      "Authorized originating agency"
    );
    fireEvent.click(screen.getByRole("checkbox", { name: CBRNE_CATEGORY }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Health" }));
    clickSaveDraft();
    await waitFor(() =>
      expect(capturedBody).toMatchObject({
        info: [
          {
            categories: ["Env", "Health"],
            sender_name: "Authorized originating agency",
          },
        ],
      })
    );
  });
});
