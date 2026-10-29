import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import HeatIndexPage from "./page";

/** A table cell's figure in one unit system, read from its data-units span. */
function cellIn(row: number, column: number, system: "metric" | "imperial") {
  const rows = screen.getAllByRole("row");
  const cell = within(rows[row] ?? document.body).getAllByRole("cell")[column];
  return cell?.querySelector(`[data-units-only="${system}"]`)?.textContent;
}

it("shows the heat index bands in degrees Celsius and Fahrenheit", () => {
  render(<HeatIndexPage />);
  expect(cellIn(1, 0, "metric")).toBe("27–32°C");
  expect(cellIn(2, 0, "metric")).toBe("32–41°C");
  expect(cellIn(3, 0, "metric")).toBe("41–54°C");
  expect(cellIn(4, 0, "metric")).toBe("Above 54°C");

  expect(cellIn(1, 0, "imperial")).toBe("81–90°F");
  expect(cellIn(3, 0, "imperial")).toBe("106–129°F");
  expect(cellIn(4, 0, "imperial")).toBe("Above 129°F");
});

it("shows the 31°C example and the high-30s range as measurements in both units", () => {
  const { container } = render(<HeatIndexPage />);
  const metric = Array.from(
    container.querySelectorAll('[data-units-only="metric"]'),
    (node) => node.textContent
  );
  const imperial = Array.from(
    container.querySelectorAll('[data-units-only="imperial"]'),
    (node) => node.textContent
  );
  expect(metric).toContain("31°C");
  expect(imperial).toContain("88°F");
  expect(metric).toContain("37–39°C");
  expect(imperial).toContain("99–102°F");
});
