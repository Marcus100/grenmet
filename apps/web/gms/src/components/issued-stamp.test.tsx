import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IssuedStamp } from "@/components/issued-stamp";
import { FORECAST_ISSUED } from "@/lib/forecast-data";

describe("IssuedStamp", () => {
  it("shows the issued time and next update time", () => {
    const { container } = render(<IssuedStamp />);
    expect(container.textContent).toContain(
      `Issued ${FORECAST_ISSUED.issuedAt}`
    );
    expect(container.textContent).toContain(FORECAST_ISSUED.nextUpdate);
  });
});
