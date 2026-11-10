import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProductErrorSummary } from "./product-error-summary";

const linked = {
  fieldId: "morning-summary",
  message: "Weather: Weather forecast is required",
};

it("lists each blocking problem, linking those that name a field", () => {
  render(
    <ProductErrorSummary
      focusRequest={0}
      onFollow={vi.fn()}
      problems={[linked, { message: "Could not save. Try again." }]}
    />
  );
  const summary = screen.getByRole("alert", { name: "There is a problem" });
  expect(summary).toHaveTextContent("There is a problem");
  expect(screen.getByRole("link", { name: linked.message })).toHaveAttribute(
    "href",
    "#morning-summary"
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(
    screen.getByText("Could not save. Try again.").closest("a")
  ).toBeNull();
});

it("moves focus to the summary when a failed attempt raises the focus request", () => {
  const { rerender } = render(
    <ProductErrorSummary
      focusRequest={0}
      onFollow={vi.fn()}
      problems={[linked]}
    />
  );
  expect(screen.getByRole("alert")).not.toHaveFocus();
  rerender(
    <ProductErrorSummary
      focusRequest={1}
      onFollow={vi.fn()}
      problems={[linked]}
    />
  );
  expect(screen.getByRole("alert")).toHaveFocus();
});

it("reports a followed link to the desk without navigating", () => {
  const onFollow = vi.fn();
  render(
    <ProductErrorSummary
      focusRequest={0}
      onFollow={onFollow}
      problems={[linked]}
    />
  );
  const link = screen.getByRole("link", { name: linked.message });
  const notPrevented = fireEvent.click(link);
  expect(notPrevented).toBe(false);
  expect(onFollow).toHaveBeenCalledWith(linked);
});

it("lists warnings apart from problems and never raises the alert", () => {
  render(
    <ProductErrorSummary
      focusRequest={0}
      onFollow={vi.fn()}
      problems={[]}
      warnings={["Wave height is unusually high for this sea state"]}
    />
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByText("Warnings (these do not stop you saving or publishing)")
  ).toBeInTheDocument();
  expect(
    screen.getByText("Wave height is unusually high for this sea state")
  ).toBeInTheDocument();
});

it("renders nothing when there are no problems or warnings", () => {
  const { container } = render(
    <ProductErrorSummary focusRequest={0} onFollow={vi.fn()} problems={[]} />
  );
  expect(container).toBeEmptyDOMElement();
});
