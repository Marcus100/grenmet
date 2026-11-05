import { cn } from "@barrelsgd/ui/lib/utils";
import { Flag } from "@/components/flag";
import type { ElectionCalendar } from "@/data/election-2026";
import { formatIsoDate } from "@/lib/format";

/** Dissolution, announcement, nomination day and polling day (the legal deadline only until polling day is set). */
/** Grid columns from `lg` up: keep rows balanced for 4, 5 and 6+ dates. */
function largeColumns(count: number) {
  if (count > 5) {
    return "lg:grid-cols-3";
  }
  if (count > 4) {
    return "lg:grid-cols-5";
  }
  return "lg:grid-cols-4";
}

export function KeyDates({ calendar }: { calendar: ElectionCalendar }) {
  const dates: {
    label: string;
    value: string;
    note?: string;
    unverified?: string;
  }[] = [
    ...(calendar.dissolved
      ? [
          {
            label: "Parliament dissolved",
            value: formatIsoDate(calendar.dissolved),
            note: "By proclamation of the Governor-General",
          },
        ]
      : []),
    calendar.writs
      ? {
          label: "Writs issued",
          value: formatIsoDate(calendar.writs),
          note: "Dates gazetted by the Supervisor of Elections",
        }
      : {
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
    ...(calendar.policePollingDay
      ? [
          {
            label: "Police special poll",
            value: formatIsoDate(calendar.policePollingDay),
            note: "Announced by the Prime Minister",
          },
        ]
      : []),
    {
      label: "Polling day",
      value: calendar.pollingDay
        ? formatIsoDate(calendar.pollingDay)
        : "To be announced",
    },
    ...(calendar.pollingDay
      ? []
      : [
          {
            label: "Latest possible",
            value: formatIsoDate(calendar.deadline),
            note: calendar.dissolved
              ? "Within three months of the dissolution (Constitution, s. 53(1))"
              : "Five years from the first sitting, plus three months (Constitution, ss. 52–53)",
            unverified: calendar.dissolved
              ? undefined
              : "Five years from the first sitting on 31 August 2022 (Wikipedia), plus three months. The first sitting needs confirming from the House Hansard.",
          },
        ]),
  ];
  return (
    <dl
      className={cn(
        "border-el-rule bg-el-rule grid gap-px border sm:grid-cols-2",
        largeColumns(dates.length)
      )}
    >
      {dates.map((d) => (
        <div className="bg-background p-4" key={d.label}>
          <dt className="text-el-muted text-sm font-semibold tracking-[0.07em] uppercase">
            {d.label}
          </dt>
          <dd className="mt-1 font-serif text-xl font-bold">
            {d.value}
            {d.unverified && <Flag note={d.unverified} status="unverified" />}
          </dd>
          {d.note && <dd className="text-el-muted mt-1 text-base">{d.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
