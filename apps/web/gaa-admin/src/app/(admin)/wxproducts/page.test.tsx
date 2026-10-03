import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import Page from "./page";

const SAMPLE_REGISTER = /not a live observation register/;
const DRAFT_ONLY = /Operational transmission is not available/;

it("links to the four product desks and distinguishes the sample register", () => {
  render(<Page />);
  const desks = within(
    screen.getByRole("navigation", { name: "Weather product desks" })
  );
  for (const [name, href] of [
    ["Forecasts", "/wxproducts/fcsts"],
    ["NHC Products", "/wxproducts/nhc"],
    ["Bulletins", "/wxproducts/bulletins"],
    ["Aviation", "/wxproducts/aviation"],
  ]) {
    expect(
      desks.getByRole("link", { name: new RegExp(`^${name}`) })
    ).toHaveAttribute("href", href);
  }
  expect(desks.getAllByRole("link")).toHaveLength(4);
  const prototype = within(
    screen.getByRole("region", { name: "Hourly register — prototype" })
  );
  expect(prototype.getByText(SAMPLE_REGISTER)).toBeInTheDocument();
  expect(
    prototype.getByRole("link", { name: "View hourly register prototype" })
  ).toHaveAttribute("href", "/wxproducts/hourly");
  expect(screen.getByText(DRAFT_ONLY)).toBeInTheDocument();
});
