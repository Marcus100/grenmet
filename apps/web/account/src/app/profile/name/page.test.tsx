import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getMyProfile } = vi.hoisted(() => ({ getMyProfile: vi.fn() }));
vi.mock("@/lib/account-profile-api", () => ({ getMyProfile }));
vi.mock("@/app/profile/actions", () => ({ saveNameAction: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "kezia@example.com",
    name: "kezia",
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));

import ProfileNamePage from "./page";

const PROFILE = {
  email: "kezia@example.com",
  first_name: "kezia",
  last_name: "",
  name_is_placeholder: true,
  phone: null,
};

afterEach(cleanup);

describe("ProfileNamePage", () => {
  it("starts with empty fields when the name is the sign-up's stand-in", async () => {
    getMyProfile.mockResolvedValue(PROFILE);

    render(await ProfileNamePage());

    expect(screen.getByLabelText("First name")).toHaveValue("");
    expect(screen.getByLabelText("Last name (optional)")).toHaveValue("");
  });

  it("starts from a real name, including a one-word name", async () => {
    getMyProfile.mockResolvedValue({
      ...PROFILE,
      first_name: "Kezia",
      name_is_placeholder: false,
    });

    render(await ProfileNamePage());

    expect(screen.getByLabelText("First name")).toHaveValue("Kezia");
    expect(screen.getByLabelText("Last name (optional)")).toHaveValue("");
  });
});
