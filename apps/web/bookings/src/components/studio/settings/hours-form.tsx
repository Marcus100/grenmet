"use client";

import type { BookingWorkingPeriodPublic } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useActionState } from "react";
import { saveHoursAction } from "@/app/studio/[orgSlug]/settings/actions";
import { hhmm, periodsByDay, rowsForDay, WEEKDAYS } from "@/lib/settings-view";
import { IDLE } from "@/lib/studio-action-state";
import { useHydrated } from "@/lib/use-hydrated";
import { INPUT, keepTyped, SettingsResult } from "./settings-ui";

/**
 * A provider's whole week. Two or more rows a day make a break between them;
 * a day with every row empty is a day off. Times are on the business clock.
 */
export function HoursForm({
  hours,
  orgSlug,
  providerId,
  zone,
}: {
  hours: BookingWorkingPeriodPublic[];
  orgSlug: string;
  providerId: string;
  zone: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveHoursAction.bind(null, orgSlug),
    IDLE
  );
  const days = periodsByDay(hours);
  // Save waits for hydration: before it, a native submit would send the form
  // to a GET URL with the typed values in it.
  const hydrated = useHydrated();
  return (
    <form className="space-y-4" onSubmit={keepTyped(formAction)}>
      <input name="providerId" type="hidden" value={providerId} />
      <p className="text-muted-foreground text-sm">
        Times are on the business clock ({zone}). Leave a day empty for a day
        off; use a second row for the time after a break.
      </p>
      <div className="space-y-4">
        {WEEKDAYS.map((weekday, day) => {
          const periods = days[day] ?? [];
          const rows = Array.from(
            { length: rowsForDay(periods.length) },
            (_, row) => row
          );
          return (
            <fieldset className="space-y-2" key={weekday}>
              <legend className="font-medium">{weekday}</legend>
              {rows.map((row) => {
                const period = periods[row];
                const id = `hours-${providerId}-${day}-${row}`;
                return (
                  <div className="flex flex-wrap items-center gap-2" key={row}>
                    <label className="sr-only" htmlFor={`${id}-start`}>
                      {weekday} opens, period {row + 1}
                    </label>
                    <Input
                      className={`${INPUT} w-32`}
                      defaultValue={period ? hhmm(period.start_time) : ""}
                      id={`${id}-start`}
                      name={`hours-${day}-${row}-start`}
                      type="time"
                    />
                    <span aria-hidden="true">to</span>
                    <label className="sr-only" htmlFor={`${id}-end`}>
                      {weekday} closes, period {row + 1}
                    </label>
                    <Input
                      className={`${INPUT} w-32`}
                      defaultValue={period ? hhmm(period.end_time) : ""}
                      id={`${id}-end`}
                      name={`hours-${day}-${row}-end`}
                      type="time"
                    />
                  </div>
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <SettingsResult pending={pending} state={state} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending || !hydrated}
        size="touch"
        type="submit"
      >
        {pending ? "Saving..." : "Save weekly hours"}
      </Button>
    </form>
  );
}
