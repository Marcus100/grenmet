import { configureApiClient, type UserPublic } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { SignInSetup } from "./sign-in-setup";

const user: UserPublic = {
  id: "target-user",
  email: "staff@example.com",
  username: "staff",
  first_name: "Staff",
  last_name: "User",
  full_name: "Staff User",
  created_at: "2026-10-07T00:00:00Z",
  updated_at: "2026-10-07T00:00:00Z",
  is_active: true,
  is_superuser: false,
};

const OPEN_LINK_STEP = /they open the link and choose their own password/i;
const NEVER_SEE_PASSWORD = /you never see the password/i;
const TWENTY_FOUR_HOURS = /24 hours/;
const OUTSIDE_SCOPE = /outside your management scope/i;
const COPY_FAILED_TEXT = /Copying did not work in this browser/;
const REASON_LABEL = /Reason/;
const TWO_STEP_TEXT = /two-step verification/i;
const TEN_CHARACTER_HINT = /at least 10 characters when the email is verified/i;
const LINK = "https://auth.example/activate#token=private-link-token";
const SETUP_URL =
  "http://localhost/api/v1/auth/onboarding/target-user/sign-in-setup";
const REVOKE_URL = SETUP_URL;

let issueStatus = 201;
let issueDetail = "";
let issueCalls = 0;
let revoked = false;
const server = setupServer(
  http.post(SETUP_URL, async ({ request }) => {
    issueCalls++;
    expect(await request.json()).toEqual({
      identity_confirmed: true,
      reason: "Work mailbox not live yet",
    });
    if (issueStatus !== 201) {
      return HttpResponse.json(
        { detail: issueDetail },
        { status: issueStatus }
      );
    }
    return HttpResponse.json(
      { activation_url: LINK, expires_at: "2026-10-10T00:00:00Z" },
      { status: 201 }
    );
  }),
  http.delete(REVOKE_URL, () => {
    revoked = true;
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  issueStatus = 201;
  issueDetail = "";
  issueCalls = 0;
  revoked = false;
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SignInSetup open user={user} />
    </QueryClientProvider>
  );
}

function fillReason() {
  fireEvent.change(screen.getByLabelText(REASON_LABEL), {
    target: { value: "Work mailbox not live yet" },
  });
}

function openPanel() {
  fireEvent.click(
    screen.getByRole("button", { name: "Set up sign-in for this person" })
  );
}

it("explains the step in plain language and keeps create disabled until identity and reason are given", () => {
  renderPanel();
  openPanel();
  expect(screen.getByText(OPEN_LINK_STEP)).toBeTruthy();
  expect(screen.getByText(NEVER_SEE_PASSWORD)).toBeTruthy();
  expect(screen.getByText(TWENTY_FOUR_HOURS)).toBeTruthy();
  const create = screen.getByRole("button", { name: "Create setup link" });
  expect((create as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  expect((create as HTMLButtonElement).disabled).toBe(true);
  fillReason();
  expect((create as HTMLButtonElement).disabled).toBe(false);
});

it("shows the link once and copies it on request", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  const field = await screen.findByDisplayValue(LINK);
  expect((field as HTMLInputElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
  expect(issueCalls).toBe(1);
});

it("explains a failed clipboard write in plain words", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
  });
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  await screen.findByDisplayValue(LINK);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByText(COPY_FAILED_TEXT)).toBeTruthy();
});

it("explains a scope refusal without naming the account", async () => {
  issueStatus = 404;
  issueDetail = "Account not found";
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  expect(await screen.findByText(OUTSIDE_SCOPE)).toBeTruthy();
  expect(screen.queryByDisplayValue(LINK)).toBeNull();
});

it("asks for two-step verification when the caller has no authenticator", async () => {
  issueStatus = 403;
  issueDetail =
    "Set up two-step verification and save recovery codes in account security before using privileged staff tools (mfa_enrolment_required)";
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  expect(await screen.findByText(TWO_STEP_TEXT)).toBeTruthy();
});

it("maps a 409 to the server reason and says nothing changed", async () => {
  issueStatus = 409;
  issueDetail = "Employment has ended, so sign-in setup is not available";
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  expect(
    await screen.findByText(
      "Employment has ended, so sign-in setup is not available. Nothing was changed."
    )
  ).toBeTruthy();
});

it("states the 10-character reason rule and shows the server's 422 reason", async () => {
  issueStatus = 422;
  issueDetail =
    "Give a reason of at least 10 characters: this person's email is verified, so sign-in setup needs one";
  renderPanel();
  openPanel();
  expect(screen.getByText(TEN_CHARACTER_HINT)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  expect(
    await screen.findByText(
      "Give a reason of at least 10 characters: this person's email is verified, so sign-in setup needs one. Nothing was changed."
    )
  ).toBeTruthy();
});

it("revokes an issued link", async () => {
  renderPanel();
  openPanel();
  fireEvent.click(screen.getByRole("checkbox"));
  fillReason();
  fireEvent.click(screen.getByRole("button", { name: "Create setup link" }));
  await screen.findByDisplayValue(LINK);
  fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));
  await waitFor(() => expect(revoked).toBe(true));
  await waitFor(() => expect(screen.queryByDisplayValue(LINK)).toBeNull());
});
