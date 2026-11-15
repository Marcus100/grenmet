import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatBookingWhen } from "@/lib/booking-when";
import { LocalBookingWhen } from "./local-booking-when";

const STARTS = "2030-01-10T14:00:00Z";
const ENDS = "2030-01-10T15:00:00Z";

describe("LocalBookingWhen", () => {
  it("renders a labelled UTC fallback, never an empty element, before the browser loads", () => {
    const html = renderToStaticMarkup(
      <LocalBookingWhen endsAt={ENDS} startsAt={STARTS} />
    );
    expect(html).toContain(`dateTime="${STARTS}"`);
    expect(html).toContain("2:00 pm UTC to 3:00 pm UTC");
  });

  it("shows the viewer's own zone once rendered in the browser", () => {
    render(<LocalBookingWhen endsAt={ENDS} startsAt={STARTS} />);
    const local = formatBookingWhen(STARTS, ENDS);
    expect(screen.getByText(local)).toBeInTheDocument();
    expect(local).not.toContain("UTC");
  });
});
