import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Outcome } from "../lib/booking-errors";
import { addDays, formatDay, localDay } from "../lib/booking-format";
import type { SlotList } from "../lib/booking-types";
import { SlotPicker } from "./slot-picker";

const TZ = "America/Grenada";
const NETWORK = /We couldn't load times/u;
const NO_TIMES = /No times are open on these dates/u;
const LOADING = /Loading times/u;

// Dates are built from the real "today" in the studio's timezone, the same
// way the picker finds it, so the suite passes on any day it runs.
const TODAY = localDay(new Date(), TZ);
const TOMORROW = addDays(TODAY, 1);
const IN_THREE = addDays(TODAY, 3);

// Grenada is UTC-4 all year: 16:00Z is 12:00 pm and 20:30Z is 4:30 pm.
const NOON = `${TOMORROW}T16:00:00Z`;
const AFTERNOON = `${TOMORROW}T20:30:00Z`;
const MORNING_LATER = `${IN_THREE}T14:00:00Z`;

type Load = (firstDay: string) => Promise<Outcome<SlotList>>;

const TIMES = { noon: "12:00 pm", afternoon: "4:30 pm", morning: "10:00 am" };

function list(
  slots: { starts_at: string }[],
  timezone = TZ
): Outcome<SlotList> {
  return {
    ok: true,
    data: {
      slots: slots.map((slot) => ({
        ...slot,
        ends_at: slot.starts_at,
      })),
      timezone,
    },
  };
}

function renderPicker(props: Partial<ComponentProps<typeof SlotPicker>> = {}) {
  const load =
    props.load ??
    vi
      .fn<Load>()
      .mockResolvedValue(
        list([
          { starts_at: AFTERNOON },
          { starts_at: NOON },
          { starts_at: MORNING_LATER },
        ])
      );
  const onChange = vi.fn();
  const utils = render(
    <SlotPicker
      load={load}
      onChange={onChange}
      timeZone={TZ}
      value={null}
      {...props}
    />
  );
  return { load, onChange, ...utils };
}

describe("SlotPicker", () => {
  it("loads the 14 days starting from today in the studio's timezone", async () => {
    const { load } = renderPicker();
    await screen.findByRole("radio", { name: formatDay(TOMORROW) });
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(TODAY);
  });

  it("shows a day chip for each day that has open slots, in date order", async () => {
    renderPicker();
    const dayGroup = await screen.findByRole("group", { name: "Day" });
    const days = within(dayGroup).getAllByRole("radio");
    expect(days.map((input) => input.getAttribute("value"))).toEqual([
      TOMORROW,
      IN_THREE,
    ]);
  });

  it("offers only the open times for the chosen day, sorted by time", async () => {
    renderPicker();
    const timeGroup = await screen.findByRole("group", { name: "Time" });
    const times = within(timeGroup).getAllByRole("radio");
    // The API returns open slots only: a slot it leaves out is not offered.
    expect(times.map((input) => input.parentElement?.textContent)).toEqual([
      TIMES.noon,
      TIMES.afternoon,
    ]);
    expect(
      within(timeGroup).queryByRole("radio", { name: TIMES.morning })
    ).toBeNull();
  });

  it("selects the first day with slots by default", async () => {
    renderPicker();
    const dayGroup = await screen.findByRole("group", { name: "Day" });
    expect(
      within(dayGroup).getByRole("radio", { name: formatDay(TOMORROW) })
    ).toBeChecked();
  });

  it("reports the chosen start as a UTC instant when a time is picked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(
      await screen.findByRole("radio", { name: TIMES.afternoon })
    );
    expect(onChange).toHaveBeenCalledWith(AFTERNOON);
  });

  it("marks the time the parent holds as selected", async () => {
    renderPicker({ value: NOON });
    expect(
      await screen.findByRole("radio", { name: TIMES.noon })
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: TIMES.afternoon })
    ).not.toBeChecked();
  });

  it("moves between times with the arrow keys", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ value: NOON });
    const noon = await screen.findByRole("radio", { name: TIMES.noon });
    act(() => {
      noon.focus();
    });
    await user.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith(AFTERNOON);
  });

  it("clears the chosen time when another day is picked", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ value: NOON });
    await user.click(
      await screen.findByRole("radio", { name: formatDay(IN_THREE) })
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
    const timeGroup = screen.getByRole("group", { name: "Time" });
    const times = within(timeGroup).getAllByRole("radio");
    expect(times.map((input) => input.parentElement?.textContent)).toEqual([
      TIMES.morning,
    ]);
  });

  it("shows the studio's timezone for the times, not the browser's", async () => {
    // The same instant is 12:00 pm in Grenada and 4:00 pm in UTC.
    renderPicker({
      load: vi.fn<Load>().mockResolvedValue(list([{ starts_at: NOON }], "UTC")),
    });
    expect(
      await screen.findByRole("radio", { name: "4:00 pm" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: TIMES.noon })
    ).not.toBeInTheDocument();
  });

  it("groups a slot under the studio's day, not the UTC day", async () => {
    // 02:00Z on the 3rd is still the 2nd in Grenada (UTC-4).
    const lateNight = `${IN_THREE}T02:00:00Z`;
    renderPicker({
      load: vi.fn<Load>().mockResolvedValue(list([{ starts_at: lateNight }])),
    });
    const dayGroup = await screen.findByRole("group", { name: "Day" });
    expect(
      within(dayGroup).getByRole("radio", {
        name: formatDay(addDays(IN_THREE, -1)),
      })
    ).toBeInTheDocument();
    expect(
      within(dayGroup).queryByRole("radio", { name: formatDay(IN_THREE) })
    ).toBeNull();
  });

  it("says no times are open when the window has no slots", async () => {
    renderPicker({ load: vi.fn<Load>().mockResolvedValue(list([])) });
    expect(await screen.findByText(NO_TIMES)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Day" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Time" })).toBeNull();
  });

  it("shows a loading message while the window loads", async () => {
    let finish: (value: Outcome<SlotList>) => void = () => undefined;
    const pending = new Promise<Outcome<SlotList>>((resolve) => {
      finish = resolve;
    });
    renderPicker({ load: vi.fn<Load>().mockReturnValue(pending) });
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.getByText(LOADING).closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    act(() => {
      finish(list([{ starts_at: NOON }]));
    });
    await screen.findByRole("radio", { name: TIMES.noon });
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("shows the API's message on a failed load and retries the same window", async () => {
    const user = userEvent.setup();
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce({
        ok: false,
        code: "unavailable",
        message: "Times are closed today.",
      })
      .mockResolvedValueOnce(list([{ starts_at: NOON }]));
    renderPicker({ load });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Times are closed today.")).toBeVisible();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByRole("radio", { name: TIMES.noon });
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(TODAY);
  });

  it("shows the connection message when the request itself fails", async () => {
    renderPicker({
      load: vi.fn<Load>().mockRejectedValue(new Error("offline")),
    });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(NETWORK)).toBeVisible();
  });

  it("moves the window forward and back by the window length", async () => {
    const user = userEvent.setup();
    const { load, onChange } = renderPicker();
    const earlier = screen.getByRole("button", { name: "Earlier dates" });
    // Already at today: no earlier window than the one that starts today.
    expect(earlier).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Later dates" }));
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(addDays(TODAY, 14))
    );
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Earlier dates" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Earlier dates" }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(TODAY));
    expect(
      screen.getByRole("button", { name: "Earlier dates" })
    ).toBeDisabled();
  });

  it("keeps Earlier, the range and Later in one row, in reading order", async () => {
    renderPicker();
    await screen.findByRole("radio", { name: formatDay(TOMORROW) });
    const earlier = screen.getByRole("button", { name: "Earlier dates" });
    const later = screen.getByRole("button", { name: "Later dates" });
    const nav = earlier.parentElement;
    expect(nav).toHaveClass("slots-nav");
    expect(later.parentElement).toBe(nav);
    // The arrows are decoration: the names stay "Earlier dates" and "Later dates".
    for (const button of [earlier, later]) {
      for (const part of Array.from(button.children)) {
        expect(part).toHaveAttribute("aria-hidden", "true");
      }
    }
    const range = `${formatDay(TODAY)} to ${formatDay(addDays(TODAY, 13))}`;
    expect(Array.from(nav?.children ?? []).map((el) => el.textContent)).toEqual(
      [earlier.textContent, range, later.textContent]
    );
  });

  it("labels the window with its first and last day", async () => {
    renderPicker();
    await screen.findByRole("radio", { name: formatDay(TOMORROW) });
    const label = `${formatDay(TODAY)} to ${formatDay(addDays(TODAY, 13))}`;
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("reloads the same window when reloadKey changes and drops a time that was taken", async () => {
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce(
        list([{ starts_at: NOON }, { starts_at: AFTERNOON }])
      )
      .mockResolvedValueOnce(list([{ starts_at: AFTERNOON }]));
    const { onChange, rerender } = renderPicker({ load, value: NOON });
    await screen.findByRole("radio", { name: TIMES.noon });

    rerender(
      <SlotPicker
        load={load}
        onChange={onChange}
        reloadKey={1}
        timeZone={TZ}
        value={NOON}
      />
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenLastCalledWith(TODAY);
    // The slot the visitor held is gone after the reload, so the choice clears.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });
});
