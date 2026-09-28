import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { ParkingApplication } from "./parking-application";

const USER = "00000000-0000-0000-0000-000000000001";
const ID = "00000000-0000-0000-0000-000000000002";
const BASE = "http://localhost/api/v1/hr";
vi.mock("@barrelsgd/auth", () => ({
  useSessionUser: () => ({ id: USER, full_name: "Jane Employee" }),
}));
vi.mock("@/components/hr/hr-pdf-preview", () => ({
  HrPdfPreview: () => <div>Python preview</div>,
  downloadHrPdf: vi.fn(),
}));
vi.mock("@/components/hr/co-approver-picker", () => ({
  CoApproverPicker: () => null,
}));
vi.mock("@/components/hr/signatures/signing-panel", () => ({
  SigningPanel: () => null,
}));
const record = {
  id: ID,
  user_id: USER,
  department_id: "met",
  submitted_by_user_id: USER,
  vehicle_registration_no: "P1234",
  company_name: "GAA",
  phone: "473-555-1000",
  vehicle_insurance_issue_date: "2026-01-01",
  vehicle_insurance_expiry_date: "2027-01-01",
  action_requested: "NEW_PERMIT",
  fee_amount: "40.00",
  status: "DRAFT",
  created_at: "2026-09-28T08:00:00Z",
  signed_document_id: null,
};
const server = setupServer(
  http.get(`${BASE}/profile/me`, () =>
    HttpResponse.json({
      employment: {
        department: { id: "met", name: "Meteorology", organisation_id: "gaa" },
      },
      identity: { phone: "473-555-0000" },
      permissions: [
        "parking.permit.create",
        "parking.permit.issue",
        "parking.permit.read.department",
      ],
    })
  ),
  http.get(`${BASE}/signature/me`, () =>
    HttpResponse.json({
      version: ID,
      image_data_url: "data:image/png;base64,x",
    })
  ),
  http.get(`${BASE}/parking-permits`, () =>
    HttpResponse.json({ data: [record], count: 1 })
  )
);
beforeAll(() => {
  configureApiClient({ baseURL: "http://localhost" });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ParkingApplication />
    </QueryClientProvider>
  );
}

it("prefills HR identity, reopens saved fields and signs after saving the draft", async () => {
  let saved: unknown;
  let consent: unknown;
  server.use(
    http.patch(`${BASE}/parking-permits/${ID}`, async ({ request }) => {
      saved = await request.json();
      return HttpResponse.json(record);
    }),
    http.post(`${BASE}/parking-permits/${ID}/submit`, async ({ request }) => {
      consent = await request.json();
      return HttpResponse.json({
        ...record,
        status: "SUBMITTED",
        signed_document_id: ID,
      });
    })
  );
  show();
  expect(await screen.findByLabelText("Employee")).toHaveValue("Jane Employee");
  expect(screen.getByLabelText("Company name")).toHaveValue(
    "Grenada Airports Authority"
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open draft" }));
  expect(screen.getByLabelText("Phone")).toHaveValue(record.phone);
  expect(screen.getByLabelText("Insurance expiry date")).toHaveValue(
    record.vehicle_insurance_expiry_date
  );
  fireEvent.change(screen.getByLabelText("Vehicle registration number"), {
    target: { value: "P5678" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign & submit" }));
  await screen.findByText("Signed application submitted for approval.");
  expect(saved).toMatchObject({
    vehicle_registration_no: "P5678",
    user_id: USER,
    department_id: "met",
    as_draft: true,
  });
  expect(consent).toMatchObject({ signature_version: ID });
  expect(screen.getByLabelText("Vehicle registration number")).toBeDisabled();
});

it("renewal starts a new application with previous vehicle and insurance details", async () => {
  show();
  await screen.findByRole("button", { name: "Apply for renewal" });
  fireEvent.click(screen.getByRole("button", { name: "Apply for renewal" }));
  expect(screen.getByLabelText("Action requested")).toHaveValue(
    "ANNUAL_RENEWAL"
  );
  expect(screen.getByLabelText("Vehicle registration number")).toHaveValue(
    "P1234"
  );
  expect(screen.getByLabelText("Phone")).toHaveValue(record.phone);
});

it("shows the application date on the Grenada calendar day", async () => {
  server.use(
    http.get(`${BASE}/parking-permits`, () =>
      HttpResponse.json({
        data: [{ ...record, created_at: "2026-09-28T01:00:00Z" }],
        count: 1,
      })
    )
  );
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Open draft" }));
  expect(screen.getByLabelText("Application date")).toHaveValue("2026-09-27");
});

it("requires Other details and exposes the API validation reason", async () => {
  server.use(
    http.post(`${BASE}/parking-permits`, () =>
      HttpResponse.json(
        { detail: "The employee does not belong to this department" },
        { status: 403 }
      )
    )
  );
  show();
  await screen.findByLabelText("Vehicle registration number");
  fireEvent.change(screen.getByLabelText("Vehicle registration number"), {
    target: { value: "P5678" },
  });
  fireEvent.change(screen.getByLabelText("Action requested"), {
    target: { value: "OTHER" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign & submit" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "explain an Other action"
  );
  fireEvent.change(screen.getByLabelText("Other action details"), {
    target: { value: "Correct driver" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("The employee does not belong to this department");
});

it("shows issuance only for approved permits and sends recorded validity", async () => {
  let issued: unknown;
  server.use(
    http.get(`${BASE}/parking-permits`, () =>
      HttpResponse.json({ data: [{ ...record, status: "APPROVED" }], count: 1 })
    ),
    http.post(`${BASE}/parking-permits/${ID}/issue`, async ({ request }) => {
      issued = await request.json();
      return HttpResponse.json({
        ...record,
        status: "APPROVED",
        issued_at: "2026-09-28T10:00:00Z",
      });
    })
  );
  show();
  const form = await screen.findByRole("form", {
    name: "Issue decal for P1234",
  });
  fireEvent.change(screen.getByLabelText("Decal number"), {
    target: { value: "SEC1" },
  });
  fireEvent.change(screen.getByLabelText("Valid from"), {
    target: { value: "2026-09-28" },
  });
  fireEvent.change(screen.getByLabelText("Valid to"), {
    target: { value: "2027-01-01" },
  });
  fireEvent.submit(form);
  await waitFor(() =>
    expect(issued).toMatchObject({
      decal_number: "SEC1",
      valid_from: "2026-09-28",
      valid_to: "2027-01-01",
    })
  );
});
