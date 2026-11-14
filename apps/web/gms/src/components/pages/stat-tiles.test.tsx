import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StatTiles } from "./stat-tiles";

afterEach(cleanup);

it("shows every tile on first render with no hidden initial state", () => {
  const { container } = render(
    <StatTiles stats={[{ label: "Stations", value: "12", detail: "Active" }]} />
  );
  expect(screen.getByText("Stations")).toBeVisible();
  expect(container.querySelector("[style*='opacity']")).toBeNull();
});
