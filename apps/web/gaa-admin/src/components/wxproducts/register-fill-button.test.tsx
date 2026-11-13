import { productFields } from "@barrelsgd/gms/products";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  eregisterPublicCurrentConditions: () => ({
    unwrap: () => mocks.current(),
  }),
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));

import { RegisterFillButton } from "./register-fill-button";

const NOT_ACCEPTED = /The 12:00 observation is not accepted yet/u;

afterEach(() => {
  cleanup();
  mocks.current.mockReset();
  mocks.report.mockClear();
});

const fields = productFields("midday").filter((f) => f.fillFrom === "register");

function noon(status = "accepted") {
  return {
    observation: {
      station_id: "78958",
      observed_at: "2026-11-11T16:00:00Z",
      status,
      temperature_c: 30.4,
    },
  };
}

function setup(written: string[] = ["observedTemperature"]) {
  const onFill = vi.fn(() => written);
  render(
    <RegisterFillButton date="2026-11-11" fields={fields} onFill={onFill} />
  );
  fireEvent.click(screen.getByRole("button", { name: "Fill from register" }));
  return onFill;
}

describe("RegisterFillButton", () => {
  it("fills the midday temperature from the accepted 12:00 observation", async () => {
    mocks.current.mockResolvedValue(noon());
    const onFill = setup();
    expect(
      await screen.findByText(
        "Filled from the accepted 12:00 observation at MBIA"
      )
    ).toBeTruthy();
    expect(onFill).toHaveBeenCalledWith({
      patch: { observedTemperature: "30.4" },
      prefix: "",
      rows: 0,
    });
  });

  it("explains a provisional reading and fills nothing", async () => {
    mocks.current.mockResolvedValue(noon("provisional"));
    const onFill = setup([]);
    expect(await screen.findByText(NOT_ACCEPTED)).toBeTruthy();
    expect(onFill).toHaveBeenCalledWith({ patch: {}, prefix: "", rows: 0 });
  });

  it("keeps a typed value and says so", async () => {
    mocks.current.mockResolvedValue(noon());
    setup([]);
    expect(
      await screen.findByText(
        "Nothing to fill: the midday temperature already has a value."
      )
    ).toBeTruthy();
  });

  it("reports a register failure and fills nothing", async () => {
    mocks.current.mockRejectedValue(new Error("HTTP 503"));
    const onFill = setup();
    expect(
      await screen.findByText(
        "The register could not be read. Nothing was filled."
      )
    ).toBeTruthy();
    expect(onFill).not.toHaveBeenCalled();
    expect(mocks.report).toHaveBeenCalledWith(expect.any(Error), "wxproducts");
  });

  it("waits for an issue date", () => {
    render(<RegisterFillButton date={null} fields={fields} onFill={vi.fn()} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Fill from register",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText("Set the issue date first.")).toBeTruthy();
  });
});
