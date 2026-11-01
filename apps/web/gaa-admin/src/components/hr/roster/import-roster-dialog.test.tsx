import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { toast } from "sonner";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ImportRosterDialog } from "./import-roster-dialog";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const BASE = "http://localhost";
const OPEN_LABEL = /Import CSV/;
const CHECK_LABEL = /^Check$/;
const IMPORT_LABEL = /^Import$/;
const MATCHED_TEXT = /1\/1 people matched/;

const DEPARTMENTS = {
  data: [{ id: "dept_met", name: "Meteorological Department" }],
  count: 1,
};

const server = setupServer(
  http.get(`${BASE}/api/v1/hr/departments`, () =>
    HttpResponse.json(DEPARTMENTS)
  ),
  http.get(`${BASE}/api/v1/hr/departments/dept_met/members`, () =>
    HttpResponse.json({
      data: [
        {
          user_id: "u1",
          first_name: "Gerad",
          last_name: "Tamar",
          employee_number: "E001",
          employment_status: "ACTIVE",
        },
      ],
      count: 1,
    })
  )
);
beforeEach(() => vi.clearAllMocks());

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportRosterDialog />
    </QueryClientProvider>
  );
}

describe("ImportRosterDialog", () => {
  it("checks a grid, shows the preview, then imports with month bounds", async () => {
    const imported: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/rosters/import-grid/validate`, () =>
        HttpResponse.json({
          total_people: 1,
          matched_people: 1,
          unmatched_names: [],
          total_assignments: 2,
          errors: [],
          can_import: true,
        })
      ),
      http.post(
        `${BASE}/api/v1/hr/rosters/import-grid`,
        async ({ request }) => {
          imported.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json({
            roster_period_id: "00000000-0000-0000-0000-000000000000",
            total_assignments: 2,
            published: false,
          });
        }
      )
    );

    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: OPEN_LABEL }));

    fireEvent.change(await screen.findByLabelText("Month"), {
      target: { value: "2026-07" },
    });
    fireEvent.change(screen.getByLabelText("CSV file"), {
      target: {
        files: [
          new File(["name,1,2\nu_x,M,N\n"], "roster.csv", { type: "text/csv" }),
        ],
      },
    });

    // The file is read asynchronously; Check enables once its text is loaded.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: CHECK_LABEL })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: CHECK_LABEL }));

    expect(await screen.findByText(MATCHED_TEXT)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    await waitFor(() => expect(imported).toHaveLength(1));
    expect(imported[0]).toMatchObject({
      department_id: "dept_met",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
    });
  });

  it("asks for a reason when importing into a published roster breaks a rule", async () => {
    const imported: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/hr/rosters/import-grid/validate`, () =>
        HttpResponse.json({
          total_people: 1,
          matched_people: 1,
          unmatched_names: [],
          total_assignments: 2,
          errors: [],
          can_import: true,
        })
      ),
      http.post(
        `${BASE}/api/v1/hr/rosters/import-grid`,
        async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          imported.push(body);
          if (!body.rule_override_reason)
            return HttpResponse.json(
              {
                detail: "1 roster rule warning: give a reason to save anyway",
                code: "ROSTER_RULE_WARNINGS",
                context: "ROSTER_CHANGE",
                violations: [
                  {
                    code: "SHORT_NOTICE",
                    user_id: "u1",
                    start_date: "2026-07-02",
                    end_date: "2026-07-02",
                    observed: "1",
                    limit: "7",
                    detail:
                      "Published roster changed with 1 day notice; 7 required",
                  },
                ],
              },
              { status: 409 }
            );
          return HttpResponse.json({
            roster_period_id: "00000000-0000-0000-0000-000000000000",
            total_assignments: 2,
            published: false,
          });
        }
      )
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: OPEN_LABEL }));
    fireEvent.change(await screen.findByLabelText("Month"), {
      target: { value: "2026-07" },
    });
    fireEvent.change(screen.getByLabelText("CSV file"), {
      target: {
        files: [
          new File(["name,1,2\nu_x,M,N\n"], "roster.csv", { type: "text/csv" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: CHECK_LABEL })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: CHECK_LABEL }));
    await screen.findByText(MATCHED_TEXT);
    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    const warnings = await screen.findByRole("list", { name: "Rule warnings" });
    expect(warnings).toHaveTextContent("Less than the required notice");
    fireEvent.change(screen.getByLabelText("Reason for saving anyway"), {
      target: { value: "Corrected the paper roster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(imported).toHaveLength(2));
    expect(imported[1]).toMatchObject({
      rule_override_reason: "Corrected the paper roster",
    });
  });

  const GRID_URL = `${BASE}/api/v1/hr/rosters/import-grid`;
  const WARNING_409 = {
    detail: "1 roster rule warning: give a reason to save anyway",
    code: "ROSTER_RULE_WARNINGS",
    context: "ROSTER_CHANGE",
    violations: [
      {
        code: "SHORT_NOTICE",
        user_id: "u1",
        start_date: "2026-07-02",
        end_date: "2026-07-02",
        observed: "1",
        limit: "7",
        detail: "Published roster changed with 1 day notice; 7 required",
      },
    ],
  };

  async function openAndCheck() {
    server.use(
      http.post(`${GRID_URL}/validate`, () =>
        HttpResponse.json({
          total_people: 1,
          matched_people: 1,
          unmatched_names: [],
          total_assignments: 2,
          errors: [],
          can_import: true,
        })
      )
    );
    renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: OPEN_LABEL }));
    fireEvent.change(await screen.findByLabelText("Month"), {
      target: { value: "2026-07" },
    });
    fireEvent.change(screen.getByLabelText("CSV file"), {
      target: {
        files: [
          new File(["name,1,2\nu_x,M,N\n"], "roster.csv", { type: "text/csv" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: CHECK_LABEL })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: CHECK_LABEL }));
    await screen.findByText(MATCHED_TEXT);
  }

  it("shows staff names, not a generic label, on the warnings", async () => {
    server.use(
      http.post(GRID_URL, () => HttpResponse.json(WARNING_409, { status: 409 }))
    );
    await openAndCheck();
    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    const warnings = await screen.findByRole("list", { name: "Rule warnings" });
    await waitFor(() => expect(warnings).toHaveTextContent("G. Tamar"));
    expect(warnings).not.toHaveTextContent("Staff member");
  });

  it("Cancel closes the warning dialog, keeps the import dialog and sends nothing more", async () => {
    let imports = 0;
    server.use(
      http.post(GRID_URL, () => {
        imports += 1;
        return HttpResponse.json(WARNING_409, { status: 409 });
      })
    );
    await openAndCheck();
    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    await screen.findByRole("list", { name: "Rule warnings" });
    const [cancel] = screen.getAllByRole("button", { name: "Cancel" });
    fireEvent.click(cancel as HTMLElement);
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Rule warnings" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Month")).toHaveValue("2026-07");
    expect(screen.getByRole("button", { name: IMPORT_LABEL })).toBeEnabled();
    expect(imports).toBe(1);
  });

  it("a failed resend closes the warning dialog, reports the failure and keeps the reason", async () => {
    server.use(
      http.post(GRID_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return body.rule_override_reason
          ? HttpResponse.json({ detail: "Down" }, { status: 500 })
          : HttpResponse.json(WARNING_409, { status: 409 });
      })
    );
    await openAndCheck();
    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    await screen.findByRole("list", { name: "Rule warnings" });
    fireEvent.change(screen.getByLabelText("Reason for saving anyway"), {
      target: { value: "Corrected the paper roster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "Rule warnings" })
      ).not.toBeInTheDocument()
    );
    expect(toast.error).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
    await screen.findByRole("list", { name: "Rule warnings" });
    expect(screen.getByLabelText("Reason for saving anyway")).toHaveValue(
      "Corrected the paper roster"
    );
  });

  it.each([
    [1, "1 roster rule warning"],
    [3, "3 roster rule warnings"],
  ])(
    "says the import was not published, in one toast (%i)",
    async (count, text) => {
      server.use(
        http.post(GRID_URL, () =>
          HttpResponse.json({
            roster_period_id: "00000000-0000-0000-0000-000000000000",
            total_assignments: 2,
            published: false,
            rule_warning_count: count,
          })
        )
      );
      await openAndCheck();
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: IMPORT_LABEL }));
      await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
      const message = vi.mocked(toast.warning).mock.calls[0]?.[0];
      expect(message).toContain("Not published");
      expect(message).toContain(text);
      if (count === 1) expect(message).not.toContain("warnings");
      expect(toast.success).not.toHaveBeenCalled();
    }
  );
});
