import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => ({ is_superuser: true }),
}));
vi.mock("./account-activation", () => ({
  AccountActivation: () => <p>Activation controls</p>,
}));
vi.mock("./cms-access-control", () => ({
  CmsAccessControl: () => <p>CMS controls</p>,
}));

import { CreateAccountDialog } from "./create-account-dialog";

let submitted: unknown;
const server = setupServer(
  http.post(
    "http://localhost/api/v1/auth/onboarding/accounts",
    async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json(
        {
          id: "staff-id",
          first_name: "New",
          last_name: "Staff",
          email: "new@example.com",
          username: "newstaff",
          full_name: "New Staff",
          is_active: true,
          is_superuser: false,
          created_at: "2026-10-07T00:00:00Z",
          updated_at: "2026-10-07T00:00:00Z",
        },
        { status: 201 }
      );
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
});
afterAll(() => server.close());
it("creates a work identity without an administrator choosing a password, then offers access and activation", async () => {
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreateAccountDialog onCreated={onCreated} />
    </QueryClientProvider>
  );
  fireEvent.click(
    screen.getByRole("button", { name: "New account without email" })
  );
  for (const [label, value] of [
    ["First name", "New"],
    ["Last name", "Staff"],
    ["Username", "newstaff"],
    ["Work email address", "new@example.com"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("Activation controls")).toBeInTheDocument();
  expect(screen.getByText("CMS controls")).toBeInTheDocument();
  expect(onCreated).toHaveBeenCalledOnce();
  expect(submitted).toEqual({
    first_name: "New",
    last_name: "Staff",
    username: "newstaff",
    email: "new@example.com",
  });
});
