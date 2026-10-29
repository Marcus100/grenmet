import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import HurricaneSeasonPage from "./page";

/** A table cell's figure in one unit system, and all its text without the other system. */
function cellIn(row: number, column: number, system: "metric" | "imperial") {
  const rows = screen.getAllByRole("row");
  const cell = within(rows[row] ?? document.body).getAllByRole("cell")[column];
  const figure = cell?.querySelector(`[data-units-only="${system}"]`);
  const other = system === "metric" ? "imperial" : "metric";
  const copy = cell?.cloneNode(true) as HTMLElement | undefined;
  copy?.querySelector(`[data-units-only="${other}"]`)?.remove();
  return { figure: figure?.textContent, words: copy?.textContent };
}

it("shows the storm category winds in km/h and mph", () => {
  render(<HurricaneSeasonPage />);
  expect(cellIn(1, 1, "metric").figure).toBe("63–118 km/h");
  expect(cellIn(2, 1, "metric").figure).toBe("119–153 km/h");
  expect(cellIn(6, 1, "metric").figure).toBe("252 km/h");
  expect(cellIn(6, 1, "metric").words).toBe("252 km/h or more");

  expect(cellIn(1, 1, "imperial").figure).toBe("39–73 mph");
  expect(cellIn(2, 1, "imperial").figure).toBe("74–95 mph");
  expect(cellIn(6, 1, "imperial").figure).toBe("157 mph");
  expect(cellIn(6, 1, "imperial").words).toBe("157 mph or more");
});
