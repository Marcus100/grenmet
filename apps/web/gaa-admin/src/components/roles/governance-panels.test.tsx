import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AccessReviewsPanel } from "./access-reviews-panel";
import { OrganisationPanel } from "./organisation-panel";
import { PermissionSetsPanel } from "./permission-sets-panel";
import { WorkflowPanel } from "./workflow-panel";

const base = "http://localhost";
const role = {
  id: "role-1",
  name: "management",
  permission_keys: ["workflow.instance.action"],
};
const workflow = {
  template: {
    id: "template-1",
    name: "Leave request",
    department_id: "gms",
    workflow_type: "LEAVE_REQUEST",
    is_active: true,
  },
  allow_self_approval: false,
  require_distinct_approvers: true,
  steps: [
    {
      id: "step-1",
      workflow_template_id: "template-1",
      step_order: 1,
      required_role_id: "role-1",
      required_user_id: null,
      label: "Manager review",
      purpose: "REVIEW",
      required_scope: "DEPARTMENT",
      is_required: true,
    },
  ],
};
const server = setupServer(
  http.get(`${base}/api/v1/hr/setup/roles`, () => HttpResponse.json([role])),
  http.get(`${base}/api/v1/hr/setup/workflows`, () =>
    HttpResponse.json([workflow])
  ),
  http.get(`${base}/api/v1/auth/users`, () =>
    HttpResponse.json({
      data: [{ id: "user-1", full_name: "HR Recorder", is_active: true }],
      count: 1,
    })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: base });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function show(component: React.ReactNode) {
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
      {component}
    </QueryClientProvider>
  );
}
describe("Governance panels", () => {
  it("saves an explicitly configured non-blocking named recording stage", async () => {
    let saved: unknown;
    server.use(
      http.put(
        `${base}/api/v1/hr/setup/workflows/template-1`,
        async ({ request }) => {
          saved = await request.json();
          return HttpResponse.json(workflow);
        }
      )
    );
    show(<WorkflowPanel />);
    await screen.findByText("gms · Leave request");
    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));
    fireEvent.change(screen.getByLabelText("Stage 2 assignee"), {
      target: { value: "user:user-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));
    await waitFor(() =>
      expect(saved).toMatchObject({
        allow_self_approval: false,
        require_distinct_approvers: true,
        steps: [
          { purpose: "REVIEW", is_required: true },
          {
            purpose: "RECORDING",
            required_user_id: "user-1",
            required_role_id: null,
            is_required: false,
          },
        ],
      })
    );
  });
  it("requires a reason before revoking access", async () => {
    let saved: unknown;
    server.use(
      http.get(`${base}/api/v1/auth/access-reviews`, () =>
        HttpResponse.json({
          assignments: [
            {
              id: "grant-1",
              user_id: "user-1",
              name: "Test Person",
              role: "management",
              scope: "DEPARTMENT",
              department_id: "gms",
              effective_from: "2026-01-01",
              effective_to: null,
              permissions: ["workflow.instance.action"],
              is_superuser: false,
            },
          ],
          reviews: [],
          superusers: [],
        })
      ),
      http.post(
        `${base}/api/v1/auth/access-reviews/grant-1`,
        async ({ request }) => {
          saved = await request.json();
          return HttpResponse.json({ id: "review-1" });
        }
      )
    );
    show(<AccessReviewsPanel />);
    const revoke = await screen.findByRole("button", {
      name: "Revoke",
      hidden: true,
    });
    expect(revoke).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText("Review reason for Test Person management"),
      { target: { value: "No longer required" } }
    );
    fireEvent.click(revoke);
    await waitFor(() =>
      expect(saved).toEqual({
        decision: "REVOKE",
        reason: "No longer required",
      })
    );
  });
  it("blocks conflicting imports and displays uncertain counts", async () => {
    server.use(
      http.get(`${base}/api/v1/hr/setup/organisation`, () =>
        HttpResponse.json({
          catalogue: {
            units: [
              {
                id: "gms",
                name: "Meteorology",
                parent_id: null,
                source_slide: 15,
              },
            ],
            positions: [
              {
                id: "GMS_CADET",
                unit_id: "gms",
                title: "Cadet",
                authorised_posts: null,
                reported_vacancies: 1,
                notes: "Confirm count",
                source_slide: 15,
              },
            ],
            notes: [],
          },
          missing_positions: ["GMS_CADET"],
          conflicts: ["Existing unit differs"],
        })
      )
    );
    show(<OrganisationPanel />);
    expect(
      await screen.findByRole("button", { name: "Import missing structure" })
    ).toBeDisabled();
    expect(screen.getByText("Unconfirmed")).toBeInTheDocument();
    expect(screen.getByText("Existing unit differs")).toBeInTheDocument();
  });
  it("edits a permission bundle explicitly", async () => {
    let saved: unknown;
    server.use(
      http.get(`${base}/api/v1/auth/permissions`, () =>
        HttpResponse.json({
          data: [
            { key: "workflow.instance.action", description: "Act" },
            { key: "workflow.instance.view", description: "View" },
          ],
          count: 2,
        })
      ),
      http.put(`${base}/api/v1/hr/setup/roles/role-1`, async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json(role);
      })
    );
    show(<PermissionSetsPanel />);
    await screen.findByText("management · 1 permissions");
    fireEvent.click(screen.getByLabelText("workflow.instance.viewView"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save management permissions",
        hidden: true,
      })
    );
    await waitFor(() =>
      expect(saved).toEqual({
        permission_keys: ["workflow.instance.action", "workflow.instance.view"],
      })
    );
  });
});
