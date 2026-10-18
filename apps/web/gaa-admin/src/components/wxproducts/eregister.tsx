"use client";

import {
  eregisterCreateRegisterObservation,
  eregisterListRegisterObservations,
  eregisterValidateSynopObservation,
  type RegisterObservationRead,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { type FormEvent, useEffect, useState } from "react";
import { REGISTER_KEYS, REGISTER_SECTIONS } from "./eregister-layout";
import { observerInitials } from "./eregister-observer";
import { tenthsToCelsius } from "./eregister-readings";
import {
  LatestReports,
  type LiveState,
  type ReportKind,
  type ReportRow,
} from "./eregister-reports";
import { observationTime } from "./eregister-time";
import { RegisterTable, SectionCard } from "./eregister-ui";
import { ERegisterWorkbook } from "./eregister-workbook";

// Modernised Meteorological Observations eRegister (station 78958, MBIA).
// The register is backed by the dedicated FastAPI eRegister database. Until a
// live read succeeds the page shows loading, empty or error states; it never
// shows sample observations as if they were recorded.

const STATION = {
  name: "Maurice Bishop International Airport",
  number: "78958",
  icao: "TGPY",
  position: "12.0°N · 61.47°W",
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

function lastObservedLabel(
  state: LiveState,
  latest: RegisterObservationRead | undefined
): string {
  if (state === "loading") return "Loading…";
  if (state === "unavailable") return "Unavailable";
  if (!latest?.observed_at) return "No saved observations yet";
  return `${new Date(latest.observed_at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
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
  const [liveState, setLiveState] = useState<LiveState>("loading");
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
  const reports: Record<ReportKind, readonly ReportRow[]> = {
    SYNOP: live ? toReportRows(liveObservations) : [],
    METAR: live ? toReportRows(liveAviation.METAR) : [],
    SPECI: live ? toReportRows(liveAviation.SPECI) : [],
  };
  const latestBody = liveObservations[0]?.body;
  const latestValues: Record<string, string> =
    live && latestBody
      ? Object.fromEntries(
          Object.entries(latestBody).map(([key, value]) => [
            key,
            typeof value === "string" ? value : "",
          ])
        )
      : {};

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

  const lastObserved = lastObservedLabel(liveState, liveObservations[0]);

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

      {liveState === "unavailable" ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          The eRegister service is unavailable. No observations are shown until
          it responds.
        </p>
      ) : null}

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
        <SectionCard className="w-fit max-w-full" title="Daily Summaries">
          <p
            className="max-w-xs px-4 py-3 text-muted-foreground text-sm"
            role="status"
          >
            Daily summaries are not connected to the register yet. No figures
            are shown.
          </p>
        </SectionCard>
        <div className="min-w-80 flex-1">
          <LatestReports reports={reports} state={liveState} />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        Latest saved records appear once the register service responds. QC
        approval and WIS2box publication remain separate, explicit steps.
      </p>
    </div>
  );
}
