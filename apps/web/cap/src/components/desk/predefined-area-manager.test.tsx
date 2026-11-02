import type { CapAreaCreate } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({ savePredefinedArea: vi.fn() }));
vi.mock("@/app/desk/areas/actions", () => actions);

// The real picker draws a map; the manager only needs its output here.
vi.mock("@/components/desk/area-picker", async () => {
  const React = await import("react");
  return {
    AreaPicker: ({
      onAreasChange,
    }: {
      onAreasChange: (areas: unknown[]) => void;
    }) =>
      React.createElement(
        "button",
        {
          onClick: () =>
            onAreasChange([
              {
                area_desc: "Marina",
                circles: [],
                geocodes: [{ name: "parish", value: "GD01" }],
                multipolygons: [],
                polygons: [],
              },
            ]),
          type: "button",
        },
        "Pick marina"
      ),
  };
});

import {
  buildPredefinedArea,
  PredefinedAreaManager,
} from "./predefined-area-manager";

const SAVED = {
  area_desc: "Saint Andrew",
  circles: [],
  created_at: "2026-10-01T00:00:00Z",
  geocodes: [],
  id: "11111111-2222-4333-8444-555555555555",
  is_active: true,
  multipolygons: [],
  name: "Saint Andrew",
  polygons: [],
  updated_at: "2026-10-01T00:00:00Z",
};

const SAVE_BUTTON = /save predefined area/i;
const NO_ACCESS = "No access to save predefined areas";
const NONE_SAVED = "No predefined areas are saved yet.";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PredefinedAreaManager", () => {
  it("shows the empty state for the saved list", () => {
    render(<PredefinedAreaManager areas={[]} canCreate />);
    expect(screen.getByText(NONE_SAVED)).toBeInTheDocument();
  });

  it("lists saved areas for everyone, including users who cannot save", () => {
    render(<PredefinedAreaManager areas={[SAVED]} canCreate={false} />);
    expect(
      screen.getByRole("heading", { name: "Saint Andrew" })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(NO_ACCESS);
  });

  it("keeps the save button off until a name and an area are set", () => {
    render(<PredefinedAreaManager areas={[]} canCreate />);
    expect(screen.getByRole("button", { name: SAVE_BUTTON })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Pick marina" }));
    expect(screen.getByRole("button", { name: SAVE_BUTTON })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Area name"), {
      target: { value: "Marina" },
    });
    expect(screen.getByRole("button", { name: SAVE_BUTTON })).toBeEnabled();
  });

  it("saves the picked area and refreshes the list", async () => {
    actions.savePredefinedArea.mockResolvedValue({ data: SAVED, ok: true });
    render(<PredefinedAreaManager areas={[]} canCreate />);
    fireEvent.change(screen.getByLabelText("Area name"), {
      target: { value: "Marina" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pick marina" }));
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.savePredefinedArea).toHaveBeenCalledWith(
      expect.objectContaining({ area_desc: "Marina", name: "Marina" })
    );
  });

  it("shows a refused save as an error and keeps the name", async () => {
    actions.savePredefinedArea.mockResolvedValue({
      error: {
        items: ["Area name is already in use."],
        kind: "validation",
        status: 422,
        title: "Some values could not be saved.",
      },
      ok: false,
    });
    render(<PredefinedAreaManager areas={[]} canCreate />);
    fireEvent.change(screen.getByLabelText("Area name"), {
      target: { value: "Marina" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pick marina" }));
    fireEvent.click(screen.getByRole("button", { name: SAVE_BUTTON }));
    expect(
      await screen.findByText("Area name is already in use.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Area name")).toHaveValue("Marina");
  });
});

describe("buildPredefinedArea", () => {
  it("joins multiple picked shapes into one area", () => {
    const body = buildPredefinedArea("  Coast ", [
      {
        area_desc: "A",
        circles: [],
        geocodes: [],
        multipolygons: [],
        polygons: [[[0, 0]]],
      },
      {
        area_desc: "B",
        circles: [{ latitude: 1, longitude: 2, radius: 3 }],
        geocodes: [],
        multipolygons: [],
        polygons: [],
      },
    ] as CapAreaCreate[]);
    expect(body.name).toBe("Coast");
    expect(body.area_desc).toBe("A; B");
    expect(body.polygons).toEqual([[[0, 0]]]);
    expect(body.circles).toHaveLength(1);
    expect(body.is_active).toBe(true);
  });
});
