"use client";

import {
  type CalendarEventPublic,
  useListAssignmentsApiV1HrRostersAssignmentsGet,
  useListCalendarEventsApiV1HrCalendarEventsGet,
  useListHolidaysApiV1HrRostersPublicHolidaysGet,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { ButtonGroup } from "@barrelsgd/ui/components/ui/button-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { useCalendarController } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import multiMonthPlugin from "@fullcalendar/react/multimonth";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  XIcon,
} from "lucide-react";
import * as React from "react";
import {
  CALENDAR_VIEWS,
  type CalendarView,
  needsEvents,
  needsRoster,
  rosterScope,
  toEventLayer,
  toHolidayLayer,
  toRosterLayer,
} from "@/components/calendar/calendar-sources";
import { EventCalendarViews } from "@/components/calendar/event-calendar-views";
import { EventDialog } from "@/components/calendar/event-dialog";

const views = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
];

const plugins = [
  dayGridPlugin,
  timeGridPlugin,
  listPlugin,
  interactionPlugin,
  multiMonthPlugin,
];

const iso = (date: Date) => format(date, "yyyy-MM-dd");

export function Calendar() {
  const controller = useCalendarController();
  const [calendarView, setCalendarView] =
    React.useState<CalendarView>("department");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CalendarEventPublic>();
  const [range, setRange] = React.useState(() => {
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  });
  const [dateInfo, setDateInfo] = React.useState(() => {
    const now = new Date();

    return {
      title: format(now, "MMMM yyyy"),
      days: differenceInCalendarDays(endOfMonth(now), startOfMonth(now)) + 1,
    };
  });
  const title = dateInfo.title;
  const days = dateInfo.days;

  // The visible grid overhangs the month on both sides, so pad the request
  // rather than leaving the leading and trailing week empty. The API caps the
  // window at 92 days; a padded month stays well inside that.
  const windowStart = iso(subDays(range.start, 7));
  const windowEnd = iso(addDays(range.end, 7));

  const eventsQuery = useListCalendarEventsApiV1HrCalendarEventsGet(
    { start: windowStart, end: windowEnd },
    { query: { enabled: needsEvents(calendarView) } }
  );
  const rosterQuery = useListAssignmentsApiV1HrRostersAssignmentsGet(
    {
      start: windowStart,
      end: windowEnd,
      scope: rosterScope(calendarView),
    },
    { query: { enabled: needsRoster(calendarView) } }
  );
  const holidaysQuery = useListHolidaysApiV1HrRostersPublicHolidaysGet();

  const departmentEvents = React.useMemo(
    () => eventsQuery.data?.data ?? [],
    [eventsQuery.data?.data]
  );

  const events = React.useMemo(() => {
    const layers = [...toHolidayLayer(holidaysQuery.data?.data ?? [])];
    if (needsEvents(calendarView)) {
      layers.push(...toEventLayer(departmentEvents));
    }
    if (needsRoster(calendarView)) {
      layers.push(
        ...toRosterLayer(rosterQuery.data?.data ?? [], calendarView, {
          showPerson: calendarView !== "mine",
        })
      );
    }
    return layers;
  }, [
    calendarView,
    departmentEvents,
    holidaysQuery.data?.data,
    rosterQuery.data?.data,
  ]);

  const entryCount = events.filter(
    (event) => event.extendedProps.kind !== "holiday"
  ).length;

  function openEvent(eventId: string | undefined) {
    const match = departmentEvents.find(
      (candidate) => candidate.id === eventId
    );
    setEditing(match);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-md border">
      <div className="flex flex-col gap-4 border-b bg-sidebar p-4 text-sidebar-foreground lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <div className="font-medium text-lg leading-none">{title}</div>
          <p className="text-muted-foreground text-sm">
            {days} days - {entryCount} entries
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            items={CALENDAR_VIEWS}
            onValueChange={(value) => {
              if (value !== null) setCalendarView(value as CalendarView);
            }}
            value={calendarView}
          >
            <SelectTrigger className="w-full sm:w-44">
              <CalendarIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                {CALENDAR_VIEWS.map((calendar) => (
                  <SelectItem key={calendar.value} value={calendar.value}>
                    {calendar.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ButtonGroup>
            <Button
              onClick={() => controller.prev()}
              size="icon"
              variant="outline"
            >
              <ChevronLeft />
            </Button>
            <Button onClick={() => controller.today()} variant="outline">
              Today
            </Button>
            <Button
              onClick={() => controller.next()}
              size="icon"
              variant="outline"
            >
              <ChevronRight />
            </Button>
          </ButtonGroup>
          <Select
            items={views}
            onValueChange={(value) => {
              if (value !== null) controller.changeView(value);
            }}
            value={controller.view?.type ?? views[0].value}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectGroup>
                {views.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Add event
          </Button>
        </div>
      </div>

      <EventDialog
        event={editing}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
      />

      <EventCalendarViews
        controller={controller}
        datesSet={(info) => {
          setDateInfo({
            title: info.view.title,
            days: differenceInCalendarDays(
              info.view.currentEnd,
              info.view.currentStart
            ),
          });
          setRange({ start: info.start, end: info.end });
        }}
        eventClick={(info) => {
          if (info.event.extendedProps.kind !== "event") return;
          openEvent(info.event.extendedProps.eventId as string | undefined);
        }}
        events={events}
        initialView={views[0].value}
        nowIndicator
        plugins={[...plugins]}
        popoverCloseContent={() => (
          <XIcon className="size-5 text-muted-foreground group-hover:text-foreground" />
        )}
      />
    </div>
  );
}
