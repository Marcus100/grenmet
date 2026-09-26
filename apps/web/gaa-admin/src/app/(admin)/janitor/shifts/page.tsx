import { Button } from "@barrelsgd/ui/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JanitorHeader, SiteSwitcher } from "@/components/janitorial/portal";
import { ShiftBoard } from "@/components/janitorial/shift-board";
import {
  getJanitorialAccess,
  getJanitorialCatalogue,
  getJanitorialShiftBoard,
  getJanitorialStaff,
} from "@/db/janitorial/queries";
import { siteParam } from "@/lib/janitorial/catalogue";
import {
  addDays,
  dayLabel,
  grenadaToday,
  weekDays,
  weekStart,
} from "@/lib/janitorial/week";

export const metadata: Metadata = {
  title: "Janitorial shifts",
  description: "Shift patterns, zones and the weekly cleaning roster.",
};

export const dynamic = "force-dynamic";

export default async function JanitorShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const site = siteParam(params.site);
  const today = grenadaToday();
  const start = weekStart(
    typeof params.week === "string" ? params.week : undefined,
    today
  );
  const days = weekDays(start);
  // Failures propagate to (admin)/error.tsx, which reports them and offers retry.
  const access = await getJanitorialAccess();
  if (!access.canView) notFound();
  const [board, catalogue, people] = await Promise.all([
    getJanitorialShiftBoard(site, start, addDays(start, 6)),
    getJanitorialCatalogue(site),
    getJanitorialStaff(),
  ]);
  const current = catalogue.sites.find((value) => value.code === site);
  if (!current) notFound();
  const weekHref = (week: string) =>
    `/janitor/shifts?site=${site}&week=${week}`;

  return (
    <div className="space-y-6">
      <JanitorHeader
        actions={
          <SiteSwitcher
            current={site}
            href={(code) => `/janitor/shifts?site=${code}&week=${start}`}
          />
        }
        crumbs={[{ href: `/janitor?site=${site}`, label: "Janitorial" }]}
        title="Shifts"
      >
        Who covers which zone at {current.name}, week of {dayLabel(start)}.
      </JanitorHeader>

      <nav aria-label="Week" className="flex flex-wrap items-center gap-2">
        <Button
          render={<Link href={weekHref(addDays(start, -7))} />}
          size="sm"
          variant="outline"
        >
          <ChevronLeft data-icon="inline-start" />
          Previous week
        </Button>
        <Button
          render={<Link href={weekHref(weekStart(undefined, today))} />}
          size="sm"
          variant="ghost"
        >
          This week
        </Button>
        <Button
          render={<Link href={weekHref(addDays(start, 7))} />}
          size="sm"
          variant="outline"
        >
          Next week
          <ChevronRight data-icon="inline-end" />
        </Button>
      </nav>

      <ShiftBoard
        assignments={board.assignments}
        buildings={catalogue.buildings}
        canManage={access.canManageShifts}
        days={days}
        patterns={board.patterns}
        siteId={current.id}
        staff={people.staff}
        zones={board.zones}
      />
    </div>
  );
}
