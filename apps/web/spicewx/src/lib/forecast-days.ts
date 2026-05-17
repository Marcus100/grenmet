export interface ForecastDay {
  date: number;
  isToday: boolean;
  label: string | null;
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
      month: d.toLocaleString("en-US", { month: "long" }),
      label: i === 0 ? "Now" : null,
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
