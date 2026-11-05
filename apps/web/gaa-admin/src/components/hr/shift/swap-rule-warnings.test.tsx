import { configureApiClient } from "@barrelsgd/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SwapRuleWarnings } from "./swap-rule-warnings";

const BASE = "http://localhost";
const SWAP = "44444444-4444-4444-8444-444444444444";
const URL = `${BASE}/api/v1/hr/shift-swaps/${SWAP}/rule-check`;
const REGION = { name: "Exchange rule warnings" };

const server = setupServer();
beforeAll(() => {
  configureApiClient({ baseURL: BASE });
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWarnings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SwapRuleWarnings swapId={SWAP} />
    </QueryClientProvider>
  );
}

describe("SwapRuleWarnings", () => {
  it("lists the breaches the exchange would introduce", async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          shift_swap_id: SWAP,
          rules: { department_id: "dept_met" },
          count: 1,
          violations: [
            {
              code: "SHORT_NOTICE",
              user_id: "u1",
              start_date: "2026-07-07",
              end_date: "2026-07-07",
              observed: "2",
              limit: "7",
              detail: "Published roster changed with 2 days notice; 7 required",
            },
          ],
        })
      )
    );
    renderWarnings();
    const region = await screen.findByRole("region", REGION);
    expect(region).toHaveTextContent("would breach 1 roster rule");
    expect(region).toHaveTextContent("Less than the required notice");
  });

  it("says so when there are no breaches", async () => {
    let called = false;
    server.use(
      http.get(URL, () => {
        called = true;
        return HttpResponse.json({
          shift_swap_id: SWAP,
          rules: { department_id: "dept_met" },
          count: 0,
          violations: [],
        });
      })
    );
    renderWarnings();
    await waitFor(() => expect(called).toBe(true));
    expect(screen.queryByRole("region", REGION)).not.toBeInTheDocument();
    expect(
      await screen.findByText("No roster rule breaches from this exchange.")
    ).toBeInTheDocument();
  });

  it("renders nothing when the viewer may not see the check", async () => {
    let called = false;
    server.use(
      http.get(URL, () => {
        called = true;
        return HttpResponse.json({ detail: "no" }, { status: 403 });
      })
    );
    renderWarnings();
    await waitFor(() => expect(called).toBe(true));
    expect(screen.queryByRole("region", REGION)).not.toBeInTheDocument();
  });
});
