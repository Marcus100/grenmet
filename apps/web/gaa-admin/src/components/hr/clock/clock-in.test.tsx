import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ClockIn } from "./clock-in";

const BASE = "http://localhost";
const CLOCK_URL = `${BASE}/api/v1/hr/attendance/clock`;
const BUTTON = { name: "Clock in or out" };
const ATTENDANCE = {
  roster_assignment_id: "a1",
  user_id: "u1",
  employee_name: "Gerad Tamar",
  department_id: "dept_met",
  shift_date: "2026-07-06",
  shift_code: "M",
  scheduled_start: "2026-07-06T09:30:00Z",
  scheduled_end: "2026-07-06T18:00:00Z",
  arrived_at: "2026-07-06T09:40:00Z",
  departed_at: null,
};

const PUNCH = {
  id: "p1",
  user_id: "u1",
  department_id: "dept_met",
  roster_assignment_id: "a1",
  kind: "ARRIVE",
  punched_at: "2026-07-06T09:40:00Z",
  status: "PENDING",
  reviewed_by_user_id: null,
  reviewed_at: null,
  review_note: null,
};

let sentBody: unknown;
const server = setupServer(
  http.post(CLOCK_URL, async ({ request }) => {
    sentBody = await request.json();
    return HttpResponse.json({
      action: "ARRIVED",
      site_name: "Main gate",
      attendance: ATTENDANCE,
      punch: PUNCH,
      late_minutes: 10,
      early_departure_minutes: 0,
      overtime_minutes: 0,
    });
  })
);

beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  sentBody = undefined;
});
afterAll(() => server.close());

function renderClock(initialCode?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClockIn initialCode={initialCode} />
    </QueryClientProvider>
  );
}

describe("ClockIn", () => {
  it("sends the scanned code and shows a pending arrival as sent for approval", async () => {
    renderClock("scanned-code-123");
    expect(screen.queryByLabelText("Clock point code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(sentBody).toEqual({ token: "scanned-code-123" });
    expect(result).toHaveTextContent("Arrival sent for approval");
    expect(result).not.toHaveTextContent("Arrival recorded");
    expect(result).toHaveTextContent("supervisor needs to approve");
    expect(result).toHaveTextContent("Main gate");
    expect(result).toHaveTextContent("10 min after the shift start");
  });

  it("shows an approved punch as recorded", async () => {
    server.use(
      http.post(CLOCK_URL, () =>
        HttpResponse.json({
          action: "ARRIVED",
          site_name: "Main gate",
          attendance: ATTENDANCE,
          punch: { ...PUNCH, status: "APPROVED" },
        })
      )
    );
    renderClock("scanned-code-123");
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(result).toHaveTextContent("Arrival recorded");
    expect(result).not.toHaveTextContent("supervisor needs to approve");
  });

  it("shows a rejected punch with its reason", async () => {
    server.use(
      http.post(CLOCK_URL, () =>
        HttpResponse.json({
          action: "DEPARTED",
          site_name: "Main gate",
          attendance: ATTENDANCE,
          punch: {
            ...PUNCH,
            kind: "DEPART",
            status: "REJECTED",
            review_note: "Wrong site",
          },
        })
      )
    );
    renderClock("scanned-code-123");
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(result).toHaveTextContent("Departure rejected");
    expect(result).toHaveTextContent("Reason: Wrong site");
  });

  it("falls back to a neutral headline without a punch", async () => {
    server.use(
      http.post(CLOCK_URL, () =>
        HttpResponse.json({
          action: "ARRIVED",
          site_name: "Main gate",
          attendance: ATTENDANCE,
        })
      )
    );
    renderClock("scanned-code-123");
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(result).toHaveTextContent("Arrival received");
    expect(result).not.toHaveTextContent("undefined");
  });

  it("falls back to a neutral headline for an unknown status", async () => {
    server.use(
      http.post(CLOCK_URL, () =>
        HttpResponse.json({
          action: "DEPARTED",
          site_name: "Main gate",
          attendance: ATTENDANCE,
          punch: { ...PUNCH, status: "ON_HOLD" },
        })
      )
    );
    renderClock("scanned-code-123");
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(result).toHaveTextContent("Departure received");
  });

  it("asks for a typed code when none was scanned and blocks short codes", () => {
    renderClock();
    const button = screen.getByRole("button", BUTTON);
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Clock point code"), {
      target: { value: "typed-code-456" },
    });
    expect(button).toBeEnabled();
  });

  it("explains a missing rostered shift", async () => {
    server.use(
      http.post(CLOCK_URL, () =>
        HttpResponse.json({ detail: "none" }, { status: 409 })
      )
    );
    renderClock("scanned-code-123");
    fireEvent.click(screen.getByRole("button", BUTTON));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no rostered shift"
    );
  });
});
