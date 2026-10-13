import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  mergeGuidancePrefill,
  mergePrefillValues,
  NhcGuidanceEditor,
} from "./nhc-guidance-editor";

afterEach(cleanup);
it("prefills only empty fields until replacement is explicitly selected", () => {
  const original = {
    synopsis: "Forecaster wording",
    pressure: "",
    movement: "West",
  };
  const proposed = {
    synopsis: "NHC wording",
    pressure: "1008",
    movement: "Northwest",
  };
  expect(mergePrefillValues(original, proposed, [])).toEqual({
    synopsis: "Forecaster wording",
    pressure: "1008",
    movement: "West",
  });
  expect(mergePrefillValues(original, proposed, ["movement"])).toEqual({
    synopsis: "Forecaster wording",
    pressure: "1008",
    movement: "Northwest",
  });
  expect(original.pressure).toBe("");
});
it("adds a stable system without inventing values or probabilities", () => {
  const onChange = vi.fn();
  render(
    <NhcGuidanceEditor
      disabled={false}
      existingSystems={[]}
      guidance={null}
      kind="outlook"
      onChange={onChange}
      sourceEditionIds={[]}
      values={{}}
    />
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Add meteorological system" })
  );
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      systems: [
        expect.objectContaining({
          id: expect.any(String),
          feature_type: "disturbance",
          facts: [],
        }),
      ],
    })
  );
});
it("shows system-scoped probabilities and preserves the source qualifier", () => {
  render(
    <NhcGuidanceEditor
      disabled={false}
      existingSystems={[]}
      guidance={{
        systems: [
          {
            id: "d1a2d982-b2bd-4dc8-a148-82e3a2b36747",
            name: "Eastern",
            feature_type: "disturbance",
            facts: [
              {
                id: "0b59bb83-e962-4a13-90ed-65f95c8e7f11",
                key: "formation_probability",
                record_type: "forecast",
                horizon_hours: 48,
                unit: "percent",
                description: "near zero",
                value: null,
              },
            ],
          },
        ],
      }}
      kind="outlook"
      onChange={vi.fn()}
      sourceEditionIds={[]}
      values={{}}
    />
  );
  expect(screen.getByDisplayValue("near zero")).toBeInTheDocument();
  expect(screen.getByText("formation probability (48 h)")).toBeInTheDocument();
  expect(screen.getByText("formation probability (168 h)")).toBeInTheDocument();
});

it("connects only confirmed descriptions and retains manual edits and embedded suggestions", () => {
  const existing = {
    id: "gms-wave",
    name: "Reviewed wave",
    feature_type: "tropical_wave" as const,
    narrative: "Local wording",
    parent_system_id: "unselected-old-parent",
    relationship_confirmed: true,
    facts: [],
  };
  const proposed = {
    systems: [
      {
        id: "source-wave",
        name: "Source wave",
        feature_type: "tropical_wave" as const,
        narrative: "Source wording",
        facts: [],
      },
      {
        id: "source-low",
        name: "Embedded low",
        feature_type: "low_pressure_centre" as const,
        suggested_parent_system_id: "source-wave",
        facts: [],
      },
    ],
  };
  const unconfirmed = mergeGuidancePrefill(
    {},
    proposed,
    [existing],
    { "source-wave": "gms-wave" },
    []
  );
  expect(unconfirmed.systems?.[0]?.id).toBe("source-wave");
  const result = mergeGuidancePrefill(
    {},
    proposed,
    [existing],
    { "source-wave": "gms-wave" },
    ["source-wave"]
  );
  expect(result.systems?.[0]).toMatchObject({
    id: "gms-wave",
    narrative: "Local wording",
    parent_system_id: null,
    relationship_confirmed: false,
  });
  expect(result.systems?.[1]?.suggested_parent_system_id).toBe("gms-wave");
  expect(result.systems?.[1]?.parent_system_id).toBeUndefined();
});
