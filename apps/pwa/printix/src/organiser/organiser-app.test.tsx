// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganiserApp } from "@/organiser/organiser-app";
import { SESSION_STORAGE_KEY } from "@/organiser/session";
import { SUMMARY } from "@/test/fixtures";
import {
  countCalls,
  json,
  loginBody,
  ORIGIN,
  type Routes,
  routeFetch,
} from "@/test/organiser-fetch";

// Text matchers, kept at top level (they read the same on every screen).
const NO_EVENTS = /No events yet/u;
const NO_ROLE = /has no Printix role yet/u;
const ROLE_ORGANISER = /Your role here: Organiser/u;
const ROLE_GATE_LEAD = /Your role here: Gate lead/u;
const REFRESH_NOTE = /Refreshes every 10 seconds/u;
const EVENTS_SHOWN = /No events yet|Your role here/u;
const HARBOUR_BUTTON = /Harbour Events/u;
const NORTHERN_BUTTON = /Northern Markets/u;
const NIGHT_MARKET_BUTTON = /Harbour Night Market/u;
const CLOSED_LINE = /Grenada time · Closed/u;

const START = "POST /api/v1/auth/apps/printix/email-code/start";
const VERIFY = "POST /api/v1/auth/apps/printix/email-code/verify";
const REFRESH = "POST /api/v1/auth/sessions/refresh";
const LOGOUT = "POST /api/v1/auth/sessions/logout";
const ORGS = "GET /api/v1/printix/me/organisations";
const EVENTS = "GET /api/v1/printix/org/events";
const EVENT_ID = SUMMARY.event.id;
const SUMMARY_ROUTE = `GET /api/v1/printix/org/events/${EVENT_ID}/summary`;

const EMAIL = "organiser@example.test";
const SESSION_TOKEN = "u".repeat(43);

const HARBOUR = {
  id: "2c4e6a8b-1d3f-4a5b-9c7d-0e2f4a6b8c1d",
  name: "Harbour Events",
  can_manage_events: true,
  can_manage_gates: true,
};
const NORTHERN = {
  id: "8d6f4b2a-9e7c-4d5b-8a3f-1c2e4d6b8a0f",
  name: "Northern Markets",
  can_manage_events: false,
  can_manage_gates: true,
};

const ONE_EVENT_PAGE = {
  items: [SUMMARY.event],
  total: 1,
  page: 1,
  size: 50,
};
const EMPTY_PAGE = { items: [], total: 0, page: 1, size: 50 };

/** The routes of a successful sign-in. Tests override what differs. */
function signInRoutes(overrides: Routes = {}): Routes {
  return {
    [START]: () => json(200, { message: "sent" }),
    [VERIFY]: () =>
      json(
        200,
        loginBody({
          sessionToken: SESSION_TOKEN,
          accessToken: "access-ui",
          email: EMAIL,
        })
      ),
    [ORGS]: () => json(200, [HARBOUR, NORTHERN]),
    [EVENTS]: () => json(200, ONE_EVENT_PAGE),
    [SUMMARY_ROUTE]: () => json(200, SUMMARY),
    [REFRESH]: () =>
      json(
        200,
        loginBody({
          sessionToken: "v".repeat(43),
          accessToken: "access-ui",
          email: EMAIL,
        })
      ),
    [LOGOUT]: () => json(200, { message: "signed out" }),
    ...overrides,
  };
}

function storedKeys(storage: Storage): string[] {
  return Array.from(
    { length: storage.length },
    (_, index) => storage.key(index) ?? ""
  );
}

/** Types the address and both codes, and presses the buttons, as a person would. */
async function signIn(code = "123456", authenticatorCode = "654321") {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: EMAIL },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send the code" }));
  await screen.findByLabelText("Code from the email");
  fireEvent.change(screen.getByLabelText("Code from the email"), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText("Code from your authenticator app"), {
    target: { value: authenticatorCode },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("sign-in", () => {
  it("asks for the emailed code and the authenticator code together, then offers the organisations", async () => {
    const spy = routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);

    expect(
      screen.getByRole("heading", { name: "Printix organiser" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your Barrels account.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "First time? Accept your invitation and add an authenticator at account.barrels.gd, then sign in here."
      )
    ).toBeInTheDocument();

    await signIn();
    await screen.findByRole("heading", { name: "Choose an organisation" });

    expect(
      screen.getByRole("button", { name: HARBOUR_BUTTON })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: NORTHERN_BUTTON })
    ).toBeInTheDocument();

    const verifyCall = spy.mock.calls.find(([request]) =>
      request.url.endsWith("/email-code/verify")
    );
    expect(await verifyCall?.[0].json()).toEqual({
      email: EMAIL,
      code: "123456",
      totp_code: "654321",
    });
  });

  it("uses one-time-code autofill and numeric keyboards on both code fields", async () => {
    routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn("", "");
    // The empty submit is refused locally; the fields are still there to fill.
    const emailedField = await screen.findByLabelText("Code from the email");
    const authenticatorField = screen.getByLabelText(
      "Code from your authenticator app"
    );
    for (const field of [emailedField, authenticatorField]) {
      expect(field).toHaveAttribute("autocomplete", "one-time-code");
      expect(field).toHaveAttribute("inputmode", "numeric");
    }
    expect(
      screen.getByText("Enter the 6-digit code from the email.")
    ).toBeInTheDocument();
  });

  it("keeps everything in memory or sessionStorage: nothing is written to localStorage", async () => {
    routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    await screen.findByRole("heading", { name: "Choose an organisation" });

    expect(window.localStorage.length).toBe(0);
    expect(storedKeys(window.sessionStorage)).toEqual([SESSION_STORAGE_KEY]);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      SESSION_TOKEN
    );
  });

  it("says the authenticator code is wrong and clears only that field", async () => {
    routeFetch(
      signInRoutes({
        [VERIFY]: () =>
          json(400, {
            detail: "Two-factor authentication code required or invalid",
          }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That authenticator code is wrong.");
    const authenticatorField = screen.getByLabelText(
      "Code from your authenticator app"
    );
    expect(authenticatorField).toHaveValue("");
    expect(authenticatorField).toHaveFocus();
    expect(screen.getByLabelText("Code from the email")).toHaveValue("123456");
  });

  it("says the emailed code is wrong and sends the person back to that field", async () => {
    routeFetch(
      signInRoutes({
        [VERIFY]: () =>
          json(400, {
            detail: "That code is wrong or has expired. Request a new one.",
          }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email code is wrong or has expired."
    );
    expect(screen.getByLabelText("Code from the email")).toHaveFocus();
    expect(screen.getByLabelText("Code from the email")).toHaveValue("");
  });

  it("says the account is not set up for Printix and asks Barrels to give access", async () => {
    routeFetch(
      signInRoutes({
        [VERIFY]: () =>
          json(403, { detail: "Ask the team to give you access to this app." }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This account is not set up for Printix yet. Ask Barrels to give you access."
    );
  });

  it("gives rate limiting its own message when the code is requested", async () => {
    routeFetch(
      signInRoutes({
        [START]: () =>
          json(429, { error: "slow down" }, { "Retry-After": "300" }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: EMAIL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send the code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Try again in 300 seconds."
    );
  });

  it("names the no-signal case on screen instead of failing silently", async () => {
    routeFetch(signInRoutes());
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: EMAIL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send the code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No signal. Organiser screens need a connection"
    );
  });

  it("is not connected when the build has no API address, and calls nothing", () => {
    const spy = routeFetch({});
    render(<OrganiserApp apiOrigin="" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "not connected to their server"
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("choosing an organisation", () => {
  it("opens straight on to the events when there is only one organisation", async () => {
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR]),
        [EVENTS]: () => json(200, EMPTY_PAGE),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    expect(await screen.findByText(NO_EVENTS)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Choose an organisation" })
    ).toBeNull();
    expect(screen.getByText("Harbour Events")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch organisation" })
    ).toBeNull();
    expect(
      window.sessionStorage.getItem("printix-organiser.organisation")
    ).toBe(HARBOUR.id);
  });

  it("says there is no Printix role when the person has no organisation", async () => {
    routeFetch(signInRoutes({ [ORGS]: () => json(200, []) }));
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    expect(await screen.findByText(NO_ROLE)).toBeInTheDocument();
  });

  it("shows a picker with several organisations, and remembers the choice for this tab", async () => {
    const spy = routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    const picker = await screen.findByRole("region", {
      name: "Choose an organisation",
    });
    expect(within(picker).getByText("Organiser")).toBeInTheDocument();
    expect(within(picker).getByText("Gate lead")).toBeInTheDocument();
    expect(countCalls(spy, EVENTS)).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: HARBOUR_BUTTON }));
    await screen.findByText(ROLE_ORGANISER);
    expect(
      window.sessionStorage.getItem("printix-organiser.organisation")
    ).toBe(HARBOUR.id);
  });

  it("sends the organisation header with each event call, and the bearer token", async () => {
    const spy = routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    fireEvent.click(
      await screen.findByRole("button", { name: NORTHERN_BUTTON })
    );

    await screen.findByText(ROLE_GATE_LEAD);
    const eventsCall = spy.mock.calls.find(([request]) =>
      request.url.includes("/printix/org/events?")
    )?.[0];
    expect(eventsCall?.headers.get("X-Barrels-Organisation")).toBe(NORTHERN.id);
    expect(eventsCall?.headers.get("Authorization")).toBe("Bearer access-ui");
  });
});

describe("events and counts", () => {
  it("lists events with their date and open or closed state, and opens one", async () => {
    routeFetch(signInRoutes({ [ORGS]: () => json(200, [HARBOUR]) }));
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();

    const row = await screen.findByRole("button", {
      name: NIGHT_MARKET_BUTTON,
    });
    expect(row).toHaveTextContent("26 Dec 2026");
    expect(row).toHaveTextContent("Open");
    fireEvent.click(row);

    expect(await screen.findByText("of 400 issued")).toBeInTheDocument();
    expect(screen.getByText("Not yet in: 278")).toBeInTheDocument();
    expect(screen.getByText("Void")).toBeInTheDocument();
    expect(screen.getByText("Refused: already in")).toBeInTheDocument();
    expect(screen.getByText("Offline conflicts")).toBeInTheDocument();
    expect(screen.getByText(REFRESH_NOTE)).toBeInTheDocument();
  });

  it("reads the summary with the organisation header", async () => {
    const spy = routeFetch(
      signInRoutes({ [ORGS]: () => json(200, [HARBOUR]) })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    fireEvent.click(
      await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
    );
    await screen.findByText("of 400 issued");

    const summaryCall = spy.mock.calls.find(([request]) =>
      request.url.endsWith(`/events/${EVENT_ID}/summary`)
    )?.[0];
    expect(summaryCall?.headers.get("X-Barrels-Organisation")).toBe(HARBOUR.id);
  });

  it("refreshes the counts every 10 seconds while the page is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const spy = routeFetch(
      signInRoutes({ [ORGS]: () => json(200, [HARBOUR]) })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    fireEvent.click(
      await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
    );
    await screen.findByText("of 400 issued");
    expect(countCalls(spy, SUMMARY_ROUTE)).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await waitFor(() => expect(countCalls(spy, SUMMARY_ROUTE)).toBe(2));
  });

  it("keeps the last counts on screen and says why when a later read fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR]),
        [SUMMARY_ROUTE]: () => {
          reads += 1;
          return reads === 1
            ? json(200, SUMMARY)
            : json(503, { detail: "down" });
        },
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    fireEvent.click(
      await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
    );
    await screen.findByText("of 400 issued");

    // The second read is the 10-second refresh.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The Printix service is not available right now."
    );
    expect(screen.getByText("of 400 issued")).toBeInTheDocument();
  });
});

describe("a reload and the session", () => {
  it("renews a stored session on reload and goes straight to the organisations", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_TOKEN);
    routeFetch(signInRoutes());
    render(<OrganiserApp apiOrigin={ORIGIN} />);

    expect(
      await screen.findByRole("heading", { name: "Choose an organisation" })
    ).toBeInTheDocument();
    expect(screen.getByText(`Signed in as ${EMAIL}`)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      "v".repeat(43)
    );
  });

  it("returns to sign-in with a plain notice when the server ends the stored session", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_TOKEN);
    routeFetch(
      signInRoutes({
        [REFRESH]: () => json(401, { detail: "Invalid or expired session" }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);

    expect(
      await screen.findByText("Your session has ended. Sign in again.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Printix organiser" })
    ).toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("signs out: the server is told, and this tab forgets the person", async () => {
    const spy = routeFetch(
      signInRoutes({ [ORGS]: () => json(200, [HARBOUR]) })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    await screen.findByText(EVENTS_SHOWN);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("Sign in with your Barrels account.")
    ).toBeInTheDocument();
    expect(countCalls(spy, LOGOUT)).toBe(1);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });
});

describe("review fixes: refresh loss, second 401, pages, status and pauses", () => {
  it("a lost refresh answer leads to the dropped-connection message on the next try", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_TOKEN);
    let refreshes = 0;
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR, NORTHERN]),
        [REFRESH]: () => {
          refreshes += 1;
          if (refreshes === 1) {
            return Promise.reject(
              Object.assign(new Error("timed out"), { name: "TimeoutError" })
            );
          }
          return json(401, { detail: "Invalid or expired session" });
        },
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);

    // The first answer never arrived: the screen offers a retry.
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText(
        "You were signed out because the connection dropped. Sign in again."
      )
    ).toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("a second 401 after a refresh returns to sign-in, not to a Try again screen", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, SESSION_TOKEN);
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(401, { detail: "Could not validate credentials" }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);

    expect(
      await screen.findByText("Your session has ended. Sign in again.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Printix organiser" })
    ).toBeInTheDocument();
  });

  it("an empty page past the end goes back to the last page", async () => {
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR]),
        [EVENTS]: (request) =>
          new URL(request.url).searchParams.get("page") === "2"
            ? json(200, { items: [], total: 50, page: 2, size: 50 })
            : json(200, {
                items: [SUMMARY.event],
                total: 51,
                page: 1,
                size: 50,
              }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
    ).toBeInTheDocument();
    expect(screen.getByText("Showing 1 to 50 of 51")).toBeInTheDocument();
  });

  it("takes the event's status from the polled summary, so a closing event updates", async () => {
    routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR]),
        [SUMMARY_ROUTE]: () =>
          json(200, {
            ...SUMMARY,
            event: { ...SUMMARY.event, status: "closed" },
          }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await signIn();
    fireEvent.click(
      await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
    );

    expect(await screen.findByText(CLOSED_LINE)).toBeInTheDocument();
  });

  it("does not read again during a rate-limit pause, even when the tab is flipped", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    const spy = routeFetch(
      signInRoutes({
        [ORGS]: () => json(200, [HARBOUR]),
        [SUMMARY_ROUTE]: () =>
          json(429, { error: "slow down" }, { "Retry-After": "30" }),
      })
    );
    try {
      render(<OrganiserApp apiOrigin={ORIGIN} />);
      await signIn();
      fireEvent.click(
        await screen.findByRole("button", { name: NIGHT_MARKET_BUTTON })
      );
      expect(
        await screen.findByText("Try again in 30 seconds.", { exact: false })
      ).toBeInTheDocument();
      expect(countCalls(spy, SUMMARY_ROUTE)).toBe(1);

      for (let flip = 0; flip < 5; flip += 1) {
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(countCalls(spy, SUMMARY_ROUTE)).toBe(1);

      await vi.advanceTimersByTimeAsync(30_000);
      await waitFor(() =>
        expect(countCalls(spy, SUMMARY_ROUTE)).toBeGreaterThanOrEqual(2)
      );
    } finally {
      // Remove the override so other tests see the real visibility state.
      Reflect.deleteProperty(document, "visibilityState");
    }
  });
});
