import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FrontPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

const POLLING_DAY = /Thursday 5 November/;
const POLICE_POLL = /Police special poll/;

describe("front page", () => {
  it("leads with the announced polling day and lists the police poll", () => {
    render(<FrontPage />);
    expect(screen.getAllByText(POLLING_DAY).length).toBeGreaterThan(0);
    expect(screen.getByText(POLICE_POLL)).toBeTruthy();
    expect(screen.getByText("2 November 2026")).toBeTruthy();
  });
});
