import { capInsertTargets } from "@barrelsgd/gms/products";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CapForecastPicker } from "./cap-forecast-picker";

const EVENING_TARGETS = capInsertTargets("evening");
const MORNING_TARGETS = capInsertTargets("morning");

const INSTRUCTION = /instruction:/i;
const HEADLINE = /headline:/i;
const INACTIVE = /no longer active/;
const uuid = "11111111-1111-4111-8111-111111111111";
const bulletin = {
  id: uuid,
  identifier: "test-warning",
  sender: "GMS",
  sent: "2026-09-17T12:00:00Z",
  status: "Actual",
  msg_type: "Alert",
  scope: "Public",
  lifecycle_state: "PUBLISHED",
  created_by_user_id: uuid,
  created_at: "2026-09-17T12:00:00Z",
  updated_at: "2026-09-17T12:00:00Z",
  info: [
    {
      id: uuid,
      sequence: 0,
      event: "Rain",
      headline: "Heavy rain",
      description: "Rain expected.",
      instruction: "Avoid flooded roads.",
      areas: [],
    },
  ],
};
function response(data: unknown[]) {
  return new Response(JSON.stringify({ data, count: data.length }), {
    status: 200,
  });
}
afterEach(() => vi.unstubAllGlobals());

it("copies only selected text with attribution after checking the bulletin again", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(response([bulletin])));
  vi.stubGlobal("fetch", fetcher);
  const onInsert = vi.fn();
  render(<CapForecastPicker onInsert={onInsert} targets={EVENING_TARGETS} />);
  fireEvent.click(screen.getByRole("button", { name: "Insert warning text" }));
  fireEvent.change(await screen.findByLabelText("CAP alert"), {
    target: { value: `${uuid}/${uuid}` },
  });
  fireEvent.click(screen.getByLabelText(INSTRUCTION));
  fireEvent.change(screen.getByLabelText("Add to"), {
    target: { value: "day2Weather" },
  });
  fireEvent.click(screen.getByText("Add selected text"));
  await waitFor(() =>
    expect(onInsert).toHaveBeenCalledWith(
      "day2Weather",
      expect.stringContaining("Avoid flooded roads.")
    )
  );
  expect(onInsert.mock.calls[0][1]).toContain(
    "CAP test-warning; sender GMS; issued"
  );
  expect(onInsert.mock.calls[0][1]).not.toContain("Rain expected.");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    screen.getByRole("dialog", { name: "Insert warning text" })
  ).toBeInTheDocument();
});

it("does not copy a bulletin that is no longer active", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(response([bulletin]))
      .mockResolvedValueOnce(response([]))
  );
  const onInsert = vi.fn();
  render(<CapForecastPicker onInsert={onInsert} targets={MORNING_TARGETS} />);
  fireEvent.click(screen.getByRole("button", { name: "Insert warning text" }));
  fireEvent.change(await screen.findByLabelText("CAP alert"), {
    target: { value: `${uuid}/${uuid}` },
  });
  fireEvent.click(screen.getByLabelText(HEADLINE));
  fireEvent.click(screen.getByText("Add selected text"));
  await screen.findByText(INACTIVE);
  expect(onInsert).not.toHaveBeenCalled();
});

it("reports an unavailable CAP service", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
  );
  render(<CapForecastPicker onInsert={vi.fn()} targets={MORNING_TARGETS} />);
  fireEvent.click(screen.getByRole("button", { name: "Insert warning text" }));
  await screen.findByText("CAP alerts could not be loaded. Try again.");
});

it("copies selected GMS bulletin text with attribution", async () => {
  const marine = {
    id: uuid,
    revision: 3,
    publishedAt: "2026-09-24T10:00:00Z",
    kind: "marine",
    values: {
      issuedAt: "2026-09-24T06:00",
      validFrom: "2026-09-24T06:00",
      validTo: "2026-09-25T06:00",
      level: "Yellow",
      area: "Grenada waters",
      synopsis: "A tropical wave is moving west.",
      response: "Small craft should exercise caution.",
    },
  };
  const feed = {
    products: [
      marine,
      {
        ...marine,
        id: "22222222-2222-4222-8222-222222222222",
        kind: "morning",
      },
    ],
  };
  const fetcher = vi.fn((path: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(path.includes("cap") ? { data: [], count: 0 } : feed),
        { status: 200 }
      )
    )
  );
  vi.stubGlobal("fetch", fetcher);
  const onInsert = vi.fn();
  render(<CapForecastPicker onInsert={onInsert} targets={MORNING_TARGETS} />);
  fireEvent.click(screen.getByRole("button", { name: "Insert warning text" }));
  fireEvent.click(await screen.findByRole("tab", { name: "GMS bulletins" }));
  const select = await screen.findByLabelText("GMS bulletin");
  expect(select.querySelectorAll("option")).toHaveLength(2);
  fireEvent.change(select, { target: { value: uuid } });
  fireEvent.click(screen.getByLabelText(/Response:/));
  fireEvent.click(screen.getByText("Add selected text"));
  await waitFor(() => expect(onInsert).toHaveBeenCalled());
  expect(onInsert.mock.calls[0][1]).toBe(
    "Small craft should exercise caution.\n\n[GMS Marine / Small Craft Bulletin r3; issued 2026-09-24 06:00]"
  );
});
