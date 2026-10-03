import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingForm, PREFS_KEY, togglePick } from "./onboarding-form";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

afterEach(() => window.localStorage.clear());

describe("togglePick", () => {
  it("adds and removes", () => {
    expect(togglePick(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("OnboardingForm", () => {
  it("requires an interest, then saves preferences", () => {
    render(
      <OnboardingForm
        initialIntents={[]}
        initialInterests={[]}
        initialParish="st-george"
      />
    );
    const submit = screen.getByRole("button", { name: "Save and continue" });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Tech" }));
    fireEvent.click(screen.getByRole("button", { name: "Hiring" }));
    fireEvent.click(submit);

    expect(screen.getByRole("status")).toHaveTextContent("You're all set");
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toEqual({
      interests: ["tech"],
      intents: ["hiring"],
      parish: "st-george",
    });
  });
});
