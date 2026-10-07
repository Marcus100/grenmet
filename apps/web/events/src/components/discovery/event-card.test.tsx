import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeEvent } from "@/test/factories";
import { EventCard } from "./event-card";

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

vi.mock("@/data/actions", () => ({ setSaved: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const sunset = makeEvent({ startsAt: "2026-10-03T20:00:00Z" });

describe("EventCard", () => {
  it("shows Grenada local time, EC$ price and who is going", () => {
    render(<EventCard event={sunset} highlight="Tonight" />);

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
    render(<EventCard event={sunset} href={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
