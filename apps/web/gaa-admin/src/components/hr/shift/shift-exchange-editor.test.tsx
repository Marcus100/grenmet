import { configureApiClient } from "@barrelsgd/api-client";
import { SessionUserProvider } from "@barrelsgd/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { ShiftExchangeEditor } from "./shift-exchange-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.params),
}));

const navigation = vi.hoisted(() => ({ params: "" }));

const BASE = "http://localhost";
const SUBMIT_LABEL = "Sign & submit";
const AGREEMENT_TEXT = /The other employee must agree first/;

const PROFILE = {
  id: "99999999-9999-4999-8999-999999999999",
  employment: {
    department: { id: "dept_met", name: "Meteorological Department" },
  },
};

const MEMBERS = {
  data: [
    {
      user_id: "11111111-1111-4111-8111-111111111111",
      first_name: "Gerad",
      last_name: "Tamar",
      employee_number: "E001",
      position: "Manager",
      employment_status: "ACTIVE",
    },
    {
      user_id: "22222222-2222-4222-8222-222222222222",
      first_name: "Jill",
      last_name: "Charles",
      employee_number: "E002",
      position: "Observer",
      employment_status: "ACTIVE",
    },
  ],
  count: 2,
};

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (day: number) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`;

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/rosters/assignments`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.post(
    `${BASE}/api/v1/hr/shift-swaps/preview-pdf`,
    () =>
      new HttpResponse(new Uint8Array([37, 80, 68, 70]), {
        headers: { "Content-Type": "application/pdf" },
      })
  ),
  http.get(`${BASE}/api/v1/hr/signature/me`, () =>
    HttpResponse.json({
      version: "11111111-1111-4111-8111-111111111111",
      image_data_url: "data:image/png;base64,aGVsbG8=",
      updated_at: "2026-09-11T12:00:00Z",
    })
  ),
  http.get(`${BASE}/api/v1/hr/profile/me`, () => HttpResponse.json(PROFILE)),
  http.get(`${BASE}/api/v1/hr/departments/dept_met/members`, () =>
    HttpResponse.json(MEMBERS)
  ),
  http.get(`${BASE}/api/v1/hr/departments/:departmentId/members`, () =>
    HttpResponse.json({ data: [], count: 0 })
  ),
  http.get(`${BASE}/api/v1/hr/shift-swaps/me`, () =>
    HttpResponse.json({ data: [], count: 0 })
  )
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  navigation.params = "";
});
afterAll(() => server.close());

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionUserProvider
        user={{
          id: "u-1",
          email: "tester@barrels.gd",
          full_name: "Tester",
          is_active: true,
          is_superuser: false,
        }}
      >
        <ShiftExchangeEditor />
      </SessionUserProvider>
    </QueryClientProvider>
  );
}

async function pickDate(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  day: number
) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByText(String(day)));
}

describe("ShiftExchangeEditor (wired)", () => {
  it("reopens persisted identity and shift fields and shows the mandatory agreement", async () => {
    navigation.params = "draft=33333333-3333-4333-8333-333333333333";
    server.use(
      http.get(`${BASE}/api/v1/hr/shift-swaps/me`, () =>
        HttpResponse.json({
          data: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              requesting_user_id: PROFILE.id,
              counterpart_user_id: MEMBERS.data[1].user_id,
              department_id: "dept_met",
              swap_type: "TEMPORARY",
              source_date: "2026-09-26",
              source_shift_code: "N",
              target_date: "2026-09-28",
              target_shift_code: "M",
              reason: "Saved reason",
              status: "DRAFT",
              counterpart_agreed: false,
            },
          ],
          count: 1,
        })
      )
    );
    renderEditor();
    await waitFor(() =>
      expect(
        screen.getByLabelText("Employee With Whom Change Is Desired")
      ).toHaveValue("Jill Charles")
    );
    expect(screen.getByLabelText("Employee Requesting Change")).toHaveValue(
      "Tester"
    );
    expect(screen.getByLabelText("Department")).toHaveValue(
      "Meteorological Department"
    );
    expect(screen.getByLabelText("Shift Requested for Change")).toHaveValue(
      "N"
    );
    expect(screen.getByLabelText("Return Shift")).toHaveValue("M");
    expect(screen.getByLabelText("Reason(s) for Request")).toHaveValue(
      "Saved reason"
    );
    expect(screen.getByText(AGREEMENT_TEXT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Employee Requesting Change")).toHaveValue(
        "Tester"
      )
    );
    expect(screen.getByLabelText("Department")).toHaveValue(
      "Meteorological Department"
    );
    expect(screen.getByLabelText("Reason(s) for Request")).toHaveValue("");
  });

  it("prefills the published own shift without replacing a saved selection", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/rosters/assignments`, () =>
        HttpResponse.json({
          data: [
            {
              category: "WORK",
              shift_code: "N",
              is_draft: false,
            },
          ],
          count: 1,
        })
      )
    );
    renderEditor();
    await waitFor(() =>
      expect(screen.getByLabelText("Shift Requested for Change")).toHaveValue(
        "N"
      )
    );
  });

  it("submits a shift swap with the selected counterpart, dates, and shift codes", async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/api/v1/hr/shift-swaps`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            id: "33333333-3333-4333-8333-333333333333",
            requesting_user_id: PROFILE.id,
            counterpart_user_id: MEMBERS.data[1].user_id,
            department_id: "dept_met",
            swap_type: "TEMPORARY",
            source_date: isoDay(15),
            source_shift_code: "M",
            target_date: isoDay(16),
            target_shift_code: "E",
            reason: "Family commitment",
            counterpart_agreed: false,
            status: "SUBMITTED",
            created_at: "2026-07-04T12:00:00+0000",
            updated_at: "2026-07-04T12:00:00+0000",
          },
          { status: 201 }
        );
      })
    );

    const user = userEvent.setup();
    renderEditor();

    // Wait for profile → members to load, then pick the counterpart.
    const memberOption = await screen.findByRole("option", {
      name: "Jill Charles",
    });
    const select = screen.getByLabelText("Exchange With (Department Member)");
    fireEvent.change(select, {
      target: { value: MEMBERS.data[1].user_id },
    });
    expect(memberOption).toBeInTheDocument();

    // The picker mirrors the counterpart's name into the printable field.
    expect(
      screen.getByLabelText("Employee With Whom Change Is Desired")
    ).toHaveValue("Jill Charles");

    await pickDate(user, "Date Requested for Change", 15);
    fireEvent.change(screen.getByLabelText("Shift Requested for Change"), {
      target: { value: "M" },
    });

    await pickDate(user, "Date of Return Shift", 16);
    fireEvent.change(screen.getByLabelText("Return Shift"), {
      target: { value: "E" },
    });

    fireEvent.change(screen.getByLabelText("Reason(s) for Request"), {
      target: { value: "Family commitment" },
    });

    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    await waitFor(() => {
      expect(posted).toBeTruthy();
    });
    expect(posted).toEqual({
      counterpart_user_id: MEMBERS.data[1].user_id,
      department_id: "dept_met",
      swap_type: "TEMPORARY",
      source_date: isoDay(15),
      source_shift_code: "M",
      target_date: isoDay(16),
      target_shift_code: "E",
      reason: "Family commitment",
      as_draft: false,
      signature_version: "11111111-1111-4111-8111-111111111111",
      co_approver_user_ids: [],
    });
  }, 20_000);

  it("does not post when no counterpart is selected", async () => {
    let postCount = 0;
    server.use(
      http.post(`${BASE}/api/v1/hr/shift-swaps`, () => {
        postCount += 1;
        return HttpResponse.json({}, { status: 201 });
      })
    );

    renderEditor();
    await screen.findByRole("option", { name: "Jill Charles" });

    fireEvent.click(screen.getByRole("button", { name: SUBMIT_LABEL }));

    // Give any accidental request a tick to fire, then confirm none did.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: SUBMIT_LABEL })
      ).not.toBeDisabled();
    });
    expect(postCount).toBe(0);
  }, 20_000);
});
