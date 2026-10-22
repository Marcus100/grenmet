// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ signUpAction: vi.fn() }));
vi.mock("../app/security/actions", () => ({ changeAccountPassword: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ChangePasswordForm } from "../app/password/change-password-form";
import { SignUpForm } from "./SignUpForm";

// renderToString is the server HTML a browser shows before hydration: a
// native submit there would be a GET carrying the passwords in the URL.
function submitButton(html: string) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.querySelector<HTMLButtonElement>('button[type="submit"]');
}

describe("pre-hydration submit", () => {
  it("disables the sign-up submit button", () => {
    expect(submitButton(renderToString(<SignUpForm />))?.disabled).toBe(true);
  });

  it("disables the change-password submit button", () => {
    expect(submitButton(renderToString(<ChangePasswordForm />))?.disabled).toBe(
      true
    );
  });
});
