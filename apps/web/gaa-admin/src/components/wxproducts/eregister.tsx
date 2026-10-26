"use client";

import {
  eregisterCorrectRegisterObservation,
  eregisterCreateRegisterObservation,
  eregisterGetStationSettings,
  eregisterListRegisterObservations,
  eregisterPutStationSettings,
  eregisterValidateSynopObservation,
  type RegisterObservationRead,
  type StationSettings as StationSettingsRead,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { type StationSettings, withDerived } from "./eregister-derived";
import { REGISTER_KEYS, REGISTER_SECTIONS } from "./eregister-layout";
import { metarFromCoded } from "./eregister-metar";
import { observerInitials } from "./eregister-observer";
import { QcQueue } from "./eregister-qc";
import {
  LatestReports,
  type LiveState,
  type ReportKind,
  type ReportRow,
} from "./eregister-reports";
import { useObservationSends } from "./eregister-send";
import { observationTime } from "./eregister-time";
import {
  PendingSettingsNote,
  RegisterTable,
  SectionCard,
  TimeMarks,
} from "./eregister-ui";
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

function toSettings(read: StationSettingsRead): StationSettings {
  return {
    qfeOffsetHpa: read.qfe_offset_hpa ?? null,
    qnhOffsetHpa: read.qnh_offset_hpa ?? null,
    seaLevelOffsetHpa: read.sea_level_offset_hpa ?? null,
    totalCorrectionHpa: read.total_correction_hpa ?? null,
  };
}

interface SaveResult {
  data?: RegisterObservationRead;
  error?: unknown;
  response?: Response;
}

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
    state: observation.state,
  }));
}

function lastObservedLabel(
  state: LiveState,
  latest: RegisterObservationRead | undefined
): string {
  if (state === "loading") return "Loading…";
  if (state === "unavailable") return "Unavailable";
  if (state === "forbidden") return "No register access";
  if (!latest?.observed_at) return "No saved observations yet";
  return `${new Date(latest.observed_at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
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
    visibility_km: "10",
    total_cloud: "6",
    air_temp: "0254",
    wet_bulb: "0230",
    barometer_reading: "1013.5",
  });
  const observationDate = observationTime(
    structuredValues.day,
    structuredValues.time_utc
  );
  const observedAt = observationDate.toISOString().slice(0, 16);
  const [validationIssues, setValidationIssues] = useState<
    { field: string; message: string; severity?: "error" | "warning" }[]
  >([]);
  const [expectedMetar, setExpectedMetar] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [liveState, setLiveState] = useState<LiveState>("loading");
  // The station's fixed pressure amounts (78958: owner confirmed, seeded).
  const [stationSettings, setStationSettings] =
    useState<StationSettings | null>(null);
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
          setLiveState(
            synop.response?.status === 403 ? "forbidden" : "unavailable"
          );
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

  useEffect(() => {
    let active = true;
    eregisterGetStationSettings({
      path: { station_id: STATION.number },
      throwOnError: false,
    })
      .then((result) => {
        if (active && result.data) setStationSettings(toSettings(result.data));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function saveStationSettings(
    next: StationSettings
  ): Promise<"saved" | "forbidden" | "error"> {
    const result = await eregisterPutStationSettings({
      body: {
        qfe_offset_hpa: next.qfeOffsetHpa,
        qnh_offset_hpa: next.qnhOffsetHpa,
        sea_level_offset_hpa: next.seaLevelOffsetHpa,
        total_correction_hpa: next.totalCorrectionHpa,
      },
      path: { station_id: STATION.number },
      throwOnError: false,
    });
    if (result.data) {
      setStationSettings(toSettings(result.data));
      return "saved";
    }
    return result.response?.status === 403 ? "forbidden" : "error";
  }

  async function runValidation(): Promise<boolean> {
    setValidationState("checking");
    const result = await eregisterValidateSynopObservation({
      body: {
        workbook: structuredValues,
        observed_at: observationDate.toISOString(),
      },
      throwOnError: false,
    });
    if (result.error || !result.data) {
      setValidationState("error");
      return false;
    }
    setValidationIssues(result.data.issues ?? []);
    setExpectedMetar(result.data.expected_metar ?? null);
    setValidationState(result.data.valid ? "valid" : "invalid");
    return result.data.valid;
  }

  async function validateDraft() {
    await runValidation();
  }

  // The last saved copy of the workbook, so sending an unchanged reading
  // reuses its record instead of saving a duplicate.
  const savedRef = useRef<{ id: string; key: string } | null>(null);

  async function persistDraft(): Promise<string | null> {
    setSaveState("saving");
    // Errors block saving; warnings only advise.
    if (!(await runValidation())) {
      setSaveState("idle");
      return null;
    }
    const record = {
      station_id: STATION.number,
      station_name: STATION.name,
      aerodrome_icao: STATION.icao,
      kind: "SYNOP" as const,
      observed_at: observationDate.toISOString(),
      body: {
        ...structuredValues,
        source: "eregister-workbook",
        validation: "pending_wmo_encoder",
      },
      raw_tac: null,
    };
    let result: SaveResult = await eregisterCreateRegisterObservation({
      body: record,
      throwOnError: false,
    });
    // The hour already has a live observation that cannot be edited in place
    // (accepted, or recorded by someone else): save a correction. Paper practice
    // is strike through and re-enter, so the old one stays listed, struck out.
    // Ask the server which observation holds this hour: the recent-record list
    // holds only the latest 24, so an older hour would not be found there.
    let earlier: RegisterObservationRead | undefined;
    if (result.response?.status === 409) {
      const holders = await eregisterListRegisterObservations({
        query: {
          kind: "SYNOP",
          station_id: STATION.number,
          observed_at: record.observed_at,
          limit: 10,
        },
        throwOnError: false,
      });
      earlier = holders.data?.observations.find(
        (item) =>
          item.state === "draft" ||
          item.state === "qc_pending" ||
          item.state === "accepted"
      );
    }
    if (earlier) {
      const corrected = await eregisterCorrectRegisterObservation({
        body: { body: record.body },
        path: { observation_id: earlier.id },
        throwOnError: false,
      });
      if (corrected.data) {
        setLiveObservations((current) =>
          current.map((item) =>
            item.id === earlier.id
              ? { ...item, state: "superseded" as const }
              : item
          )
        );
      }
      result = corrected;
    }
    if (result.error || !result.data) {
      const failure = result.error as
        | { detail?: { issues?: unknown } }
        | undefined;
      if (
        result.response?.status === 422 &&
        Array.isArray(failure?.detail?.issues)
      ) {
        setValidationIssues(
          failure.detail.issues as {
            field: string;
            message: string;
            severity?: "error" | "warning";
          }[]
        );
        setValidationState("invalid");
        setSaveState("idle");
        return null;
      }
      setSaveState("error");
      return null;
    }
    const saved = result.data;
    setSaveState("saved");
    savedRef.current = {
      id: saved.id,
      key: JSON.stringify(structuredValues),
    };
    // An in-place update of the observer's own draft keeps its id.
    setLiveObservations((current) =>
      [saved, ...current.filter((item) => item.id !== saved.id)].slice(0, 24)
    );
    setLiveState("ready");
    return saved.id;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistDraft();
  }

  const sends = useObservationSends(async () => {
    const saved = savedRef.current;
    if (saved && saved.key === JSON.stringify(structuredValues)) {
      return saved.id;
    }
    return await persistDraft();
  });

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
    const metarPreview = metarFromCoded(
      iso,
      withDerived(structuredValues, stationSettings)
    );

    return (
      <ERegisterWorkbook
        expectedMetar={expectedMetar}
        issues={validationIssues}
        metarPreview={metarPreview}
        observedAt={observedAt}
        onBack={() => setView("archive")}
        onSaveStationSettings={saveStationSettings}
        onSubmit={saveDraft}
        onValidate={validateDraft}
        onValidationIssuesChange={setValidationIssues}
        onValidationStateChange={setValidationState}
        onValueChange={(key, value) => {
          // The checked METAR belongs to the values it was built from: editing
          // them falls back to the local preview until the next check.
          if (key !== "metar_text") setExpectedMetar(null);
          setStructuredValues((current) => ({ ...current, [key]: value }));
        }}
        saveStatus={saveState}
        send={sends}
        station={station}
        stationSettings={stationSettings}
        validationStatus={validationState}
        values={structuredValues}
      />
    );
  }

  const lastObserved = lastObservedLabel(liveState, liveObservations[0]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3">
        <PageHeader title="Weather Electronic Register" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setView("archive")}
            variant={view === "archive" ? "default" : "outline"}
          >
            Observation archive
          </Button>
          <Button onClick={() => setView("new")} variant="outline">
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

      {liveState === "forbidden" ? (
        <p className="rounded-lg border px-4 py-3 text-sm" role="alert">
          You don't have access to the observation register. Ask an
          administrator for the eRegister observer role.
        </p>
      ) : null}

      {/* Last observation: Section 0 (station card on its right), then Sections 1 and 3 */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-stretch gap-4">
          {REGISTER_SECTIONS.slice(0, 1).map((section) => (
            <RegisterTable
              context={{ station: stationSettings }}
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
            context={{ station: stationSettings }}
            key={section.title}
            section={section}
            values={latestValues}
          />
        ))}
        <TimeMarks values={latestValues} />
        <PendingSettingsNote settings={stationSettings} />
      </div>

      {live ? (
        <QcQueue
          onDecided={(updated) =>
            setLiveObservations((current) =>
              current.map((item) => (item.id === updated.id ? updated : item))
            )
          }
          userId={sessionUser.id}
        />
      ) : null}

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
        Latest saved records appear once the register service responds. The
        observer accepts each observation, and only accepted observations go to
        WIS2. Another person may review an accepted observation. A correction
        keeps the old observation, struck out.
      </p>
    </div>
  );
}
