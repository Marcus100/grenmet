import type { CapAlertCreate, CapAlertUpdate } from "@barrelsgd/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deskAlert } from "@/test/desk-alert.fixture";
import { renderWithGmsCatalogue as render } from "@/test/with-gms-catalogue";

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-map-gl/maplibre", () => ({
  AttributionControl: () => null,
  Layer: () => null,
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="cap-map">{children}</div>
  ),
  NavigationControl: () => null,
  ScaleControl: () => null,
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

const api = vi.hoisted(() => ({
  capCreateAlert: vi.fn(),
  capUpdateAlert: vi.fn(),
  wxproductsListPublicProducts: vi.fn(),
}));
vi.mock("@barrelsgd/api-client", () => api);

import { AlertEditor } from "./alert-editor";

const PATTERN_1 = /Headline/;
const PATTERN_2 = /^Description/;
const PATTERN_3 = /^Status/;
const PATTERN_4 = /Saving a change sends it back to Draft/;
const PATTERN_5 = /replaces urn:original when published/;
const PATTERN_6 = /no longer in a state that allows this/;

function clickSave() {
  const [button] = screen.getAllByRole("button", { name: "Save draft" });
  if (!button) throw new Error("No Save draft button");
  fireEvent.click(button);
}

function firstCall<T>(calls: unknown[][]): [T] {
  const call = calls.at(0);
  if (!call) throw new Error("The API was not called");
  return call as [T];
}

const CATALOGS = {
  languages: ["en"],
  message_types: ["Alert", "Update", "Cancel"],
  scopes: ["Public", "Restricted", "Private"],
  statuses: ["Actual", "Exercise", "System", "Test", "Draft"],
} as never;

function ok<T>(value: T) {
  return { unwrap: () => Promise.resolve(value) };
}

function refused(status: number, detail: unknown) {
  const error = Object.assign(new Error("failed"), {
    data: { detail },
    name: "ResponseError",
    status,
  });
  return { unwrap: () => Promise.reject(error) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creating a warning", () => {
  it("says what is missing instead of saving", () => {
    render(<AlertEditor catalogs={CATALOGS} mode="create" />);
    clickSave();
    expect(
      screen.getByText("Headline, event, and description are required.")
    ).toBeVisible();
    expect(api.capCreateAlert).not.toHaveBeenCalled();
  });

  it("saves an Alert with the GMS level and opens it", async () => {
    api.capCreateAlert.mockReturnValue(ok(deskAlert()));
    render(<AlertEditor catalogs={CATALOGS} mode="create" />);
    fireEvent.change(screen.getByLabelText(PATTERN_1), {
      target: { value: "Heavy Rainfall Watch for Grenada" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Event" }), {
      target: { value: "Heavy Rainfall Watch" },
    });
    fireEvent.change(screen.getByLabelText(PATTERN_2), {
      target: { value: "Heavy rain is expected." },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Watch" }));
    fireEvent.click(screen.getByRole("radio", { name: "Yellow" }));
    fireEvent.click(screen.getByRole("button", { name: "St. Andrew" }));
    clickSave();

    await waitFor(() => expect(api.capCreateAlert).toHaveBeenCalled());
    const [{ body }] = firstCall<{ body: CapAlertCreate }>(
      api.capCreateAlert.mock.calls
    );
    expect(body.msg_type).toBe("Alert");
    expect(body.status).toBe("Actual");
    expect(body.info?.[0]?.severity).toBe("Moderate");
    expect(body.info?.[0]?.parameters).toEqual(
      expect.arrayContaining([
        { value: "Watch", value_name: "GMS:product" },
        expect.objectContaining({ value_name: "awareness_level" }),
      ])
    );
    expect(body.info?.[0]?.areas?.[0]?.geocodes).toEqual([
      { value: "GD-01", value_name: "ISO3166-2:GD" },
    ]);
    expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${deskAlert().id}`);
  });

  it("warns that a non-Actual status is not a live warning", () => {
    render(<AlertEditor catalogs={CATALOGS} mode="create" />);
    fireEvent.change(screen.getByLabelText(PATTERN_3), {
      target: { value: "Exercise" },
    });
    expect(
      screen.getByText("Status: Exercise. This is not a live warning")
    ).toBeVisible();
  });
});

describe("editing a saved draft", () => {
  it("sends a PATCH with the edited content, keeping the saved level and areas", async () => {
    const alert = deskAlert();
    api.capUpdateAlert.mockReturnValue(ok(alert));
    render(<AlertEditor alert={alert} catalogs={CATALOGS} mode="edit" />);
    expect(screen.getByRole("heading", { name: "Edit draft" })).toBeVisible();
    const headline = screen.getByLabelText(PATTERN_1);
    expect(headline).toHaveValue("Heavy Rainfall Warning");
    fireEvent.change(headline, {
      target: { value: "Heavy Rainfall Warning (corrected)" },
    });
    clickSave();

    await waitFor(() => expect(api.capUpdateAlert).toHaveBeenCalled());
    const [{ body, path }] = firstCall<{
      body: CapAlertUpdate;
      path: { alert_id: string };
    }>(api.capUpdateAlert.mock.calls);
    expect(path).toEqual({ alert_id: alert.id });
    expect(body).not.toHaveProperty("msg_type");
    expect(body).not.toHaveProperty("references");
    expect(body.info?.[0]?.headline).toBe("Heavy Rainfall Warning (corrected)");
    expect(body.info?.[0]?.severity).toBe("Severe");
    expect(body.info?.[0]?.areas?.[0]?.geocodes).toEqual([
      { value: "GD-01", value_name: "ISO3166-2:GD" },
    ]);
    expect(api.capCreateAlert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(`/desk/alerts/${alert.id}`);
  });

  it("warns that saving an approved alert sends it back to Draft", () => {
    render(
      <AlertEditor
        alert={deskAlert({ lifecycle_state: "APPROVED" })}
        catalogs={CATALOGS}
        mode="edit"
      />
    );
    expect(screen.getByText(PATTERN_4)).toBeVisible();
  });

  it("names the Update's reference and keeps it", () => {
    render(
      <AlertEditor
        alert={deskAlert({
          msg_type: "Update",
          references: [
            {
              id: "r1",
              identifier: "urn:original",
              sender: "meteorology@gaa.gd",
              sent: "2026-10-31T10:00:00Z",
            },
          ] as never,
        })}
        catalogs={CATALOGS}
        mode="edit"
      />
    );
    expect(screen.getByText(PATTERN_5)).toBeVisible();
  });

  it("lists each field the API refused with 422", async () => {
    api.capUpdateAlert.mockReturnValue(
      refused(422, [
        {
          loc: ["body", "info", 0, "web"],
          msg: "Value error, web must be a single address",
        },
      ])
    );
    render(<AlertEditor alert={deskAlert()} catalogs={CATALOGS} mode="edit" />);
    clickSave();
    expect(
      await screen.findByText("Some values could not be saved.")
    ).toBeVisible();
    expect(
      screen.getByText(
        "info › 0 › web: Value error, web must be a single address"
      )
    ).toBeVisible();
  });

  it("explains a 409 when the draft was published meanwhile", async () => {
    api.capUpdateAlert.mockReturnValue(
      refused(
        409,
        "Only draft, submitted, or approved CAP alerts can be edited."
      )
    );
    render(<AlertEditor alert={deskAlert()} catalogs={CATALOGS} mode="edit" />);
    clickSave();
    expect(await screen.findByText(PATTERN_6)).toBeVisible();
  });
});
