import { productFields } from "@barrelsgd/gms/products";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ProductFieldControl } from "./product-field-control";

const OPTION_FIELDS = productFields("morning").filter((f) => f.options);

it("lets a forecaster clear an optional list once something is picked", async () => {
  const optional = OPTION_FIELDS.find((f) => !f.required);
  if (!optional?.options) throw new Error("no optional list field");
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ProductFieldControl
      field={optional}
      kind="morning"
      onChange={onChange}
      value={optional.options[0] ?? ""}
    />
  );
  await user.click(screen.getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: "None" }));
  expect(onChange).toHaveBeenCalledWith("");
});

it("offers no empty choice for a required list", async () => {
  const required = OPTION_FIELDS.find((f) => f.required);
  if (!required?.options) throw new Error("no required list field");
  const user = userEvent.setup();
  render(
    <ProductFieldControl
      field={required}
      kind="morning"
      onChange={vi.fn()}
      value={required.options[0] ?? ""}
    />
  );
  await user.click(screen.getByRole("combobox"));
  await screen.findAllByRole("option");
  expect(screen.queryByRole("option", { name: "None" })).toBeNull();
});
