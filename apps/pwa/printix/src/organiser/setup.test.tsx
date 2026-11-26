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
import { importTickets } from "@/organiser/write-api";

// A pass-through spy: the real import runs, and the File it was given is recorded.
vi.mock("@/organiser/write-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/organiser/write-api")>();
  return { ...actual, importTickets: vi.fn(actual.importTickets) };
});

import {
  ORGANISATION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from "@/organiser/session";
import { ANALYTICS, SCANS, SUMMARY } from "@/test/fixtures";
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
const FIRST_LINE_WARNING = /first on line 3/u;
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
const ANALYTICS_ROUTE = `GET ${BASE}/events/${EVENT_ID}/analytics`;
const SCANS_ROUTE = `GET ${BASE}/events/${EVENT_ID}/scans`;
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
    [ANALYTICS_ROUTE]: () => json(200, ANALYTICS),
    [SCANS_ROUTE]: () => json(200, SCANS),
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
    expect(
      (await screen.findAllByText("Imported 2 tickets."))[0]
    ).toBeInTheDocument();
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
        "Across this event, 2 barcodes are shorter than 12 characters and 1 is the same as the printed number. Offline checking will be off for this event."
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

describe("review fixes: the trial's file, blank barcodes and refusals", () => {
  // Each file carries its own ticket, so the upload's contents show which file was sent.
  const sample = (name: string) =>
    new File(
      [
        name.startsWith("first")
          ? "number,barcode\n101,PX0000000101\n"
          : "number,barcode\n202,PX0000000202\n",
      ],
      name,
      {
        type: "text/csv",
      }
    );

  it("uploads exactly the file that was checked", async () => {
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: (request) =>
          new URL(request.url).searchParams.get("dry_run") === "true"
            ? json(200, report())
            : json(200, report({ dry_run: false, applied: true })),
      })
    );
    const first = sample("first.csv");
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [first] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 tickets" })
    );
    await waitFor(() => expect(countCalls(spy, IMPORT)).toBe(2));
    const calls = vi.mocked(importTickets).mock.calls;
    const applied = calls.filter(([, , , , dryRun]) => dryRun === false);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.[3]).toBe(first);
  });

  it("ignores a trial answer for a file that was replaced while it was being checked", async () => {
    let answerTrial: (response: Response) => void = () => undefined;
    const spy = await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () =>
          new Promise<Response>((resolve) => {
            answerTrial = resolve;
          }),
      })
    );
    const input = screen.getByLabelText(TICKET_LIST_LABEL);
    fireEvent.change(input, { target: { files: [sample("first.csv")] } });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(input).toBeDisabled();
    await vi.waitFor(() => expect(countCalls(spy, IMPORT)).toBe(1));

    fireEvent.change(input, { target: { files: [sample("second.csv")] } });
    answerTrial(json(200, report()));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      screen.queryByRole("button", { name: "Import 2 tickets" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Check the file first" })
    ).toBeInTheDocument();
  });

  it("blocks the import while the trial has blank barcodes, and says what to do", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: () =>
          json(
            200,
            report({
              warnings: [
                "2 row(s) have a blank barcode, so their printed number is used as the barcode (first on line 3).",
              ],
            })
          ),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [sample("first.csv")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Every ticket needs its barcode. Ask the printer for the full list."
    );
    expect(screen.getByText(FIRST_LINE_WARNING)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 2 tickets" })
    ).toBeDisabled();
  });

  it("shows the server's problems under a clear heading when the real import writes nothing", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: (request) =>
          new URL(request.url).searchParams.get("dry_run") === "true"
            ? json(200, report())
            : json(
                200,
                report({
                  dry_run: false,
                  applied: false,
                  to_add: 0,
                  errors: [
                    {
                      line: 2,
                      message: "barcode equals another ticket's number",
                    },
                  ],
                })
              ),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [sample("first.csv")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 tickets" })
    );
    expect(
      await screen.findByRole("heading", {
        name: "The import was not written. Nothing was added.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Line 2: barcode equals another ticket's number")
    ).toBeInTheDocument();
  });

  it("keeps the offline warning visible after a successful import", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [IMPORT]: (request) =>
          new URL(request.url).searchParams.get("dry_run") === "true"
            ? json(200, report({ short_barcodes: 2 }))
            : json(
                200,
                report({ dry_run: false, applied: true, short_barcodes: 2 })
              ),
      })
    );
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [sample("first.csv")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 tickets" })
    );
    expect(
      (await screen.findAllByText("Imported 2 tickets."))[0]
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Across this event, 2 barcodes are shorter than 12 characters. Offline checking will be off for this event."
      )
    ).toBeInTheDocument();
  });

  it("refreshes the tickets list after a successful import", async () => {
    let imported = false;
    await openEvent(
      baseRoutes(ORGANISER, {
        [TICKETS]: () =>
          json(
            200,
            imported ? TICKET_PAGE : { items: [], total: 0, page: 1, size: 50 }
          ),
        [IMPORT]: (request) => {
          if (new URL(request.url).searchParams.get("dry_run") === "true") {
            return json(200, report());
          }
          imported = true;
          return json(200, report({ dry_run: false, applied: true }));
        },
      })
    );
    expect(
      await screen.findByText(
        "No tickets yet. Import the printer's list below."
      )
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(TICKET_LIST_LABEL), {
      target: { files: [sample("first.csv")] },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check the file first" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 tickets" })
    );
    expect(await screen.findByText("101")).toBeInTheDocument();
  });
});

describe("review fixes: a closed event, by its time as well as its status", () => {
  it("treats an event past its closing time as closed, even if its status still says open", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [SUMMARY_ROUTE]: () =>
          json(200, {
            ...SUMMARY,
            event: { ...SUMMARY.event, closes_at: "2020-01-01T00:00:00Z" },
          }),
        [PAIRINGS]: () => json(200, [CODE]),
      })
    );
    expect(
      await screen.findByText("This event is closed, so tickets cannot change.")
    ).toBeInTheDocument();
    expect(screen.getByText("Ended (event closed)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New gate code" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Void ticket" })).toBeNull();
    expect(
      screen.getByText("This event is closed, so tickets cannot be imported.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Close event" })).toBeNull();
  });
});

describe("review fixes: the gate QR panel", () => {
  const CREATE_A_CODE = async () => {
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    await screen.findByRole("img", { name: QR_NAME });
    // The panel moves focus and starts listening for the page being hidden in
    // effects that can run after the code is first painted. Waiting for the
    // focus proves those effects ran, so tests never race them under CI load.
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Gate code for North gate" })
      ).toHaveFocus()
    );
  };

  it("moves focus to the heading when the code appears, and counts down to its hiding", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
      })
    );
    await CREATE_A_CODE();
    expect(
      screen.getByRole("heading", { name: "Gate code for North gate" })
    ).toHaveFocus();
    expect(
      screen.getByText("This code hides in 120 seconds.")
    ).toBeInTheDocument();
  });

  it("drops the code when the page is hidden", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    try {
      await openEvent(
        baseRoutes(ORGANISER, {
          [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
        })
      );
      await CREATE_A_CODE();
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() =>
        expect(screen.queryByRole("img", { name: QR_NAME })).toBeNull()
      );
      expect(document.body.innerHTML).not.toContain(SECRET);
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("drops the code after two minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openEvent(
        baseRoutes(ORGANISER, {
          [CREATE_PAIRING]: () => json(201, { ...CODE, secret: SECRET }),
        })
      );
      await CREATE_A_CODE();
      await vi.advanceTimersByTimeAsync(119_000);
      expect(screen.getByRole("img", { name: QR_NAME })).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(2000);
      expect(screen.queryByRole("img", { name: QR_NAME })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says a code may have been made when the create gets no answer", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [CREATE_PAIRING]: () =>
          Promise.reject(new TypeError("Failed to fetch")),
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "New gate code" }));
    fireEvent.change(screen.getByLabelText("Gate name"), {
      target: { value: "North gate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Make gate code" }));
    expect(
      await screen.findByText(
        "A code may have been made. Check the list and cancel any you did not expect."
      )
    ).toBeInTheDocument();
  });
});

describe("review fixes: focus and announcements", () => {
  it("moves focus into a confirm when it opens, and back to its button when it closes", async () => {
    await openEvent(baseRoutes());
    const voidButton = await screen.findByRole("button", {
      name: "Void ticket",
    });
    fireEvent.click(voidButton);
    const keep = screen.getByRole("button", { name: "Keep it as it is" });
    expect(keep).toHaveFocus();
    fireEvent.click(keep);
    expect(screen.getByRole("button", { name: "Void ticket" })).toHaveFocus();
  });

  it("announces a result in the live region", async () => {
    await openEvent(
      baseRoutes(ORGANISER, {
        [VOID_101]: () =>
          json(200, { ...TICKET_PAGE.items[0], status: "void" }),
      })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Void ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, void it" }));
    expect(await screen.findByText("Ticket 101 is void.")).toBeInTheDocument();
    expect(
      screen.getByText("Ticket 101 is void.").closest('[aria-live="polite"]')
    ).not.toBeNull();
  });
});
