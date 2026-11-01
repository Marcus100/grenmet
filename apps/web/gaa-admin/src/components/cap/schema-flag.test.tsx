import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SchemaFlag } from "@/components/cap/schema-flag";

describe("SchemaFlag", () => {
  it("names an imported alert that does not fully follow the CAP standard, with the first error", () => {
    render(
      <SchemaFlag
        alert={{
          schema_conformant: false,
          schema_error: "line 4: value 'Critical' is not an element of the set",
        }}
      />
    );
    const flag = screen.getByText("Does not fully follow the CAP standard");
    expect(flag).toHaveAttribute(
      "title",
      "line 4: value 'Critical' is not an element of the set"
    );
  });

  it("shows nothing for a conforming alert", () => {
    const { container } = render(
      <SchemaFlag alert={{ schema_conformant: true, schema_error: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
