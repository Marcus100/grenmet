import { ForecastRefresh } from "@/components/forecast-refresh";

/**
 * The dated weather surface — `/`, `/weather`, `/weather/YYYY/MM/DD` and the
 * per-location `/<place>` routes. Each page renders `WeatherSurface` for its
 * place (takeover + sky hero), because a layout here cannot see the
 * `[location]` segment below it.
 */
export default function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ForecastRefresh />
      {children}
    </>
  );
}
