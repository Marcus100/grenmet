"use client";

import {
  eregisterCreateRegisterObservation,
  eregisterListRegisterObservations,
  eregisterValidateSynopObservation,
  type RegisterObservationRead,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Droplets, Thermometer, ThermometerSnowflake } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { REGISTER_KEYS, REGISTER_SECTIONS } from "./eregister-layout";
import { observerInitials } from "./eregister-observer";
import { tenthsToCelsius } from "./eregister-readings";
import {
  LatestReports,
  type ReportKind,
  type ReportRow,
} from "./eregister-reports";
import { observationTime } from "./eregister-time";
import {
  GRID_CELL,
  HEAD_ROW,
  RegisterTable,
  SectionCard,
  SummaryHead,
} from "./eregister-ui";
import { ERegisterWorkbook } from "./eregister-workbook";

// Modernised Meteorological Observations eRegister (station 78958, MBIA).
// The register is backed by the dedicated FastAPI eRegister database; the
// representative rows remain visible when that service is unavailable.

const STATION = {
  name: "Maurice Bishop International Airport",
  number: "78958",
  icao: "TGPY",
  position: "12.0°N · 61.47°W",
  date: "Tue 07 Jul 2026",
  hour: "23:00 UTC",
};

// Daily summary grid — synoptic-hour readings as rows, elements as columns.
const DAILY_SUMMARY = [
  { id: "d00", hour: "00:00", rain: "0.0", max: "27.9", min: "25.1" },
  { id: "d06", hour: "06:00", rain: "0.2", max: "26.1", min: "24.6" },
  { id: "d12", hour: "12:00", rain: "1.4", max: "30.2", min: "25.8" },
  { id: "d18", hour: "18:00", rain: "0.0", max: "30.2", min: "25.4" },
];

const DAILY_TOTALS = { rain: "1.6", max: "30.2", min: "24.6" };

const METAR = "TGPY 072300Z 07010G18KT 9999 FEW018 SCT300 25/23 Q1015 NOSIG";

// Sample latest SYNOP workbook, shown until a live record is available.
const SAMPLE_LATEST: Record<string, string> = {
  report_type: "AAXX",
  day: "07",
  time_utc: "23",
  station_id: "78958",
  wind_indicator: "4",
  precip_indicator: "4",
  station_wx_indicator: "1",
  cloud_base: "4",
  visibility: "65",
  total_cloud: "6",
  wind_dir: "07",
  wind_speed: "10",
  wind_gust: "18",
  air_temp: "0254",
  dew_point: "0228",
  relative_humidity: "86",
  station_pressure: "0135",
  msl_pressure: "0149",
  precip_amount: "000",
  precip_period: "1",
  present_wx: "05",
  past_wx_1: "8",
  past_wx_2: "2",
  low_cloud_amount: "6",
  low_cloud_type: "8",
  mid_cloud_type: "7",
  high_cloud_type: "/",
  s3_state_of_sky: "0",
  s3_max_temp: "0302",
  s3_min_temp: "0246",
  s3_baro_change_24h: "9010",
  s3_rainfall_24h: "0004",
  s3_layer1_amount: "1",
  s3_layer1_form: "8",
  s3_layer1_height: "18",
  s3_layer2_amount: "6",
  s3_layer2_form: "0",
  s3_layer2_height: "77",
  s3_special_phenomena: "909",
};

const SAMPLE_REPORTS: Record<ReportKind, ReportRow[]> = {
  SYNOP: [
    {
      id: "l23",
      observed: "2026-07-07 23:00",
      message:
        "AAXX 07234 78958 41465 82010 10254 20228 30135 40149 60001 70582 86870 333 10302 20246 59010 70004 81818 909//",
    },
    {
      id: "l22",
      observed: "2026-07-07 22:00",
      message:
        "AAXX 07224 78958 41464 82011 10256 20229 30134 40148 60001 70282 86870 333 81818",
    },
    {
      id: "l21",
      observed: "2026-07-07 21:00",
      message:
        "AAXX 07214 78958 41465 82013 10259 20230 30133 40147 60001 70282 85870 333 81717",
    },
  ],
  METAR: [{ id: "m23", observed: "2026-07-07 23:00", message: METAR }],
  SPECI: [],
};

function toReportRows(
  observations: readonly RegisterObservationRead[]
): ReportRow[] {
  return observations.map((observation) => ({
    id: observation.id,
    observed: observation.observed_at
      ? new Date(observation.observed_at)
          .toISOString()
          .slice(0, 16)
          .replace("T", " ")
      : "Unknown",
    message: observation.raw_tac ?? `Structured ${observation.kind} record`,
  }));
}

const OKTA_WORDS = [
  "NSC",
  "FEW",
  "FEW",
  "SCT",
  "SCT",
  "BKN",
  "BKN",
  "BKN",
  "OVC",
];

function metarTemperature(group: string | undefined): string {
  const value = tenthsToCelsius(group);
  if (value === null) return "//";
  const rounded = Math.round(Math.abs(value)).toString().padStart(2, "0");
  return value < 0 ? `M${rounded}` : rounded;
}

// Illustrative METAR line built from the coded workbook entries; the API owns
// validation and decoding, this only previews them.
function metarFromCoded(iso: string, v: Record<string, string>): string {
  const dd = v.wind_dir ?? "";
  const direction = dd === "99" ? "VRB" : `${dd.padStart(2, "0")}0`;
  const speed = Number(v.wind_speed ?? "");
  const knots = ["0", "1"].includes(v.wind_indicator ?? "")
    ? Math.round(speed * 1.943_84)
    : speed;
  const vv = Number(v.visibility ?? "");
  let visibility = "////";
  if (v.visibility) {
    visibility =
      vv >= 60
        ? "9999"
        : String(vv <= 50 ? vv * 100 : (vv - 50) * 1000).padStart(4, "0");
  }
  const total = Number(v.total_cloud ?? "");
  const layer = Number(v.s3_layer1_height ?? "");
  const height = Number.isNaN(layer)
    ? "///"
    : String(Math.round((layer * 30 * 3.280_84) / 100)).padStart(3, "0");
  const cloud =
    total === 0
      ? "NSC"
      : `${OKTA_WORDS[total] ?? "///"}${v.s3_layer1_height ? height : "///"}`;
  const group = Number(v.msl_pressure ?? "");
  const qnh = Number.isNaN(group)
    ? "////"
    : String(Math.round(group / 10 + (group >= 5000 ? 0 : 1000)));
  return `TGPY ${iso.slice(8, 10)}${iso.slice(11, 15)}Z ${direction}${String(knots).padStart(2, "0")}KT ${visibility} ${cloud} ${metarTemperature(v.air_temp)}/${metarTemperature(v.dew_point)} Q${qnh}`;
}

const REGISTER_DEFAULTS: Record<string, string> = Object.fromEntries(
  REGISTER_KEYS.map((key) => [key, ""])
);

export function ERegister() {
  const sessionUser = useSessionUser();
  const observer =
    sessionUser.full_name || sessionUser.email || "Signed-in user";
  const station = { ...STATION, observer };
  const [view, setView] = useState<"archive" | "new">("archive");
  const [liveObservations, setLiveObservations] = useState<
    RegisterObservationRead[]
  >([]);
  const [structuredValues, setStructuredValues] = useState<
    Record<string, string>
  >({
    ...REGISTER_DEFAULTS,
    report_type: "AAXX",
    day: String(new Date().getUTCDate()).padStart(2, "0"),
    time_utc: String(new Date().getUTCHours()).padStart(2, "0"),
    station_id: STATION.number,
    observer_initials: observerInitials(sessionUser.full_name),
    wind_indicator: "4",
    wind_dir: "07",
    wind_speed: "10",
    visibility: "60",
    total_cloud: "6",
    air_temp: "0254",
    dew_point: "0230",
    station_pressure: "0135",
    msl_pressure: "0149",
  });
  const observationDate = observationTime(
    structuredValues.day,
    structuredValues.time_utc
  );
  const observedAt = observationDate.toISOString().slice(0, 16);
  const [validationIssues, setValidationIssues] = useState<
    { field: string; message: string; severity?: "error" | "warning" }[]
  >([]);
  const [validationState, setValidationState] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [liveState, setLiveState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [liveAviation, setLiveAviation] = useState<
    Record<"METAR" | "SPECI", RegisterObservationRead[]>
  >({ METAR: [], SPECI: [] });

  useEffect(() => {
    let active = true;
    const load = (kind: ReportKind) =>
      eregisterListRegisterObservations({
        query: { kind, station_id: STATION.number, limit: 24 },
        throwOnError: false,
      });
    Promise.all([load("SYNOP"), load("METAR"), load("SPECI")])
      .then(([synop, metar, speci]) => {
        if (!active) return;
        if (synop.error || !synop.data) {
          setLiveState("unavailable");
          return;
        }
        setLiveObservations(synop.data.observations);
        setLiveAviation({
          METAR: metar.data?.observations ?? [],
          SPECI: speci.data?.observations ?? [],
        });
        setLiveState("ready");
      })
      .catch(() => {
        if (active) setLiveState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  async function runValidation(): Promise<boolean> {
    setValidationState("checking");
    const result = await eregisterValidateSynopObservation({
      body: { workbook: structuredValues },
      throwOnError: false,
    });
    if (result.error || !result.data) {
      setValidationState("error");
      return false;
    }
    setValidationIssues(result.data.issues ?? []);
    setValidationState(result.data.valid ? "valid" : "invalid");
    return result.data.valid;
  }

  async function validateDraft() {
    await runValidation();
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    // Errors block saving; warnings only advise.
    if (!(await runValidation())) {
      setSaveState("idle");
      return;
    }
    const result = await eregisterCreateRegisterObservation({
      body: {
        station_id: STATION.number,
        station_name: STATION.name,
        aerodrome_icao: STATION.icao,
        kind: "SYNOP",
        observed_at: observationDate.toISOString(),
        body: {
          ...structuredValues,
          source: "eregister-workbook",
          validation: "pending_wmo_encoder",
        },
        raw_tac: null,
      },
      throwOnError: false,
    });
    if (result.error || !result.data) {
      setSaveState("error");
      return;
    }
    setSaveState("saved");
    setLiveObservations((current) => [result.data, ...current].slice(0, 24));
    setLiveState("ready");
  }

  const live = liveState === "ready";
  const reports: Record<ReportKind, readonly ReportRow[]> = live
    ? {
        SYNOP: toReportRows(liveObservations),
        METAR: toReportRows(liveAviation.METAR),
        SPECI: toReportRows(liveAviation.SPECI),
      }
    : SAMPLE_REPORTS;
  const latestBody = liveObservations[0]?.body;
  const latestValues: Record<string, string> =
    live && latestBody
      ? Object.fromEntries(
          Object.entries(latestBody).map(([key, value]) => [
            key,
            typeof value === "string" ? value : "",
          ])
        )
      : SAMPLE_LATEST;

  if (view === "new") {
    const iso = observationDate.toISOString();
    const metarPreview = metarFromCoded(iso, structuredValues);

    return (
      <ERegisterWorkbook
        issues={validationIssues}
        metarPreview={metarPreview}
        observedAt={observedAt}
        onBack={() => setView("archive")}
        onSubmit={saveDraft}
        onValidate={validateDraft}
        onValidationIssuesChange={setValidationIssues}
        onValidationStateChange={setValidationState}
        onValueChange={(key, value) =>
          setStructuredValues((current) => ({ ...current, [key]: value }))
        }
        saveStatus={saveState}
        station={station}
        validationStatus={validationState}
        values={structuredValues}
      />
    );
  }

  const lastObserved =
    live && liveObservations[0]?.observed_at
      ? `${new Date(liveObservations[0].observed_at).toISOString().slice(0, 16).replace("T", " ")} UTC`
      : `${STATION.date} · ${STATION.hour}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Station header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            Weather Electronic Register
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setView("archive")}
            size="lg"
            variant={view === "archive" ? "default" : "outline"}
          >
            Observation archive
          </Button>
          <Button onClick={() => setView("new")} size="lg" variant="outline">
            New observation
          </Button>
        </div>
      </div>

      {/* Last observation: Section 0 (station card on its right), then Sections 1 and 3 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-stretch gap-4">
          {REGISTER_SECTIONS.slice(0, 1).map((section) => (
            <RegisterTable
              key={section.title}
              section={section}
              values={latestValues}
            />
          ))}
          <SectionCard className="w-fit max-w-full" title="Observation">
            <dl className="space-y-3 p-4 text-sm">
              <div>
                <dt className="font-medium">{STATION.name}</dt>
                <dd className="text-muted-foreground">
                  Station {STATION.number} ({STATION.icao}) · {STATION.position}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last observation</dt>
                <dd className="font-medium tabular-nums">{lastObserved}</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
        {REGISTER_SECTIONS.slice(1).map((section) => (
          <RegisterTable
            key={section.title}
            section={section}
            values={latestValues}
          />
        ))}
      </div>

      {/* Daily summaries beside the latest reports */}
      <div className="flex flex-wrap items-start gap-6">
        <SectionCard
          action={
            <span className="text-muted-foreground text-xs">
              Station day 12–12 UTC
            </span>
          }
          className="w-fit max-w-full"
          title="Daily Summaries"
        >
          <Table>
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={cn(GRID_CELL, "px-3.5")}>
                  Hour (UTC)
                </TableHead>
                <TableHead className={cn(GRID_CELL, "px-3.5 text-right")}>
                  <SummaryHead icon={Droplets} label="Rainfall" unit="mm" />
                </TableHead>
                <TableHead className={cn(GRID_CELL, "px-3.5 text-right")}>
                  <SummaryHead
                    icon={Thermometer}
                    label="Maximum temperature"
                    unit="°C"
                  />
                </TableHead>
                <TableHead className="px-3.5 text-right">
                  <SummaryHead
                    icon={ThermometerSnowflake}
                    label="Minimum temperature"
                    unit="°C"
                  />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DAILY_SUMMARY.map((row) => (
                <TableRow key={row.id}>
                  <TableCell
                    className={cn(GRID_CELL, "px-3.5 font-medium tabular-nums")}
                  >
                    {row.hour}
                  </TableCell>
                  <TableCell
                    className={cn(
                      GRID_CELL,
                      "px-3.5 text-right font-mono tabular-nums"
                    )}
                  >
                    {row.rain}
                  </TableCell>
                  <TableCell
                    className={cn(
                      GRID_CELL,
                      "px-3.5 text-right font-mono tabular-nums"
                    )}
                  >
                    {row.max}
                  </TableCell>
                  <TableCell className="px-3.5 text-right font-mono tabular-nums">
                    {row.min}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-muted/50">
                <TableCell className={cn(GRID_CELL, "px-3.5")}>
                  Daily 12–12
                </TableCell>
                <TableCell
                  className={cn(
                    GRID_CELL,
                    "px-3.5 text-right font-mono tabular-nums"
                  )}
                >
                  {DAILY_TOTALS.rain}
                </TableCell>
                <TableCell
                  className={cn(
                    GRID_CELL,
                    "px-3.5 text-right font-mono tabular-nums"
                  )}
                >
                  {DAILY_TOTALS.max}
                </TableCell>
                <TableCell className="px-3.5 text-right font-mono tabular-nums">
                  {DAILY_TOTALS.min}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </SectionCard>
        <div className="min-w-80 flex-1">
          <LatestReports reports={reports} sample={!live} />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Showing the latest saved records. QC approval and WIS2box publication
        remain separate, explicit steps.
      </p>
    </div>
  );
}
