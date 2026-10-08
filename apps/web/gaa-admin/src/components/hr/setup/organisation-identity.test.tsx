import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { OrganisationIdentity } from "./organisation-identity";

const actor = vi.hoisted(() => ({ is_superuser: true }));
vi.mock("@barrelsgd/auth", () => ({ useSessionUser: () => actor }));
const BASE = "http://localhost";
const organisations = [
  { id: "gaa", code: "GAA", name: "Grenada Airports Authority" },
  { id: "example", code: "EXAMPLE", name: "Example Employer" },
];
const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  actor.is_superuser = true;
});
function show(value = "") {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <OrganisationIdentity
        onChange={onChange}
        organisations={organisations}
        value={value}
      />
    </QueryClientProvider>
  );
  return onChange;
}
it("selects an explicit employer without inferring it from account email or sector", () => {
  const onChange = show();
  expect(screen.getByLabelText("Employer organisation")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Employer organisation"), {
    target: { value: "example" },
  });
  expect(onChange).toHaveBeenCalledWith("example");
});
it("registers an employer identity and selects its returned ID", async () => {
  const posted: unknown[] = [];
  server.use(
    http.post(`${BASE}/api/v1/hr/organisations`, async ({ request }) => {
      const body = await request.json();
      posted.push(body);
      return HttpResponse.json(body, { status: 201 });
    })
  );
  const onChange = show();
  fireEvent.click(
    screen.getByRole("button", { name: "Register organisation" })
  );
  fireEvent.change(screen.getByLabelText("Organisation name"), {
    target: { value: "Example Employer" },
  });
  fireEvent.change(screen.getByLabelText("Permanent ID"), {
    target: { value: "example_employer" },
  });
  fireEvent.change(screen.getByLabelText("Organisation code"), {
    target: { value: "EXEMP" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save organisation" }));
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith("example_employer")
  );
  expect(posted).toEqual([
    { id: "example_employer", code: "EXEMP", name: "Example Employer" },
  ]);
});
it("renames only the display name, preserving the permanent identity", async () => {
  const posted: unknown[] = [];
  server.use(
    http.patch(`${BASE}/api/v1/hr/organisations/gaa`, async ({ request }) => {
      const body = await request.json();
      posted.push(body);
      return HttpResponse.json({
        ...organisations[0],
        name: "Updated Employer",
      });
    })
  );
  const onChange = show("gaa");
  fireEvent.click(screen.getByRole("button", { name: "Rename organisation" }));
  expect(screen.queryByLabelText("Permanent ID")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Organisation name"), {
    target: { value: "Updated Employer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save organisation" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith("gaa"));
  expect(posted).toEqual([{ name: "Updated Employer" }]);
});
it("keeps employer registration and naming superuser-only", () => {
  actor.is_superuser = false;
  show("gaa");
  expect(
    screen.queryByRole("button", { name: "Register organisation" })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Rename organisation" })
  ).not.toBeInTheDocument();
});

it("keeps a rejected rename open and explains the API validation reason", async () => {
  server.use(
    http.patch(`${BASE}/api/v1/hr/organisations/gaa`, () =>
      HttpResponse.json(
        { detail: "Organisation name is required" },
        { status: 422 }
      )
    )
  );
  const onChange = show("gaa");
  fireEvent.click(screen.getByRole("button", { name: "Rename organisation" }));
  fireEvent.click(screen.getByRole("button", { name: "Save organisation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Organisation name is required"
  );
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Save organisation" })
  ).toBeEnabled();
});
