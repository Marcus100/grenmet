import type { ElectionCalendar } from "@/data/election-2026";
import { grenadaDate } from "@/data/election-2026";
import { formatIsoDate } from "@/lib/format";

const W = 320;
const H = 196;
const LEFT = 12;
const RIGHT = W - 12;
const AXIS = 110;
const DAY = 86_400_000;

const SHORT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * The election calendar as a newspaper graphic: dissolution, nomination day,
 * the police poll and polling day on one time axis, with today marked. The
 * axis ends at polling day; the three-month legal limit no longer matters.
 * Every date also appears as text in the accessible description.
 */
export function ElectionTimeline({
  calendar,
  now,
}: {
  calendar: ElectionCalendar;
  now: Date;
}) {
  const start = calendar.dissolved ?? calendar.writs;
  if (!(start && calendar.pollingDay)) return null;
  const t0 = Date.parse(start);
  const t1 = Date.parse(calendar.pollingDay);
  const x = (iso: string) =>
    LEFT + ((Date.parse(iso) - t0) / (t1 - t0)) * (RIGHT - LEFT);
  const stops: {
    above: boolean;
    anchor?: "start" | "middle" | "end";
    iso: string;
    label: string;
    strong: boolean;
  }[] = [
    { iso: start, label: "Dissolved", above: false, strong: false },
    // Two days after dissolution: its label sits above the axis, clear of
    // "Dissolved" below.
    ...(calendar.announcement > start &&
    calendar.announcement < calendar.pollingDay
      ? [
          {
            iso: calendar.announcement,
            label: "Announced",
            above: true,
            strong: false,
          },
        ]
      : []),
    ...(calendar.nominationDay
      ? [
          {
            iso: calendar.nominationDay,
            label: "Nomination day",
            above: false,
            strong: false,
          },
        ]
      : []),
    // Three days before polling day: its label ends at the tick and sits
    // below the axis so it clears "Polling day" above.
    ...(calendar.policePollingDay
      ? [
          {
            iso: calendar.policePollingDay,
            label: "Police poll",
            above: false,
            anchor: "end" as const,
            strong: false,
          },
        ]
      : []),
    {
      iso: calendar.pollingDay,
      label: "Polling day",
      above: true,
      strong: true,
    },
  ];
  const today = grenadaDate(now);
  const showToday = today >= start && today <= calendar.pollingDay;
  const daysToPoll = Math.round(
    (Date.parse(calendar.pollingDay) - Date.parse(today)) / DAY
  );
  const description = stops
    .map((s) => `${s.label}: ${formatIsoDate(s.iso)}`)
    .join("; ");

  return (
    <svg
      aria-label={`Election calendar. ${description}.`}
      className="block h-auto w-full"
      role="img"
      style={{ minWidth: `${W / 16}rem` }}
      viewBox={`0 0 ${W} ${H}`}
    >
      <text
        className="fill-(--el-ink-2) font-semibold text-[14px] uppercase tracking-[0.07em]"
        x={LEFT}
        y={24}
      >
        Road to polling day
      </text>
      {/* The campaign: nomination to polling day, in the flag's three colours. */}
      {calendar.nominationDay && (
        <g>
          {[0, 1, 2].map((i) => {
            const a = x(calendar.nominationDay as string);
            const b = x(calendar.pollingDay as string);
            const w = (b - a) / 3;
            return (
              <rect
                fill={`var(--el-flag-${["red", "gold", "green"][i]})`}
                height={8}
                key={i}
                width={w}
                x={a + i * w}
                y={AXIS - 4}
              />
            );
          })}
        </g>
      )}
      <line
        stroke="var(--el-ink)"
        strokeWidth={2}
        x1={LEFT}
        x2={RIGHT}
        y1={AXIS}
        y2={AXIS}
      />
      {stops.map((s) => {
        const cx = x(s.iso);
        const ty = s.above ? AXIS - 34 : AXIS + 42;
        // The ends anchor inward; polling day and the police poll end at
        // the right edge so their labels stay on the page.
        let anchor: "start" | "middle" | "end" = "middle";
        if (cx < LEFT + 40) anchor = "start";
        else if (cx > RIGHT - 40) anchor = "end";
        if (s.anchor) anchor = s.anchor;
        const tx = cx;
        return (
          <g key={s.label}>
            <line
              stroke="var(--el-ink)"
              x1={cx}
              x2={cx}
              y1={s.above ? AXIS - 22 : AXIS}
              y2={s.above ? AXIS : AXIS + 22}
            />
            <circle
              cx={cx}
              cy={AXIS}
              fill={s.strong ? "var(--el-ink)" : "var(--el-paper)"}
              r={s.strong ? 8 : 6}
              stroke="var(--el-ink)"
              strokeWidth={2}
            />
            <text
              className={
                s.strong
                  ? "fill-(--el-ink) font-bold font-serif text-[20px]"
                  : "fill-(--el-ink) font-semibold font-serif text-[16px]"
              }
              textAnchor={anchor}
              x={tx}
              y={ty}
            >
              {SHORT.format(new Date(s.iso))}
            </text>
            <text
              className="fill-(--el-muted) text-[14px]"
              textAnchor={anchor}
              x={tx}
              y={ty + 18}
            >
              {s.label}
            </text>
          </g>
        );
      })}
      {showToday && (
        <g>
          <line
            stroke="var(--el-flag-red)"
            strokeDasharray="3 3"
            strokeWidth={2}
            x1={x(today)}
            x2={x(today)}
            y1={AXIS - 14}
            y2={AXIS + 14}
          />
          {daysToPoll > 0 && (
            <text
              className="fill-(--el-ink) font-semibold text-[14px]"
              textAnchor="end"
              x={RIGHT}
              y={24}
            >
              {daysToPoll === 1 ? "1 day to go" : `${daysToPoll} days to go`}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
