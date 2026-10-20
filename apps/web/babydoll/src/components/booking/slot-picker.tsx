"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SlotList } from "@/app/book/actions";
import type { Outcome } from "@/lib/booking-errors";
import {
  addDays,
  formatDay,
  formatTime,
  groupByDay,
  localDay,
  WINDOW_DAYS,
} from "@/lib/booking-format";

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; list: SlotList };

interface SlotPickerProps {
  /** Fetches the open slots for the 14 days from `firstDay`. */
  load: (firstDay: string) => Promise<Outcome<SlotList>>;
  /** Called with the chosen start (UTC ISO) or null when the choice is cleared. */
  onChange: (startsAt: string | null) => void;
  /** Bump to reload the same window (after a slot was taken). */
  reloadKey?: number;
  /** The studio's IANA timezone, for the "today" that starts the window. */
  timeZone: string;
  value: string | null;
}

const NETWORK_MESSAGE =
  "We couldn't load times. Check your connection and try again.";

/** Day then time picker over the availability endpoint, 14 days at a time. */
export function SlotPicker({
  load,
  onChange,
  reloadKey = 0,
  timeZone,
  value,
}: SlotPickerProps) {
  const id = useId();
  const [today, setToday] = useState<string | null>(null);
  // A fresh object per request: setting it again reloads the same window.
  const [request, setRequest] = useState<{ start: string } | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [day, setDay] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // "Today" is the studio's, and only known in the browser.
  useEffect(() => {
    const now = localDay(new Date(), timeZone);
    setToday(now);
    setRequest({ start: now });
  }, [timeZone]);

  // The parent bumps reloadKey after a slot was taken: refetch this window.
  const lastReload = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== lastReload.current) {
      lastReload.current = reloadKey;
      setRequest((current) => (current ? { start: current.start } : current));
    }
  }, [reloadKey]);

  useEffect(() => {
    if (!request) {
      return;
    }
    let stale = false;
    setLoaded({ state: "loading" });
    loadRef
      .current(request.start)
      .then((outcome) => {
        if (stale) {
          return;
        }
        if (outcome.ok) {
          setLoaded({ state: "ready", list: outcome.data });
        } else {
          setLoaded({ state: "error", message: outcome.message });
        }
      })
      .catch(() => {
        if (!stale) {
          setLoaded({ state: "error", message: NETWORK_MESSAGE });
        }
      });
    return () => {
      stale = true;
    };
  }, [request]);

  const days =
    loaded.state === "ready"
      ? groupByDay(loaded.list.slots, loaded.list.timezone)
      : [];
  const firstWithSlots = days[0]?.day ?? null;
  const activeDay =
    day && days.some((entry) => entry.day === day) ? day : firstWithSlots;
  const times = days.find((entry) => entry.day === activeDay)?.slots ?? [];

  // A chosen time that left the window (or was just taken) is cleared.
  useEffect(() => {
    if (
      loaded.state === "ready" &&
      value &&
      !loaded.list.slots.some((slot) => slot.starts_at === value)
    ) {
      onChangeRef.current(null);
    }
  }, [loaded, value]);

  const windowStart = request?.start ?? null;
  const canGoBack = Boolean(today && windowStart && windowStart > today);
  const move = (by: number) => {
    if (windowStart) {
      setDay(null);
      onChange(null);
      setRequest({ start: addDays(windowStart, by * WINDOW_DAYS) });
    }
  };
  const rangeLabel = windowStart
    ? `${formatDay(windowStart)} to ${formatDay(addDays(windowStart, WINDOW_DAYS - 1))}`
    : "";

  return (
    <div aria-busy={loaded.state === "loading"} className="slots">
      <div className="slots-nav">
        <button
          className="btn btn-ghost btn-small"
          disabled={!canGoBack}
          onClick={() => move(-1)}
          type="button"
        >
          Earlier dates
        </button>
        <span className="muted">{rangeLabel}</span>
        <button
          className="btn btn-ghost btn-small"
          onClick={() => move(1)}
          type="button"
        >
          Later dates
        </button>
      </div>

      <p aria-live="polite" className="muted slots-status" role="status">
        {loaded.state === "loading" && "Loading times…"}
        {loaded.state === "ready" &&
          days.length === 0 &&
          "No times are open on these dates. Try later dates."}
      </p>

      {loaded.state === "error" && (
        <div className="notice notice-error" role="alert">
          <p>{loaded.message}</p>
          <button
            className="btn btn-ghost btn-small"
            onClick={() =>
              setRequest((current) =>
                current ? { start: current.start } : current
              )
            }
            type="button"
          >
            Try again
          </button>
        </div>
      )}

      {days.length > 0 && (
        <>
          <fieldset className="chips">
            <legend>Day</legend>
            {days.map((entry) => (
              <label className="chip" key={entry.day}>
                <input
                  checked={entry.day === activeDay}
                  name={`${id}-day`}
                  onChange={() => {
                    setDay(entry.day);
                    onChange(null);
                  }}
                  type="radio"
                  value={entry.day}
                />
                <span>{formatDay(entry.day)}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="chips">
            <legend>Time</legend>
            {times.map((slot) => (
              <label className="chip" key={slot.starts_at}>
                <input
                  checked={slot.starts_at === value}
                  name={`${id}-time`}
                  onChange={() => onChange(slot.starts_at)}
                  type="radio"
                  value={slot.starts_at}
                />
                <span>
                  {formatTime(
                    slot.starts_at,
                    loaded.state === "ready" ? loaded.list.timezone : timeZone
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}
    </div>
  );
}
