import type { Metadata } from "next";
import Link from "next/link";
import { MeteogramPanel } from "@/components/meteogram-chart";
import {
  GuidanceApiError,
  getCatalogue,
  getMeteogram,
  listMyOrganisations,
} from "@/lib/api";
import { compass, formatLocal } from "@/lib/chart";
import { chooseOrganisation, firstParam } from "@/lib/organisations";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Meteogram",
  description: "Point meteogram from ECMWF and NOAA model runs.",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const selectClass = "rounded-md border bg-background px-2 py-1.5 text-sm";

export default async function MeteogramPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await requireSession("/meteogram");
  const organisations = await listMyOrganisations(session.accessToken);
  const organisation = chooseOrganisation(
    organisations,
    firstParam(params.org)
  );

  if (!organisation) {
    return (
      <Message title="No organisation yet">
        You are not a member of an organisation, so there is nothing to show.
        Ask an organisation owner to invite you.
      </Message>
    );
  }
  if (!organisation.entitled) {
    return (
      <Message title="Access is not enabled yet">
        {organisation.name} does not have the GMS Dashboard yet.{" "}
        <Link
          className="underline underline-offset-4"
          href={`/access?org=${encodeURIComponent(organisation.id)}`}
        >
          See the access request status
        </Link>
        .
      </Message>
    );
  }

  const catalogue = await getCatalogue(session.accessToken, organisation.id);
  const point =
    catalogue.points.find((p) => p.key === firstParam(params.point)) ??
    catalogue.points[0];
  const model =
    catalogue.models.find((m) => m.key === firstParam(params.model)) ??
    catalogue.models[0];

  const picker = (
    <form className="flex flex-wrap items-end gap-3" method="get">
      {organisations.length > 1 ? (
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">Organisation</span>
          <select
            className={selectClass}
            defaultValue={organisation.id}
            name="org"
          >
            {organisations
              .filter((o) => o.entitled)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <input name="org" type="hidden" value={organisation.id} />
      )}
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block">Point</span>
        <select className={selectClass} defaultValue={point?.key} name="point">
          {catalogue.points.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block">Model</span>
        <select className={selectClass} defaultValue={model?.key} name="model">
          {catalogue.models.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm"
        type="submit"
      >
        Show
      </button>
    </form>
  );

  const heading = (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Meteogram</h1>
      <p className="bg-muted rounded-md border px-3 py-2 text-sm" role="note">
        {catalogue.disclaimer}
      </p>
      {picker}
    </div>
  );

  if (!(point && model)) {
    return <div className="space-y-4">{heading}</div>;
  }

  let meteogram: Awaited<ReturnType<typeof getMeteogram>> | null = null;
  try {
    meteogram = await getMeteogram(
      session.accessToken,
      organisation.id,
      point.key,
      model.key
    );
  } catch (error) {
    if (!(error instanceof GuidanceApiError && error.status === 404)) {
      throw error;
    }
  }

  if (!meteogram) {
    return (
      <div className="space-y-4">
        {heading}
        <p className="text-muted-foreground text-sm" role="status">
          {catalogue.enabled
            ? `No ${model.label} run has been stored for ${point.name} yet. Runs appear a few hours after each model cycle.`
            : "Model fetching is switched off at the moment, so no runs are available."}
        </p>
      </div>
    );
  }

  const { series, units } = meteogram;
  const times = series.valid_times.map((t) => Date.parse(t));
  const stride = rowStride(times);

  return (
    <div className="space-y-6">
      {heading}
      <p className="text-sm">
        <strong>{meteogram.label}</strong> run of{" "}
        {formatLocal(Date.parse(meteogram.run_time))}, for{" "}
        {meteogram.point.name} ({meteogram.point.latitude.toFixed(3)},{" "}
        {meteogram.point.longitude.toFixed(3)}; nearest model grid cell).
      </p>

      <MeteogramPanel
        series={[
          {
            kind: "line",
            label: "2 m temperature",
            tone: "primary",
            values: series.temperature_c,
          },
        ]}
        times={times}
        title="Temperature"
        unit={units.temperature_c}
      />
      <MeteogramPanel
        series={[
          {
            kind: "bar",
            label: "Precipitation",
            tone: "primary",
            values: series.precipitation_mm,
          },
        ]}
        times={times}
        title="Precipitation"
        unit={units.precipitation_mm}
      />
      <MeteogramPanel
        series={[
          {
            kind: "line",
            label: "10 m wind",
            tone: "primary",
            values: series.wind_speed_ms,
          },
          {
            kind: "line",
            label: "gust",
            tone: "muted",
            values: series.wind_gust_ms,
          },
        ]}
        times={times}
        title="Wind"
        unit={units.wind_speed_ms}
      />
      <MeteogramPanel
        series={[
          {
            kind: "line",
            label: "Mean sea level pressure",
            tone: "primary",
            values: series.mslp_hpa,
          },
        ]}
        times={times}
        title="Pressure"
        unit={units.mslp_hpa}
      />
      <MeteogramPanel
        series={[
          {
            kind: "bar",
            label: "Total cloud cover",
            tone: "muted",
            values: series.cloud_cover_pct,
          },
        ]}
        times={times}
        title="Cloud cover"
        unit={units.cloud_cover_pct}
      />

      <table className="w-full text-left text-sm">
        <caption className="pb-2 text-left font-medium">
          Values every few hours
        </caption>
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-normal" scope="col">
              Time
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              Temp
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              Wind
            </th>
            <th className="py-1 pr-3 font-normal" scope="col">
              Rain
            </th>
          </tr>
        </thead>
        <tbody>
          {times.map((time, index) =>
            index % stride === 0 && index / stride < 12 ? (
              <tr className="border-t" key={time}>
                <td className="py-1 pr-3">{formatLocal(time)}</td>
                <td className="py-1 pr-3">
                  {cell(series.temperature_c[index], "°C")}
                </td>
                <td className="py-1 pr-3">
                  {windCell(
                    series.wind_speed_ms[index],
                    series.wind_direction_deg[index]
                  )}
                </td>
                <td className="py-1 pr-3">
                  {cell(series.precipitation_mm[index], " mm")}
                </td>
              </tr>
            ) : null
          )}
        </tbody>
      </table>

      <p className="text-muted-foreground text-xs">{meteogram.attribution}</p>
    </div>
  );
}

function Message({
  children,
  title,
}: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-2xl">{children}</p>
    </section>
  );
}

/** Rows about six hours apart, whatever the model's step. */
function rowStride(times: readonly number[]): number {
  const first = times[0];
  const second = times[1];
  if (first === undefined || second === undefined) return 1;
  const stepHours = (second - first) / 3_600_000;
  return Math.max(1, Math.round(6 / Math.max(stepHours, 1)));
}

function cell(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? "-" : `${value}${unit}`;
}

function windCell(
  speed: number | null | undefined,
  direction: number | null | undefined
): string {
  if (speed === null || speed === undefined) return "-";
  const from =
    direction === null || direction === undefined
      ? ""
      : ` from ${compass(direction)}`;
  return `${speed} m/s${from}`;
}
