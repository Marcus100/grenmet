import { configureApiClient } from "@barrelsgd/api-client";
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
import { AttendanceReview } from "./attendance-review";
import { AttendanceTimesheet, localDateTime } from "./attendance-timesheet";

vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
const BASE = "http://localhost";
const EMPLOYEE_SHIFT = /2026-09-26 · N · Test Employee/;
const WEEK_LABEL = /Sunday 2026-09-20 to Saturday 2026-09-26/;
const SCHEDULE_LABEL = /Scheduled 2026-09-26 22:00 to 2026-09-27 06:00/;
const PDF_LABEL = /weekly Python PDF/i;
const GRENADA_OFFSET = /-04:00$/;
const SHIFT_LABEL = /2026-09-26 · N/;
const ACTUAL_HOURS_LABEL = /Elapsed 8.00 h; break 30 min; recorded work 7.50 h/;
const APPROVED_ABSENCE_LABEL = /absent · approved schedule exception/;
const SHIFT = {
  roster_assignment_id: "assignment-1",
  user_id: "employee-1",
  employee_name: "Test Employee",
  department_id: "gms",
  shift_date: "2026-09-26",
  shift_code: "N",
  scheduled_start: "2026-09-27T02:00:00Z",
  scheduled_end: "2026-09-27T10:00:00Z",
  attendance_id: null,
  arrived_at: null,
  departed_at: null,
  break_minutes: 0,
  actual_hours: null,
  elapsed_hours: null,
  revision: 0,
  notes: null,
  workflow_instance_id: null,
  review_status: null,
};
const WEEK = {
  period_start: "2026-09-20",
  period_end: "2026-09-26",
  shifts: [SHIFT],
  approved_hours: "0.00",
  recorded_hours: "0.00",
};
const server = setupServer(
  http.get(`${BASE}/api/v1/hr/attendance/week`, () => HttpResponse.json(WEEK))
);
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function renderUi(children = <AttendanceTimesheet />) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe("AttendanceTimesheet", () => {
  it("shows approved absence without inventing actual attendance", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/attendance/week`, () =>
        HttpResponse.json({
          ...WEEK,
          shifts: [{ ...SHIFT, availability: "ABSENT" }],
        })
      )
    );
    renderUi();
    expect(await screen.findByText(APPROVED_ABSENCE_LABEL)).toBeInTheDocument();
    expect(screen.getByLabelText("Arrival")).toHaveValue("");
    expect(screen.getByLabelText("Departure")).toHaveValue("");
    expect(screen.getByText(SCHEDULE_LABEL)).toBeInTheDocument();
  });

  it("shows published schedule without inventing arrival and keeps Saturday night in its week", async () => {
    renderUi();
    expect(await screen.findByText(EMPLOYEE_SHIFT)).toBeInTheDocument();
    expect(screen.getByLabelText("Arrival")).toHaveValue("");
    expect(screen.getByLabelText("Departure")).toHaveValue("");
    expect(screen.getByText(WEEK_LABEL)).toBeInTheDocument();
    expect(screen.getByText(SCHEDULE_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: PDF_LABEL })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/v1/hr/attendance/week/pdf?day=")
    );
  });

  it("marks arrival now and immediately saves it with Grenada timezone", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.put(`${BASE}/api/v1/hr/attendance`, async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        return HttpResponse.json({
          ...SHIFT,
          attendance_id: "attendance-1",
          revision: 1,
        });
      })
    );
    renderUi();
    await userEvent.click(
      await screen.findByRole("button", { name: "Mark arrival now" })
    );
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      roster_assignment_id: "assignment-1",
      expected_revision: 0,
      arrived_at: expect.stringMatching(GRENADA_OFFSET),
      departed_at: null,
    });
  });

  it("saves completed shift then submits the returned revision for supervisor review", async () => {
    const saved: unknown[] = [];
    const submitted: unknown[] = [];
    server.use(
      http.put(`${BASE}/api/v1/hr/attendance`, async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({
          ...SHIFT,
          attendance_id: "attendance-1",
          revision: 1,
        });
      }),
      http.post(
        `${BASE}/api/v1/hr/attendance/attendance-1/submit`,
        async ({ request }) => {
          submitted.push(await request.json());
          return HttpResponse.json({
            ...SHIFT,
            attendance_id: "attendance-1",
            revision: 1,
            review_status: "PENDING",
          });
        }
      )
    );
    renderUi();
    await screen.findByText(SHIFT_LABEL);
    fireEvent.change(screen.getByLabelText("Arrival"), {
      target: { value: "2026-09-26T22:00" },
    });
    fireEvent.change(screen.getByLabelText("Departure"), {
      target: { value: "2026-09-27T06:00" },
    });
    fireEvent.change(screen.getByLabelText("Break minutes"), {
      target: { value: "30" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Submit shift for review" })
    );
    await waitFor(() => expect(submitted).toEqual([{ expected_revision: 1 }]));
    expect(saved[0]).toMatchObject({
      arrived_at: "2026-09-26T22:00:00-04:00",
      departed_at: "2026-09-27T06:00:00-04:00",
      break_minutes: 30,
    });
  });

  it("shows server validation detail", async () => {
    server.use(
      http.put(`${BASE}/api/v1/hr/attendance`, () =>
        HttpResponse.json(
          { detail: "Departure must follow arrival within 24 hours" },
          { status: 400 }
        )
      )
    );
    renderUi();
    await screen.findByText(SHIFT_LABEL);
    fireEvent.change(screen.getByLabelText("Arrival"), {
      target: { value: "2026-09-26T22:00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save attendance" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Departure must follow arrival within 24 hours"
    );
  });

  it("requires a correction reason and preserves approved time until supervisor review", async () => {
    const correctionBodies: unknown[] = [];
    server.use(
      http.get(`${BASE}/api/v1/hr/attendance/week`, () =>
        HttpResponse.json({
          ...WEEK,
          shifts: [
            {
              ...SHIFT,
              attendance_id: "attendance-1",
              arrived_at: "2026-09-27T02:00:00Z",
              departed_at: "2026-09-27T10:00:00Z",
              revision: 1,
              review_status: "APPROVED",
            },
          ],
        })
      ),
      http.post(
        `${BASE}/api/v1/hr/attendance/attendance-1/corrections`,
        async ({ request }) => {
          correctionBodies.push(await request.json());
          return HttpResponse.json({ id: "correction-1" });
        }
      )
    );
    renderUi();
    await userEvent.click(
      await screen.findByRole("button", { name: "Propose time correction" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send correction for review" })
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Explain why");
    fireEvent.change(screen.getByLabelText("Departure"), {
      target: { value: "2026-09-27T05:30" },
    });
    await userEvent.type(
      screen.getByLabelText("Correction reason"),
      "Forgot to mark departure"
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Send correction for review" })
    );
    await waitFor(() => expect(correctionBodies).toHaveLength(1));
    expect(correctionBodies[0]).toMatchObject({
      reason: "Forgot to mark departure",
      expected_revision: 1,
      departed_at: "2026-09-27T05:30:00-04:00",
    });
  });

  it("loads actual attendance and correction reason on supervisor review disclosure", async () => {
    server.use(
      http.get(`${BASE}/api/v1/hr/attendance/review`, () =>
        HttpResponse.json({
          current: {
            ...SHIFT,
            arrived_at: "2026-09-27T02:00:00Z",
            departed_at: "2026-09-27T10:00:00Z",
            break_minutes: 30,
            elapsed_hours: "8.00",
            actual_hours: "7.50",
          },
          corrections: [
            {
              id: "correction-1",
              arrived_at: "2026-09-27T02:00:00Z",
              departed_at: "2026-09-27T09:30:00Z",
              break_minutes: 30,
              reason: "Forgot to mark departure",
              review_status: "PENDING",
            },
          ],
        })
      )
    );
    renderUi(<AttendanceReview correction entityId="correction-1" />);
    await userEvent.click(
      screen.getByRole("button", { name: "Review attendance details" })
    );
    expect(
      await screen.findByText("Reason: Forgot to mark departure")
    ).toBeInTheDocument();
    expect(screen.getByText(ACTUAL_HOURS_LABEL)).toBeInTheDocument();
  });

  it("formats UTC punches in Grenada rather than the browser timezone", () => {
    expect(localDateTime("2026-09-27T02:00:00Z")).toBe("2026-09-26T22:00");
  });
});
