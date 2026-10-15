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

let sentBody: unknown;
const server = setupServer(
  http.post(CLOCK_URL, async ({ request }) => {
    sentBody = await request.json();
    return HttpResponse.json({
      action: "ARRIVED",
      site_name: "Main gate",
      attendance: ATTENDANCE,
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
  it("sends the scanned code and shows arrival with lateness", async () => {
    renderClock("scanned-code-123");
    expect(screen.queryByLabelText("Clock point code")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", BUTTON));
    const result = await screen.findByRole("region", { name: "Clock result" });
    expect(sentBody).toEqual({ token: "scanned-code-123" });
    expect(result).toHaveTextContent("Arrival recorded");
    expect(result).toHaveTextContent("Main gate");
    expect(result).toHaveTextContent("10 min after the shift start");
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
