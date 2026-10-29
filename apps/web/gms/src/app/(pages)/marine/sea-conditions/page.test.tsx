import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import SeaConditionsPage from "./page";

/** The wave-height cell of a sea-state row, as the table shows it in both systems. */
function heightCell(description: string) {
  const row = screen.getByRole("row", { name: new RegExp(`^${description}`) });
  return within(row).getAllByRole("cell")[1];
}

it("shows each wave-height band in metres and in feet", () => {
  render(<SeaConditionsPage />);
  const metric = (description: string) =>
    heightCell(description)?.querySelector('[data-units-only="metric"]')
      ?.textContent;
  const imperial = (description: string) =>
    heightCell(description)?.querySelector('[data-units-only="imperial"]')
      ?.textContent;

  expect(metric("Smooth")).toBe("Under 0.5 m");
  expect(metric("Slight")).toBe("0.5–1.25 m");
  expect(metric("Moderate")).toBe("1.25–2.5 m");
  expect(metric("Rough")).toBe("2.5–4 m");
  expect(metric("Very rough")).toBe("Over 4 m");

  expect(imperial("Smooth")).toBe("Under 1.64 ft");
  expect(imperial("Slight")).toBe("1.64–4.1 ft");
  expect(imperial("Moderate")).toBe("4.1–8.2 ft");
  expect(imperial("Very rough")).toBe("Over 13.12 ft");
});
