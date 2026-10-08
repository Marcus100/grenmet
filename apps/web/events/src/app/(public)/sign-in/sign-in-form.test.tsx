import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

const CODE_LABEL = /6-digit code/;
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
}));

describe("SignInForm", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("asks for the code after the email, then returns to the target page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SignInForm returnTo="/me" />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.gd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    const code = await screen.findByLabelText(CODE_LABEL);

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/me"));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/auth/email-code/start",
      "/auth/email-code/verify",
    ]);
  });

  it("shows the server's message when the code is wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(
          Response.json({ detail: "Wrong or expired code" }, { status: 400 })
        )
    );
    render(<SignInForm returnTo="/me" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.gd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    fireEvent.change(await screen.findByLabelText(CODE_LABEL), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wrong or expired code"
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

it("adds the enrolled authenticator challenge and supports a recovery code", async () => {
  replace.mockClear();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ ok: true }))
    .mockResolvedValueOnce(
      Response.json(
        { detail: "Two-factor authentication code required or invalid" },
        { status: 400 }
      )
    )
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SignInForm returnTo="/me" />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "a@b.gd" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
  fireEvent.change(await screen.findByLabelText(CODE_LABEL), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.change(
    await screen.findByLabelText("Authenticator or recovery code"),
    { target: { value: "SAVED-RECOVERY-CODE" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/me"));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
    code: "123456",
    email: "a@b.gd",
    totp_code: "SAVED-RECOVERY-CODE",
  });
});
