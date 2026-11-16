// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, utcToday } from "@/organiser/format";
import { OrganiserApp } from "@/organiser/organiser-app";
import {
  ORGANISATION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "@/organiser/session";
import { SUMMARY } from "@/test/fixtures";
import {
  countCalls,
  json,
  loginBody,
  ORIGIN,
  type Routes,
  routeFetch,
} from "@/test/organiser-fetch";

// Text and label matchers, kept at top level.
const NIGHT_MARKET = /Harbour Night Market/u;
const CLOSES_LABEL = /Closes \(Grenada time\)/u;
const BARCODE_WORD = /barcode/iu;
const TICKET_LIST_LABEL = /Ticket list/u;
const CANNOT_UNDO = /This cannot be undone/u;
const QR_NAME = /QR code/u;
const SHARE_WORDS = /copy|download|print|share/iu;
const CLOSED_GATE_NOTE = /Its gate codes no longer admit people/u;

const EVENT_ID = SUMMARY.event.id;
const BASE = "/api/v1/printix/org";
const ORGANISER = {
  id: "2c4e6a8b-1d3f-4a5b-9c7d-0e2f4a6b8c1d",
  name: "Harbour Events",
  can_manage_events: true,
  can_manage_gates: true,
};
const GATE_LEAD = {
  ...ORGANISER,
  id: "8d6f4b2a-9e7c-4d5b-8a3f-1c2e4d6b8a0f",
  name: "Northern Markets",
  can_manage_events: false,
};
const SECRET = "Z".repeat(43);
const REFRESH = "POST /api/v1/auth/sessions/refresh";
const ORGS = "GET /api/v1/printix/me/organisations";
const EVENTS = `GET ${BASE}/events`;
const SUMMARY_ROUTE = `GET ${BASE}/events/${EVENT_ID}/summary`;
const PAIRINGS = `GET ${BASE}/events/${EVENT_ID}/pairings`;
const CREATE_PAIRING = `POST ${BASE}/events/${EVENT_ID}/pairings`;
const TICKETS = `GET ${BASE}/events/${EVENT_ID}/tickets`;
const IMPORT = `POST ${BASE}/events/${EVENT_ID}/tickets/import`;
const CLOSE = `POST ${BASE}/events/${EVENT_ID}/close`;
const CREATE_EVENT = `POST ${BASE}/events`;
const VOID_101 = `POST ${BASE}/tickets/3f1d2c4b-5a6e-4b7c-8d9e-0f1a2b3c4d5e/void`;
const RESTORE_102 = `POST ${BASE}/tickets/4a2e3d5c-6b7f-4c8d-9e0f-1a2b3c4d5e6f/unvoid`;
const REVOKE = `POST ${BASE}/pairings/5b3f4e6d-7c8a-4d9e-8f1a-2b3c4d5e6f70/revoke`;

const TICKET_PAGE = {
  items: [
    {
      id: "3f1d2c4b-5a6e-4b7c-8d9e-0f1a2b3c4d5e",
      printed_number: "101",
      status: "valid",
      admitted_at: null,
      admitted_gate: null,
    },
    {
      id: "4a2e3d5c-6b7f-4c8d-9e0f-1a2b3c4d5e6f",
      printed_number: "102",
      status: "void",
      admitted_at: null,
      admitted_gate: null,
    },
  ],
  total: 2,
  page: 1,
  size: 50,
};
const EVENT_PAGE = { items: [SUMMARY.event], total: 1, page: 1, size: 50 };
const CODE = {
  id: "5b3f4e6d-7c8a-4d9e-8f1a-2b3c4d5e6f70",
  gate: "North gate",
  created_at: "2026-12-26T10:00:00Z",
  expires_at: "2026-12-27T06:00:00Z",
  revoked_at: null,
  allow_typed_numbers: false,
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    dry_run: true,
    applied: false,
    rows: 2,
    to_add: 2,
    errors: [],
    errors_truncated: false,
    warnings: [],
    short_barcodes: 0,
    barcode_equals_number: 0,
    ...overrides,
  };
}

/** Routes for a signed-in organiser (or gate lead) with one event open. */
function baseRoutes(org = ORGANISER, overrides: Routes = {}): Routes {
  return {
    [REFRESH]: () =>
      json(
        200,
        loginBody({ sessionToken: "v".repeat(43), accessToken: "access-setup" })
      ),
    [ORGS]: () => json(200, [org]),
    [EVENTS]: () => json(200, EVENT_PAGE),
    [SUMMARY_ROUTE]: () => json(200, SUMMARY),
    [PAIRINGS]: () => json(200, []),
    [TICKETS]: () => json(200, TICKET_PAGE),
    ...overrides,
  };
}

/** Everything the page has stored (both storages), as one string, for "is it there?" checks. */
function storedText(): string {
  return [window.sessionStorage, window.localStorage]
    .flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? "";
        return `${key}=${storage.getItem(key)}`;
      })
    )
    .join("\n");
}

/** Opens the event from a restored session (no typing of codes needed). */
async function openEvent(routes: Routes) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, "u".repeat(43));
  const spy = routeFetch(routes);
  render(<OrganiserApp apiOrigin={ORIGIN} />);
  fireEvent.click(await screen.findByRole("button", { name: NIGHT_MARKET }));
  await screen.findByText("of 400 issued");
  return spy;
}

/** Every request sent to one "METHOD /path" route, in order. */
function callsTo(spy: ReturnType<typeof routeFetch>, key: string) {
  return spy.mock.calls
    .map(([request]) => request)
    .filter(
      (request) => `${request.method} ${new URL(request.url).pathname}` === key
    );
}

function bodyOf(spy: ReturnType<typeof routeFetch>, key: string) {
  const call = spy.mock.calls.find(
    ([request]) => `${request.method} ${new URL(request.url).pathname}` === key
  );
  return call?.[0];
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("role gating", () => {
  it("shows an organiser every setup action", async () => {
    await openEvent(baseRoutes(ORGANISER));
    expect(
      screen.getByRole("heading", { name: "Gate codes" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tickets" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Import tickets" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Close event" })
    ).toBeInTheDocument();
  });

  it("gives a gate lead gate codes only: no New event, tickets, import or close", async () => {
    window.sessionStorage.setItem(ORGANISATION_STORAGE_KEY, GATE_LEAD.id);
    const spy = await openEvent(baseRoutes(GATE_LEAD));
    expect(
      screen.getByRole("heading", { name: "Gate codes" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tickets" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Import tickets" })
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "Close event" })).toBeNull();
    expect(countCalls(spy, TICKETS)).toBe(0);
  });

  it("hides New event from a gate lead on the events list", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "u".repeat(43));
    routeFetch(baseRoutes(GATE_LEAD));
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    await screen.findByRole("button", { name: NIGHT_MARKET });
    expect(screen.queryByRole("button", { name: "New event" })).toBeNull();
  });

  it("hides the typed-numbers switch from a gate lead", async () => {
    await openEvent(baseRoutes(GATE_LEAD));
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    expect(
      screen.queryByRole("switch", { name: "Allow typed numbers" })
    ).toBeNull();
  });
});

describe("create event", () => {
  it("checks the rules before sending, then posts the Grenada time with its offset", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "u".repeat(43));
    const spy = routeFetch(
      baseRoutes(ORGANISER, {
        [CREATE_EVENT]: () => json(201, SUMMARY.event),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    fireEvent.click(await screen.findByRole("button", { name: "New event" }));

    const eventDate = addDays(utcToday(), 30);
    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Night market" },
    });
    fireEvent.change(screen.getByLabelText("Event date"), {
      target: { value: addDays(utcToday(), 400) },
    });
    fireEvent.change(screen.getByLabelText(CLOSES_LABEL), {
      target: { value: `${eventDate}T00:00` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(
      await screen.findByText("The event date can be at most one year ahead.")
    ).toBeInTheDocument();
    expect(countCalls(spy, CREATE_EVENT)).toBe(0);

    fireEvent.change(screen.getByLabelText("Event date"), {
      target: { value: eventDate },
    });
    fireEvent.change(screen.getByLabelText(CLOSES_LABEL), {
      target: { value: `${addDays(eventDate, 8)}T00:00` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(
      await screen.findByText(
        "The event closes at most seven days after the event date."
      )
    ).toBeInTheDocument();
    expect(countCalls(spy, CREATE_EVENT)).toBe(0);

    fireEvent.change(screen.getByLabelText(CLOSES_LABEL), {
      target: { value: `${eventDate}T23:00` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    await waitFor(() => expect(countCalls(spy, CREATE_EVENT)).toBe(1));
    const sent = await bodyOf(spy, CREATE_EVENT)?.json();
    expect(sent).toEqual({
      name: "Night market",
      event_date: eventDate,
      closes_at: `${eventDate}T23:00:00-04:00`,
    });
  });

  it("says a server refusal in words", async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, "u".repeat(43));
    routeFetch(
      baseRoutes(ORGANISER, {
        [CREATE_EVENT]: () =>
          json(422, {
            detail: [],
            errors: [
              {
                type: "value_error",
                loc: ["body"],
                msg: "Value error, closes_at must not be before the event date",
              },
            ],
          }),
      })
    );
    render(<OrganiserApp apiOrigin={ORIGIN} />);
    fireEvent.click(await screen.findByRole("button", { name: "New event" }));
    fireEvent.change(screen.getByLabelText("Event name"), {
      target: { value: "Night market" },
    });
    fireEvent.change(screen.getByLabelText("Event date"), {
      target: { value: addDays(utcToday(), 30) },
    });
    fireEvent.change(screen.getByLabelText(CLOSES_LABEL), {
      target: { value: `${addDays(utcToday(), 30)}T10:00` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "closes_at must not be before the event date"
    );
  });
});

describe("tickets", () => {
  it("lists printed numbers and never a barcode", async () => {
    await openEvent(baseRoutes());
    expect(await screen.findByText("101")).toBeInTheDocument();
    expect(screen.getByText("102")).toBeInTheDocument();
    expect(screen.queryByText(BARCODE_WORD, { selector: "li *" })).toBeNull();
  });

  it("voids a ticket only after the confirm step", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [VOID_101]: () =>
          json(200, { ...TICKET_PAGE.items[0], status: "void" }),
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Void ticket" }));
    expect(countCalls(spy, VOID_101)).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, void it" }));
    await waitFor(() => expect(countCalls(spy, VOID_101)).toBe(1));
  });

  it("restores a void ticket with a confirm step", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [RESTORE_102]: () =>
          json(200, { ...TICKET_PAGE.items[1], status: "valid" }),
      })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Restore ticket" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, restore it" }));
    await waitFor(() => expect(countCalls(spy, RESTORE_102)).toBe(1));
  });

  it("refuses every change once the event is closed", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [SUMMARY_ROUTE]: () =>
          json(200, {
            ...SUMMARY,
            event: { ...SUMMARY.event, status: "closed" },
          }),
      })
    );
    expect(
      await screen.findByText("This event is closed, so tickets cannot change.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void ticket" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore ticket" })).toBeNull();
    expect(
      screen.getByText("This event is closed, so tickets cannot be imported.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Close event" })).toBeNull();
  });

  it("says a void refused because the ticket was admitted, in words", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [VOID_101]: () =>
          json(409, {
            detail: "This ticket was already admitted, so it cannot be voided",
          }),
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Void ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, void it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This ticket was already admitted at the gate, so it cannot be voided."
    );
    expect(countCalls(spy, VOID_101)).toBe(1);
  });
});

describe("import: a trial, then the import", () => {
  const file = () =>
    new File(
      ["number,barcode\n101,PX0000000101\n102,PX0000000102\n"],
      "tickets.csv",
      { type: "text/csv" }
    );

  it("runs a trial first, and enables the import only when the trial is clean", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: (request) =>
          new URL(request.url).searchParams.get("dry_run") === "false"
            ? json(200, report({ dry_run: false, applied: true }))
            : json(200, report({ to_add: 2 })),
      })
    );
    const input = screen.getByLabelText(TICKET_LIST_LABEL);
    fireEvent.change(input, { target: { files: [file()] } });
    expect(countCalls(spy, IMPORT)).toBe(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(
      await screen.findByText("2 rows to add from 2 read.")
    ).toBeInTheDocument();
    expect(countCalls(spy, IMPORT)).toBe(1);
    expect(
      new URL(callsTo(spy, IMPORT)[0]?.url ?? "").searchParams.get("dry_run")
    ).toBe("true");

    const importButton = screen.getByRole("button", {
      name: "Import 2 tickets",
    });
    expect(importButton).toBeEnabled();
    fireEvent.click(importButton);
    expect(await screen.findByText("Imported 2 tickets.")).toBeInTheDocument();
    expect(countCalls(spy, IMPORT)).toBe(2);
    expect(
      new URL(callsTo(spy, IMPORT)[1]?.url ?? "").searchParams.get("dry_run")
    ).toBe("false");
  });

  it("lists problems by line and keeps the import disabled", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () =>
          json(
            200,
            report({
              to_add: 1,
              errors: [
                { line: 3, message: "The number is not a three-digit number." },
              ],
            })
          ),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(
      await screen.findByText("Line 3: The number is not a three-digit number.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 1 ticket" })
    ).toBeDisabled();
  });

  it("shows the weak-barcode warning in words, with the counts", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () =>
          json(200, report({ short_barcodes: 2, barcode_equals_number: 1 })),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(
      await screen.findByText(
        "Offline checking will be off for this event: 2 barcodes are shorter than 12 characters and 1 is the same as the printed number."
      )
    ).toBeInTheDocument();
  });

  it("refuses a file over 2 MB before sending anything", async () => {
    const spy = await openEvent(baseRoutes(ORGANISER));
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv", {
      type: "text/csv",
    });
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [big] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is larger than 2 MB."
    );
    expect(countCalls(spy, IMPORT)).toBe(0);
  });

  it("says a file the server refuses for size (413), in words", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () => json(413, { detail: "too big" }),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is larger than 2 MB."
    );
  });

  it("says an import refused because the event closed (409), in words", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () =>
          json(409, {
            detail: "This event is closed, so its tickets cannot change",
          }),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event is closed, so nothing here can change."
    );
  });

  it("keeps the file out of storage", async () => {
    await openEvent(
      baseRoutes(ORGANISER, { [IMPORT]: () => json(200, report()) })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    await screen.findByText("2 rows to add from 2 read.");
    expect(storedText()).not.toContain("PX0000000101");
  });
});

describe("close event", () => {
  it("asks for a confirm that says it cannot be undone, then closes", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [CLOSE]: () => json(200, { ...SUMMARY.event, status: "closed" }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Close event" }));
    expect(screen.getByText(CANNOT_UNDO)).toBeInTheDocument();
    expect(countCalls(spy, CLOSE)).toBe(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, close the event" })
    );
    await waitFor(() => expect(countCalls(spy, CLOSE)).toBe(1));
  });
});

describe("gate codes", () => {
  it("makes a code and shows its QR once, full width, with the words to use", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(
      screen.getByRole("switch", { name: "Allow typed numbers" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));

    expect(
      await screen.findByRole("img", {
        name: "QR code for the gate North gate",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Scan this with the gate phone's camera now. It will not be shown again."
      )
    ).toBeInTheDocument();
    const sent = await bodyOf(spy, CREATE_PAIRING)?.json();
    expect(sent).toMatchObject({
      gate: "North gate",
      allow_typed_numbers: true,
    });
    expect(sent).not.toHaveProperty("expires_at");
  });

  it("never puts the secret in storage, the URL, or a reported error", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
      })
    );
    const reported = vi.fn();
    window.addEventListener("pwa:error", reported);
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    await screen.findByRole("img", { name: QR_NAME });

    expect(storedText()).not.toContain(SECRET);
    expect(window.location.href).not.toContain(SECRET);
    expect(
      JSON.stringify(
        reported.mock.calls.map(([event]) => (event as CustomEvent).detail)
      )
    ).not.toContain(SECRET);
    window.removeEventListener("pwa:error", reported);
  });

  it("drops the QR when Done is pressed, and it does not come back", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    await screen.findByRole("img", { name: QR_NAME });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("img", { name: QR_NAME })).toBeNull();
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("offers no copy, download, print or share for the code", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    await screen.findByRole("img", { name: QR_NAME });
    expect(screen.queryByRole("button", { name: SHARE_WORDS })).toBeNull();
  });

  it("cancels a code with one tap and a confirm, for either role", async () => {
    const spy = await openEvent(
      baseRoutes(GATE_LEAD, {
        [PAIRINGS]: () => json(200, [CODE]),
        [REVOKE]: () =>
          json(200, { ...CODE, revoked_at: "2026-12-26T11:00:00Z" }),
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel code" }));
    expect(countCalls(spy, REVOKE)).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() => expect(countCalls(spy, REVOKE)).toBe(1));
  });

  it("says to cancel one first when the event already has 20 active codes (409)", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () =>
          json(409, {
            detail:
              "This event already has 20 active gate codes. Cancel one before making another.",
          }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event already has 20 active gate codes. Cancel one before making another."
    );
  });

  it("states the wait in seconds on a rate limit", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () =>
          json(429, { error: "slow" }, { "Retry-After": "45" }),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Try again in 45 seconds."
    );
  });

  it("refuses new codes once the event is closed", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [SUMMARY_ROUTE]: () =>
          json(200, {
            ...SUMMARY,
            event: { ...SUMMARY.event, status: "closed" },
          }),
      })
    );
    expect(await screen.findByText(CLOSED_GATE_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New gate code" })).toBeNull();
  });
});
