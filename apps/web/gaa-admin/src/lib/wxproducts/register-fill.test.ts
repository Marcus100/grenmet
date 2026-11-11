import type { PublicCurrentConditions } from "@barrelsgd/api-client";
import { productFields } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import { isMiddayObservation, registerFill } from "./register-fill";

type Observation = NonNullable<PublicCurrentConditions["observation"]>;

const fields = productFields("midday").filter(
  (field) => field.fillFrom === "register"
);

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    station_id: "78958",
    station_name: "MBIA",
    observed_at: "2026-11-11T16:00:00Z",
    temperature_c: 30.46,
    ...overrides,
  } as Observation;
}

describe("register fill for the midday forecast", () => {
  it("marks only the midday temperature as filled from the register", () => {
    expect(fields.map((field) => field.key)).toEqual(["observedTemperature"]);
  });

  it("takes the accepted 12:00 Grenada observation, to one decimal", () => {
    expect(
      registerFill({ date: "2026-11-11", fields, observation: observation() })
    ).toEqual({ patch: { observedTemperature: "30.5" }, notes: [] });
  });

  it("never fills from another hour, day or station", () => {
    for (const other of [
      observation({ observed_at: "2026-11-11T17:00:00Z" }),
      observation({ observed_at: "2026-11-10T16:00:00Z" }),
      observation({ station_id: "78951" }),
    ]) {
      const result = registerFill({
        date: "2026-11-11",
        fields,
        observation: other,
      });
      expect(result.patch).toEqual({});
      expect(result.notes).toHaveLength(1);
    }
    expect(
      registerFill({
        date: "2026-11-11",
        fields,
        observation: observation({ observed_at: "2026-11-11T17:00:00Z" }),
      }).notes[0]
    ).toContain("11 Nov, 13:00");
  });

  it("says why when there is nothing to fill", () => {
    expect(
      registerFill({ date: "2026-11-11", fields, observation: null }).notes
    ).toEqual(["No accepted observation is in the register yet."]);
    expect(
      registerFill({
        date: "2026-11-11",
        fields,
        observation: observation({ temperature_c: null }),
      })
    ).toEqual({
      patch: {},
      notes: ["The 12:00 observation has no air temperature."],
    });
  });

  it("recognises 12:00 Grenada time (16:00 UTC) only", () => {
    expect(isMiddayObservation("2026-11-11T16:00:00Z", "2026-11-11")).toBe(
      true
    );
    expect(isMiddayObservation("2026-11-11T12:00:00-04:00", "2026-11-11")).toBe(
      true
    );
    expect(isMiddayObservation("2026-11-11T16:30:00Z", "2026-11-11")).toBe(
      false
    );
    expect(isMiddayObservation("not a time", "2026-11-11")).toBe(false);
  });
});
