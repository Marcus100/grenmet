import { Flag } from "@/components/flag";
import type { ElectionCalendar } from "@/data/election-2026";
import { formatIsoDate } from "@/lib/format";

/** Announcement, nomination day, polling day and the legal deadline. */
export function KeyDates({ calendar }: { calendar: ElectionCalendar }) {
  const dates: {
    label: string;
    value: string;
    note?: string;
    unverified?: string;
  }[] = [
    {
      label: "Date announced",
      value: formatIsoDate(calendar.announcement),
      note: "At an event in St. Mark",
    },
    {
      label: "Nomination day",
      value: calendar.nominationDay
        ? formatIsoDate(calendar.nominationDay)
        : "To be proclaimed",
    },
    {
      label: "Polling day",
      value: calendar.pollingDay
        ? formatIsoDate(calendar.pollingDay)
        : "To be announced",
    },
    {
      label: "Latest possible",
      value: formatIsoDate(calendar.deadline),
      note: "Five years from the first sitting, plus 90 days",
      unverified:
        "Five years from the first sitting on 31 August 2022 (Wikipedia), plus 90 days. The first sitting needs confirming from the House Hansard.",
    },
  ];
  return (
    <dl className="grid gap-px border border-el-rule bg-el-rule sm:grid-cols-2 lg:grid-cols-4">
      {dates.map((d) => (
        <div className="bg-background p-4" key={d.label}>
          <dt className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
            {d.label}
          </dt>
          <dd className="mt-1 font-bold font-serif text-xl">
            {d.value}
            {d.unverified && <Flag note={d.unverified} status="unverified" />}
          </dd>
          {d.note && <dd className="mt-1 text-el-muted text-sm">{d.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
