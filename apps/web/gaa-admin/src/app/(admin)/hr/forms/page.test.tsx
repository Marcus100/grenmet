import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { newRequestItems } from "@/components/hr/dashboard/dashboard-data";
import HrFormsPage from "./page";

it("links to every HR form, split into requests and records", () => {
  render(<HrFormsPage />);

  for (const item of newRequestItems) {
    expect(
      screen.getByRole("link", { name: new RegExp(item.title, "i") })
    ).toHaveAttribute("href", item.href);
  }

  expect(screen.getAllByText("Approval")).toHaveLength(
    newRequestItems.filter((item) => item.group === "request").length
  );
  expect(screen.getAllByText("Record")).toHaveLength(
    newRequestItems.filter((item) => item.group === "record").length
  );
});
