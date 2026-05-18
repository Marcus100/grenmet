export interface ForecastDay {
  date: number;
  dayName: string;
  isToday: boolean;
  month: string;
  slug: string; // YYYY-MM-DD, used as the [date] URL segment
}

export function getForecastDays(): ForecastDay[] {
  const today = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: d.getDate(),
      dayName: d.toLocaleString("en-US", { weekday: "short" }),
      month: d.toLocaleString("en-US", { month: "short" }),
      slug: d.toISOString().slice(0, 10),
      isToday: i === 0,
    };
  });
}

export function getUpcomingDaySlugs(): string[] {
  return getForecastDays()
    .slice(1)
    .map((d) => d.slug);
}
