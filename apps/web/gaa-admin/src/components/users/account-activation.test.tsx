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

const actor = vi.hoisted(() => ({ is_superuser: true }));
vi.mock("@barrelsgd/auth", () => ({ useSessionUser: () => actor }));

import { AccountActivation } from "./account-activation";

const user: UserPublic = {
  id: "test-user",
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
let issued = false;
let calls = 0;
const server = setupServer(
  http.get("http://localhost/api/v1/auth/onboarding/test-user", () =>
    HttpResponse.json({
      user_id: user.id,
      email_verified: false,
      password_setup_pending: true,
      activation_pending: issued,
      can_issue_activation: true,
      apps: [
        {
          app: "cms",
          label: "GMS content",
          available: false,
          blockers: ["password_setup", "cms_grant"],
        },
      ],
    })
  ),
  http.post(
    "http://localhost/api/v1/auth/onboarding/test-user/activation",
    async ({ request }) => {
      expect(await request.json()).toEqual({ identity_confirmed: true });
      issued = true;
      calls++;
      return HttpResponse.json(
        {
          activation_url: "https://auth.example/activate#token=private",
          expires_at: "2026-10-07T23:00:00Z",
        },
        { status: 201 }
      );
    }
  ),
  http.delete(
    "http://localhost/api/v1/auth/onboarding/test-user/activation",
    () => {
      issued = false;
      return new HttpResponse(null, { status: 204 });
    }
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  actor.is_superuser = true;
  issued = false;
  calls = 0;
});
afterAll(() => server.close());
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <AccountActivation open user={user} />
    </QueryClientProvider>
  );
}
it("requires identity confirmation, displays blockers, and can revoke a private link", async () => {
  mount();
  const button = await screen.findByRole("button", {
    name: "Create activation link",
  });
  expect(button).toBeDisabled();
  expect(
    screen.getByText("Choose Writer or Publisher under CMS access.")
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  expect(
    await screen.findByLabelText("Copy this private activation link")
  ).toHaveValue("https://auth.example/activate#token=private");
  expect(calls).toBe(1);
  fireEvent.click(
    await screen.findByRole("button", { name: "Revoke activation link" })
  );
  await waitFor(() =>
    expect(
      screen.queryByLabelText("Copy this private activation link")
    ).not.toBeInTheDocument()
  );
});
it("hides identity approval from ordinary staff", () => {
  actor.is_superuser = false;
  mount();
  expect(
    screen.queryByRole("region", { name: "Account setup" })
  ).not.toBeInTheDocument();
});
