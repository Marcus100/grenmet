import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { RootSkipLink, StudioSkipLink } from "./root-skip-link";

describe("root skip link", () => {
  it.each(["/", "/sea-salt-spa", "/studio", "/signin"])(
    "shows on %s",
    (path) => {
      pathname.value = path;
      render(<RootSkipLink />);
      expect(
        screen.getByRole("link", { name: "Skip to content" })
      ).toHaveAttribute("href", "#main-content");
    }
  );

  it.each(["/studio/sea-salt/agenda", "/studio/sea-salt"])(
    "steps aside on %s, where the admin shell brings its own",
    (path) => {
      pathname.value = path;
      render(<RootSkipLink />);
      expect(
        screen.queryByRole("link", { name: "Skip to content" })
      ).toBeNull();
    }
  );
});

describe("studio plain frame skip link", () => {
  it("shows under a business path, where the root link steps aside", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioSkipLink />);
    expect(
      screen.getByRole("link", { name: "Skip to content" })
    ).toHaveAttribute("href", "#main-content");
  });

  it("stays out of the way on the picker, where the root link shows", () => {
    pathname.value = "/studio";
    render(<StudioSkipLink />);
    expect(screen.queryByRole("link", { name: "Skip to content" })).toBeNull();
  });
});
