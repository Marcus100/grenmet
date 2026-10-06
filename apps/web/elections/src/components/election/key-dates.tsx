import { cn } from "@barrelsgd/ui/lib/utils";
import { Flag } from "@/components/flag";
import type { ElectionCalendar } from "@/data/election-2026";
import { formatIsoDate } from "@/lib/format";

/** Dissolution, announcement, nomination day and polling day (the legal deadline only until polling day is set). */
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
        "grid gap-px border border-el-rule bg-el-rule sm:grid-cols-2",
        dates.length > 5
          ? "lg:grid-cols-3"
          : dates.length > 4
            ? "lg:grid-cols-5"
            : "lg:grid-cols-4"
      )}
    >
      {dates.map((d) => (
        <div className="bg-background p-4" key={d.label}>
          <dt className="font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
            {d.label}
          </dt>
          <dd className="mt-1 font-bold font-serif text-xl">
            {d.value}
            {d.unverified && <Flag note={d.unverified} status="unverified" />}
          </dd>
          {d.note && <dd className="mt-1 text-base text-el-muted">{d.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
