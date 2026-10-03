import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { catalogue, grants, staffList } from "@/lib/janitorial/test-fixtures";
import { groupGrants, StaffManager } from "./staff-manager";

const BASE = "http://localhost";
let received: unknown;
let revoked: string | undefined;
const server = setupServer(
  http.post(`${BASE}/api/v1/janitorial/staff`, async ({ request }) => {
    received = await request.json();
    return HttpResponse.json(staffList.staff[0], { status: 201 });
  }),
  http.post(`${BASE}/api/v1/janitorial/grants/:id/revoke`, ({ params }) => {
    revoked = String(params.id);
    return new HttpResponse(null, { status: 204 });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterAll(() => server.close());
afterEach(() => {
  received = undefined;
  revoked = undefined;
});

function renderManager() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <StaffManager
        buildings={catalogue.buildings}
        canManageScope
        canManageStaff
        contractors={staffList.contractors}
        grants={grants}
        staff={staffList.staff}
      />
    </QueryClientProvider>
  );
}

describe("groupGrants", () => {
  it("groups grants per person", () => {
    const [holder] = groupGrants([
      ...grants,
      { ...grants[0], id: "g2", buildingId: 1 } as (typeof grants)[number],
    ]);
    expect(holder?.name).toBe("Sam Supervisor");
    expect(holder?.grants.map((grant) => grant.buildingId)).toEqual([3, 1]);
  });
});

describe("StaffManager", () => {
  it("adds a staff member by Barrels Login email", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Add staff member" }));
    fireEvent.change(screen.getByLabelText("Barrels Login email"), {
      target: { value: "new@cleanco.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Badge no."), {
      target: { value: "C-020" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(received).toEqual({
        email: "new@cleanco.example.com",
        contractorId: staffList.contractors[0]?.id,
        role: "cleaner",
        badgeNo: "C-020",
      })
    );
  });

  it("revokes a building grant", async () => {
    renderManager();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Control Tower from Sam Supervisor",
      })
    );

    await waitFor(() => expect(revoked).toBe(grants[0]?.id));
    expect(router.refresh).toHaveBeenCalled();
  });
});
