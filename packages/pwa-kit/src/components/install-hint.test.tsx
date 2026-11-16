// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallHint } from "./install-hint";

const ANDROID_STEPS = /Install app or Add to Home screen/u;

function standalone(value: boolean) {
  window.matchMedia = vi.fn(
    () => ({ matches: value }) as unknown as MediaQueryList
  );
}

beforeEach(() => {
  standalone(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InstallHint", () => {
  it("shows the app's own heading and the menu steps on Android", () => {
    render(<InstallHint title="Install the bus app" />);
    expect(
      screen.getByRole("heading", { name: "Install the bus app" })
    ).toBeInTheDocument();
    expect(screen.getByText(ANDROID_STEPS)).toBeVisible();
  });

  it("offers Chrome's own Install button when the browser allows it", () => {
    render(<InstallHint title="Install" />);
    const event = Object.assign(new Event("beforeinstallprompt"), {
      prompt: vi.fn(async () => undefined),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(
      screen.getByRole("button", { name: "Install on this phone" })
    ).toBeInTheDocument();
  });

  it("still shows the steps where the browser has no matchMedia", () => {
    Reflect.deleteProperty(window, "matchMedia");
    render(<InstallHint title="Install" />);
    expect(screen.getByText(ANDROID_STEPS)).toBeVisible();
  });

  it("shows nothing once the app is installed", () => {
    standalone(true);
    render(<InstallHint title="Install" />);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
