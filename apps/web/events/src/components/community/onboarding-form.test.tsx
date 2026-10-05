import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { updateProfile } from "@/data/actions";
import { OnboardingForm, togglePick } from "./onboarding-form";

vi.mock("@/data/actions", () => ({ updateProfile: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/welcome",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe("togglePick", () => {
  it("adds and removes", () => {
    expect(togglePick(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("OnboardingForm", () => {
  it("requires an interest, then saves them to the profile", async () => {
    vi.mocked(updateProfile).mockResolvedValue({ ok: true, data: undefined });
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're all set"
    );
    expect(updateProfile).toHaveBeenCalledWith({
      interests: ["tech"],
      intents: ["hiring"],
      parish: "st-george",
    });
  });

  it("stays on the form and shows the error when saving fails", async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      ok: false,
      error: "Something went wrong. Try again shortly.",
    });
    render(
      <OnboardingForm
        initialIntents={[]}
        initialInterests={["tech"]}
        initialParish="st-george"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong"
    );
  });
});
