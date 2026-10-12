import { productFields } from "@barrelsgd/gms/products";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProductNumberInput } from "./product-number-input";

const speed = productFields("morning").find((f) => f.key === "windSpeedMin");
if (!speed) throw new Error("Missing wind field");

it("keeps untouched stored precision and typed decimals, and refreshes from normalized values", () => {
  const onChange = vi.fn();
  const view = render(
    <ProductNumberInput
      field={speed}
      id="speed"
      onChange={onChange}
      value="10"
    />
  );
  const input = screen.getByRole("spinbutton");
  expect(input).toHaveValue(11.51);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "20.50" } });
  const canonical: string = onChange.mock.calls[0]?.[0];
  expect(Number(canonical)).toBeCloseTo(20.5 / (1852 / 1609.344), 10);
  view.rerender(
    <ProductNumberInput
      field={speed}
      id="speed"
      onChange={onChange}
      value={canonical}
    />
  );
  expect(input).toHaveAttribute("value", "20.50");
  view.rerender(
    <ProductNumberInput
      field={speed}
      id="speed"
      onChange={onChange}
      value="7"
    />
  );
  expect(input).toHaveValue(8.06);
  fireEvent.change(input, { target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith("");
});
