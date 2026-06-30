"use client";

import { Calendar } from "@grenmet/ui/components/ui/calendar";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { startOfMonth, startOfToday } from "date-fns";
import { enGB } from "date-fns/locale";
import * as React from "react";

export function CalendarPanel() {
  const today = startOfToday();
  const [date, setDate] = React.useState<Date | undefined>(today);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(
    startOfMonth(today)
  );

  return (
    <Card className="w-full" size="sm">
      <CardContent>
        <Calendar
          className="w-full p-0"
          fixedWeeks
          locale={enGB}
          mode="single"
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          onSelect={setDate}
          selected={date}
        />
      </CardContent>
    </Card>
  );
}
