import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CapForecastPicker } from "./cap-forecast-picker";

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
  render(<CapForecastPicker evening onInsert={onInsert} />);
  fireEvent.click(screen.getByText("Load active CAP bulletins"));
  fireEvent.change(await screen.findByLabelText("CAP bulletin"), {
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
  render(<CapForecastPicker evening={false} onInsert={onInsert} />);
  fireEvent.click(screen.getByText("Load active CAP bulletins"));
  fireEvent.change(await screen.findByLabelText("CAP bulletin"), {
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
  render(<CapForecastPicker evening={false} onInsert={vi.fn()} />);
  fireEvent.click(screen.getByText("Load active CAP bulletins"));
  await screen.findByText("CAP bulletins could not be loaded. Try again.");
});
