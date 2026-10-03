import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildDemoEvents, demoProfiles } from "@/data/community-fixtures";
import { EventCard } from "./event-card";
import { toCardData } from "./to-card";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const now = new Date("2026-10-03T12:00:00-04:00");
const sunset = buildDemoEvents(now).find(
  (event) => event.slug === "feel-free-sunset"
);
if (!sunset) {
  throw new Error("fixture missing");
}

describe("EventCard", () => {
  it("shows Grenada local time, EC$ price and who is going", () => {
    render(
      <EventCard event={toCardData(sunset, demoProfiles)} highlight="Tonight" />
    );

    expect(
      screen.getByText("Saturday, 3 October · 4:00 PM")
    ).toBeInTheDocument();
    expect(screen.getByText("From EC$150")).toBeInTheDocument();
    expect(screen.getByText("3 going")).toBeInTheDocument();
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/events/feel-free-sunset"
    );
  });

  it("renders without a link for previews", () => {
    render(<EventCard event={toCardData(sunset, demoProfiles)} href={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
