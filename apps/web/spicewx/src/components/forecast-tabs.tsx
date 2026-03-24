"use client";

import { Tabs } from "@base-ui-components/react/tabs";
import { cn } from "@/lib/utils";
import { SmallWeatherIcon } from "./weather-icon";

interface HourlyEntry {
  condition:
    | "sunny"
    | "partly-cloudy"
    | "cloudy"
    | "rain"
    | "storm"
    | "clear-night";
  pop: number; // probability of precipitation %
  temp: number;
  time: string;
}

interface DailyEntry {
  condition:
    | "sunny"
    | "partly-cloudy"
    | "cloudy"
    | "rain"
    | "storm"
    | "clear-night";
  date: string;
  day: string;
  high: number;
  humidity: number;
  low: number;
  pop: number;
  wind: string;
}

const hourlyToday: HourlyEntry[] = [
  { time: "Now", temp: 27, condition: "partly-cloudy", pop: 10 },
  { time: "1 PM", temp: 28, condition: "partly-cloudy", pop: 15 },
  { time: "2 PM", temp: 29, condition: "sunny", pop: 5 },
  { time: "3 PM", temp: 29, condition: "sunny", pop: 5 },
  { time: "4 PM", temp: 28, condition: "partly-cloudy", pop: 20 },
  { time: "5 PM", temp: 27, condition: "partly-cloudy", pop: 30 },
  { time: "6 PM", temp: 26, condition: "rain", pop: 55 },
  { time: "7 PM", temp: 25, condition: "rain", pop: 60 },
  { time: "8 PM", temp: 25, condition: "partly-cloudy", pop: 25 },
  { time: "9 PM", temp: 24, condition: "partly-cloudy", pop: 15 },
  { time: "10 PM", temp: 24, condition: "clear-night", pop: 5 },
  { time: "11 PM", temp: 23, condition: "clear-night", pop: 5 },
];

const hourlyTomorrow: HourlyEntry[] = [
  { time: "12 AM", temp: 23, condition: "clear-night", pop: 5 },
  { time: "3 AM", temp: 22, condition: "clear-night", pop: 5 },
  { time: "6 AM", temp: 22, condition: "partly-cloudy", pop: 10 },
  { time: "9 AM", temp: 25, condition: "sunny", pop: 5 },
  { time: "12 PM", temp: 28, condition: "sunny", pop: 5 },
  { time: "3 PM", temp: 30, condition: "sunny", pop: 10 },
  { time: "6 PM", temp: 28, condition: "partly-cloudy", pop: 20 },
  { time: "9 PM", temp: 25, condition: "partly-cloudy", pop: 15 },
];

const weeklyForecast: DailyEntry[] = [
  {
    day: "Today",
    date: "Mon 23",
    condition: "partly-cloudy",
    high: 29,
    low: 23,
    pop: 40,
    wind: "ENE 18",
    humidity: 82,
  },
  {
    day: "Tue",
    date: "Mar 24",
    condition: "sunny",
    high: 30,
    low: 24,
    pop: 10,
    wind: "E 15",
    humidity: 75,
  },
  {
    day: "Wed",
    date: "Mar 25",
    condition: "rain",
    high: 27,
    low: 22,
    pop: 70,
    wind: "ESE 20",
    humidity: 88,
  },
  {
    day: "Thu",
    date: "Mar 26",
    condition: "partly-cloudy",
    high: 28,
    low: 23,
    pop: 30,
    wind: "ENE 16",
    humidity: 80,
  },
  {
    day: "Fri",
    date: "Mar 27",
    condition: "sunny",
    high: 30,
    low: 24,
    pop: 5,
    wind: "E 14",
    humidity: 72,
  },
  {
    day: "Sat",
    date: "Mar 28",
    condition: "partly-cloudy",
    high: 29,
    low: 24,
    pop: 20,
    wind: "NE 15",
    humidity: 76,
  },
  {
    day: "Sun",
    date: "Mar 29",
    condition: "sunny",
    high: 31,
    low: 25,
    pop: 5,
    wind: "E 13",
    humidity: 70,
  },
];

export function ForecastTabs() {
  return (
    <Tabs.Root className="w-full" defaultValue="today">
      <Tabs.List className="mb-4 flex gap-1 rounded-xl bg-secondary/60 p-1">
        {[
          { value: "today", label: "Today" },
          { value: "tomorrow", label: "Tomorrow" },
          { value: "week", label: "This Week" },
        ].map(({ value, label }) => (
          <Tabs.Tab
            className={cn(
              "flex-1 cursor-pointer rounded-lg px-3 py-2 font-medium text-sm transition-all",
              "text-muted-foreground hover:text-foreground",
              "data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm"
            )}
            key={value}
            value={value}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Tabs.Panel value="today">
        <HourlyRow entries={hourlyToday} />
      </Tabs.Panel>

      <Tabs.Panel value="tomorrow">
        <HourlyRow entries={hourlyTomorrow} />
      </Tabs.Panel>

      <Tabs.Panel value="week">
        <WeeklyTable entries={weeklyForecast} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

function HourlyRow({ entries }: { entries: HourlyEntry[] }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {entries.map((entry) => (
          <div
            className="flex min-w-[72px] flex-col items-center gap-2 rounded-xl bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/80"
            key={entry.time}
          >
            <span className="whitespace-nowrap font-medium text-muted-foreground text-xs">
              {entry.time}
            </span>
            <SmallWeatherIcon className="text-xl" condition={entry.condition} />
            <span className="font-bold text-foreground">{entry.temp}°</span>
            {entry.pop > 20 && (
              <span className="font-medium text-blue-500 text-xs">
                {entry.pop}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyTable({ entries }: { entries: DailyEntry[] }) {
  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <div
          className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-secondary/50"
          key={entry.date}
        >
          <div className="w-20 shrink-0">
            <div className="font-semibold text-foreground text-sm">
              {entry.day}
            </div>
            <div className="text-muted-foreground text-xs">{entry.date}</div>
          </div>
          <SmallWeatherIcon condition={entry.condition} />
          <div className="hidden flex-1 text-muted-foreground text-xs sm:block">
            {entry.pop > 0 && (
              <span className="text-blue-500">{entry.pop}% rain</span>
            )}
          </div>
          <div className="hidden w-20 shrink-0 text-muted-foreground text-xs md:block">
            💨 {entry.wind} mph
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="font-bold text-foreground">{entry.high}°</span>
            <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-border sm:block">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-amber-400"
                style={{ width: `${((entry.high - 20) / 15) * 100}%` }}
              />
            </div>
            <span className="text-muted-foreground">{entry.low}°</span>
          </div>
        </div>
      ))}
    </div>
  );
}
