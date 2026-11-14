import { render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
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
import { reportError } from "@/lib/report-error";
import MyBookingsPage from "./page";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    accessToken: "tok-1",
    email: "person@example.com",
    name: null,
    userId: "11111111-1111-4111-8111-111111111111",
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const API = "http://localhost:8000/api/v1/bookings/me/bookings";
const BOOKINGS_BASE = "http://localhost:3015";

/** Ids must be UUIDs: the generated Zod schema checks them. */
function row(id: string, overrides: Record<string, string> = {}) {
  return {
    id: `00000000-0000-4000-8000-${id}`,
    status: "confirmed",
    starts_at: "2030-01-10T14:00:00Z",
    ends_at: "2030-01-10T15:00:00Z",
    service_name: "Bridal makeup",
    business_name: "Babydoll Beauty Bar",
    business_slug: "babydoll",
    ...overrides,
  };
}

function list(data: unknown[], count = data.length, page = 1) {
  return { data, count, page, size: 10 };
}

const server = setupServer();
/** Replies keyed by the `upcoming` query value ("true" or "false"). */
let replies: Record<string, () => Response>;
let requested: URL[] = [];

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  requested = [];
  replies = {
    true: () => HttpResponse.json(list([])),
    false: () => HttpResponse.json(list([])),
  };
  server.use(
    http.get(API, ({ request }) => {
      const url = new URL(request.url);
      requested.push(url);
      const reply = replies[url.searchParams.get("upcoming") ?? ""];
      return reply ? reply() : new HttpResponse(null, { status: 500 });
    })
  );
});
afterEach(() => {
  server.resetHandlers();
  vi.mocked(reportError).mockClear();
});

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await MyBookingsPage({
    searchParams: Promise.resolve(searchParams),
  });
  render(element);
}

describe("My bookings page", () => {
  it("lists upcoming soonest first and past in the order the API gave", async () => {
    replies.true = () =>
      HttpResponse.json(
        list([
          row("000000000001", {
            starts_at: "2030-03-01T14:00:00Z",
            ends_at: "2030-03-01T15:00:00Z",
            business_name: "Later Co",
          }),
          row("000000000002", {
            starts_at: "2030-01-02T14:00:00Z",
            ends_at: "2030-01-02T15:00:00Z",
            business_name: "Sooner Co",
          }),
        ])
      );
    replies.false = () =>
      HttpResponse.json(
        list(
          [
            row("000000000003", { business_name: "Newest Past" }),
            row("000000000004", { business_name: "Older Past" }),
          ],
          2
        )
      );
    await renderPage();

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    const names = within(upcoming)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(names).toEqual(["Sooner Co", "Later Co"]);

    const past = screen.getByRole("region", { name: "Past" });
    const pastNames = within(past)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(pastNames).toEqual(["Newest Past", "Older Past"]);
  });

  it("asks for upcoming with the largest page and past with the page size", async () => {
    await renderPage({ past_page: "2" });
    const upcoming = requested.find(
      (url) => url.searchParams.get("upcoming") === "true"
    );
    const past = requested.find(
      (url) => url.searchParams.get("upcoming") === "false"
    );
    expect(upcoming?.searchParams.get("size")).toBe("1000");
    expect(past?.searchParams.get("size")).toBe("10");
    expect(past?.searchParams.get("page")).toBe("2");
  });

  it("treats a page number that is not a whole number as page 1", async () => {
    await renderPage({ past_page: "banana" });
    const past = requested.find(
      (url) => url.searchParams.get("upcoming") === "false"
    );
    expect(past?.searchParams.get("page")).toBe("1");
  });

  it("shows both empty states in words, never hidden", async () => {
    await renderPage();
    expect(screen.getByText("No upcoming bookings")).toBeInTheDocument();
    expect(screen.getByText("No past bookings")).toBeInTheDocument();
    expect(
      screen.getAllByText("Bookings you make while signed in appear here.")
    ).toHaveLength(2);
  });

  it("says when an empty past page is past the last page", async () => {
    replies.false = () => HttpResponse.json(list([], 25, 9));
    await renderPage({ past_page: "9" });
    expect(
      screen.getByText("No past bookings on this page")
    ).toBeInTheDocument();
  });

  it("pages the past list with Previous and Next links", async () => {
    replies.false = () =>
      HttpResponse.json(
        list([row("000000000003", { business_name: "Page Two Co" })], 25, 2)
      );
    await renderPage({ past_page: "2" });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/bookings"
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/bookings?past_page=3"
    );
  });

  it("shows a failed upcoming load inline, keeps past, and reports a 500", async () => {
    replies.true = () => new HttpResponse(null, { status: 500 });
    replies.false = () =>
      HttpResponse.json(
        list([row("000000000003", { business_name: "Still Here Co" })])
      );
    await renderPage();

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByRole("alert")).toHaveTextContent(
      "Your upcoming bookings could not be loaded just now."
    );
    expect(screen.getByText("Still Here Co")).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      "account-my-bookings"
    );
  });

  it("shows a refused past load inline and does not report a 403", async () => {
    replies.false = () => HttpResponse.json({ detail: "No." }, { status: 403 });
    await renderPage();
    const past = screen.getByRole("region", { name: "Past" });
    expect(within(past).getByRole("alert")).toHaveTextContent(
      "Your past bookings could not be loaded just now."
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("sends a 401 to sign-in with this page as the return target", async () => {
    replies.true = () =>
      HttpResponse.json({ detail: "Gone." }, { status: 401 });
    await expect(renderPage()).rejects.toThrow(
      "REDIRECT /signin?returnTo=%2Fbookings"
    );
    expect(reportError).not.toHaveBeenCalled();
  });

  it("links each business to its page on the bookings site", async () => {
    replies.true = () =>
      HttpResponse.json(
        list([row("000000000005", { business_slug: "babydoll" })])
      );
    await renderPage();
    expect(
      screen.getByRole("link", { name: "Babydoll Beauty Bar" })
    ).toHaveAttribute("href", `${BOOKINGS_BASE}/babydoll`);
  });
});
