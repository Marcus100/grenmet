"use client";

import {
  eregisterAcceptRegisterObservation,
  eregisterCorrectRegisterObservation,
  eregisterCreateRegisterObservation,
  eregisterGetStationSettings,
  eregisterListRegisterObservations,
  eregisterPutStationSettings,
  eregisterValidateSynopObservation,
  type RegisterObservationRead,
  type StationSettings as StationSettingsRead,
  type SynopValidationIssue,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { type StationSettings, withDerived } from "./eregister-derived";
import { holdsValues } from "./eregister-held";
import { REGISTER_KEYS, REGISTER_SECTIONS } from "./eregister-layout";
import { metarFromCoded } from "./eregister-metar";
import { observerInitials } from "./eregister-observer";
import { QcQueue } from "./eregister-qc";
import { isSynopRefusal } from "./eregister-refusal";
import {
  LatestReports,
  type LiveState,
  type ReportKind,
  type ReportRow,
} from "./eregister-reports";
import {
  describeSends,
  failedReason,
  useObservationSends,
} from "./eregister-send";
import { observationTime } from "./eregister-time";
import {
  PendingSettingsNote,
  RegisterTable,
  SectionCard,
  TimeMarks,
} from "./eregister-ui";
import {
  type ApprovalController,
  ERegisterWorkbook,
} from "./eregister-workbook";

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

/** An accept call that did not answer clearly: the observation and the values it was made for. */
interface PendingApproval {
  id: string;
  iso: string;
  key: string;
}

/** What the register says about a pending approval after asking it. */
type Settled =
  | { kind: "approved"; id: string }
  | { kind: "held"; state: string }
  | { kind: "unknown" };

const EMAIL_NEEDS_APPROVAL =
  "Email needs an accepted observation. Save and approve it first.";
const EARLIER_APPROVED_MESSAGE =
  "The earlier values were approved. Your changes are not saved: save and approve again to approve them.";

function heldMessage(state: string): string {
  return state === "draft" || state === "qc_pending"
    ? "Not approved. It is saved as a draft; try again."
    : `Not approved. The register shows it as ${state}.`;
}

function unconfirmedMessage(sameValues: boolean): string {
  return sameValues
    ? "Could not confirm whether it was approved. Try again to check, and do not save it again until it is confirmed."
    : "Could not confirm whether the earlier values were approved. Your changes are not saved. Try again to check.";
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
    SynopValidationIssue[]
  >([]);
  const [expectedMetar, setExpectedMetar] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [approvalStatus, setApprovalStatus] =
    useState<ApprovalController["status"]>("idle");
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState(0);
  // True for the whole of an approval run (the lock), whatever message it shows.
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>("loading");
  // The station's fixed pressure amounts (78958: owner confirmed, seeded).
  const [stationSettings, setStationSettings] =
    useState<StationSettings | null>(null);
  // New amounts change what the checks say: an open confirmation is stale.
  const settingsSeen = useRef(stationSettings);
  useEffect(() => {
    if (settingsSeen.current === stationSettings) return;
    settingsSeen.current = stationSettings;
    setApprovalStatus((current) =>
      current === "confirming" ? "idle" : current
    );
  }, [stationSettings]);
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

  async function requestValidation(): Promise<{
    issues: SynopValidationIssue[];
    valid: boolean;
  } | null> {
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
      return null;
    }
    const issues = result.data.issues ?? [];
    setValidationIssues(issues);
    setExpectedMetar(result.data.expected_metar ?? null);
    setValidationState(result.data.valid ? "valid" : "invalid");
    return { issues, valid: result.data.valid };
  }

  // A call that throws (offline) must not leave the form on "checking".
  async function checkObservation() {
    try {
      return await requestValidation();
    } catch {
      setValidationState("error");
      return null;
    }
  }

  async function runValidation(): Promise<boolean> {
    return (await checkObservation())?.valid ?? false;
  }

  async function validateDraft() {
    await runValidation();
  }

  // The last saved copy of the workbook, so sending an unchanged reading
  // reuses its record instead of saving a duplicate.
  const savedRef = useRef<{ id: string; key: string } | null>(null);

  // Approved observations by the values they hold, an approval still waiting
  // to be confirmed, and a guard against two approvals running at once.
  const approvedRef = useRef<Map<string, string>>(new Map());
  const unconfirmedRef = useRef<{
    id: string;
    iso: string;
    key: string;
  } | null>(null);
  const approvingRef = useRef(false);

  // The id of the accepted observation for this hour holding exactly these
  // values, if the register still has it accepted. Saving them again would only
  // make a correction of what was already approved. The record approved in this
  // visit is checked first; after a reload the accepted list is checked by value.
  function approvedAsKeyed(): string | null {
    const key = JSON.stringify(structuredValues);
    const known = approvedRef.current.get(key);
    if (
      known &&
      liveObservations.some(
        (item) => item.id === known && item.state === "accepted"
      )
    ) {
      return known;
    }
    const hour = observationDate.getTime();
    const match = liveObservations.find(
      (item) =>
        item.state === "accepted" &&
        new Date(item.observed_at).getTime() === hour &&
        holdsValues(item.body, structuredValues)
    );
    return match?.id ?? null;
  }

  function isApprovedId(id: string): boolean {
    return [...approvedRef.current.values()].includes(id);
  }

  async function saveObservation(): Promise<string | null> {
    // An unclear accept is settled before anything is saved: the register may
    // already hold this hour approved, and a save would correct it.
    const pending = unconfirmedRef.current;
    if (pending) {
      const settled = await settleApproval(pending);
      const sameValues = pending.key === JSON.stringify(structuredValues);
      if (settled.kind === "unknown") {
        setApprovalStatus("error");
        setApprovalMessage(unconfirmedMessage(sameValues));
        return null;
      }
      if (settled.kind === "approved") {
        if (sameValues) {
          await announceApproved(settled.id);
          setSaveState("saved");
          return settled.id;
        }
        setApprovalStatus("approved");
        setApprovalMessage(EARLIER_APPROVED_MESSAGE);
        return null;
      }
    }
    const approvedId = approvedAsKeyed();
    if (approvedId) {
      setSaveState("saved");
      return approvedId;
    }
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
      if (result.response?.status === 422 && isSynopRefusal(result.error)) {
        setValidationIssues(result.error.detail.issues);
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

  // A call that throws (offline) must not leave the form on "saving".
  async function persistDraft(): Promise<string | null> {
    try {
      return await saveObservation();
    } catch {
      setSaveState("error");
      return null;
    }
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (approvingRef.current) return;
    const id = await persistDraft();
    // A saved correction is a new, unapproved draft.
    if (id && !isApprovedId(id)) setApprovalStatus("idle");
  }

  const sends = useObservationSends(async () => {
    const saved = savedRef.current;
    if (saved && saved.key === JSON.stringify(structuredValues)) {
      return saved.id;
    }
    return await persistDraft();
  });

  // Save and approve on the entry screen: the observer decides their own
  // observation (another person may still review it afterwards).
  function markApproved(approved: RegisterObservationRead, key: string) {
    approvedRef.current.set(key, approved.id);
    unconfirmedRef.current = null;
    setLiveObservations((current) =>
      current.map((item) => (item.id === approved.id ? approved : item))
    );
  }

  // What the register now says about the approved observation's sends. The
  // accept call succeeds even when a send could not be queued.
  async function announceApproved(id: string) {
    let history: Awaited<ReturnType<typeof sends.track>> = null;
    try {
      history = await sends.track(id);
    } catch {
      history = null;
    }
    setApprovalStatus("approved");
    const failure = history ? failedReason(history) : null;
    if (failure) {
      setApprovalMessage(`Approved, but a send was not queued: ${failure}`);
    } else if (history && history.length > 0) {
      setApprovalMessage(`Approved. ${describeSends(history)}.`);
    } else {
      setApprovalMessage(
        "Approved. Check the send history for WIS2 and email."
      );
    }
  }

  // After an accept call that did not answer clearly, ask the register what it
  // holds before saying anything: it may already be approved. An approval found
  // is recorded for the values it was made for; the caller says what that means.
  async function settleApproval(pending: PendingApproval): Promise<Settled> {
    let held: RegisterObservationRead | undefined;
    try {
      const holders = await eregisterListRegisterObservations({
        query: {
          kind: "SYNOP",
          station_id: STATION.number,
          observed_at: pending.iso,
          limit: 10,
        },
        throwOnError: false,
      });
      held = holders.data?.observations.find((item) => item.id === pending.id);
    } catch {
      held = undefined;
    }
    if (held?.state === "accepted") {
      markApproved(held, pending.key);
      return { kind: "approved", id: pending.id };
    }
    if (held) {
      unconfirmedRef.current = null;
      return { kind: "held", state: held.state };
    }
    // Unknown: stays pending, so the next save or approval asks again first.
    return { kind: "unknown" };
  }

  async function runApproval() {
    const observedIso = observationDate.toISOString();
    const key = JSON.stringify(structuredValues);
    const pending = unconfirmedRef.current;
    if (pending) {
      const settled = await settleApproval(pending);
      if (settled.kind === "approved") {
        if (pending.key === key) {
          await announceApproved(settled.id);
        } else {
          setApprovalStatus("approved");
          setApprovalMessage(EARLIER_APPROVED_MESSAGE);
        }
        return;
      }
      if (settled.kind === "unknown") {
        setApprovalStatus("error");
        setApprovalMessage(unconfirmedMessage(pending.key === key));
        return;
      }
      // Held and not approved: the approval below goes on with the values shown.
    }
    const known = approvedAsKeyed();
    if (known) {
      await announceApproved(known);
      return;
    }
    const id = await persistDraft();
    if (!id) {
      setApprovalStatus("error");
      setApprovalMessage(
        "Not approved: the observation was not saved. Fix any errors above, or try again."
      );
      return;
    }
    // Until the register answers clearly, the outcome is not known.
    unconfirmedRef.current = { id, iso: observedIso, key };
    let decided: Awaited<
      ReturnType<typeof eregisterAcceptRegisterObservation>
    > | null = null;
    try {
      decided = await eregisterAcceptRegisterObservation({
        body: { reason: null },
        path: { observation_id: id },
        throwOnError: false,
      });
    } catch {
      decided = null;
    }
    if (decided?.data) {
      markApproved(decided.data, key);
      await announceApproved(id);
      return;
    }
    if (decided?.response?.status === 403) {
      unconfirmedRef.current = null;
      setApprovalStatus("error");
      setApprovalMessage(
        "Saved as a draft, but you do not have access to approve it."
      );
      return;
    }
    if (decided && isSynopRefusal(decided.error)) {
      unconfirmedRef.current = null;
      setApprovalStatus("error");
      setApprovalMessage(decided.error.detail.message);
      return;
    }
    const settled = await settleApproval({ id, iso: observedIso, key });
    if (settled.kind === "approved") {
      await announceApproved(settled.id);
      return;
    }
    setApprovalStatus("error");
    setApprovalMessage(
      settled.kind === "held"
        ? heldMessage(settled.state)
        : unconfirmedMessage(true)
    );
  }

  // One approval at a time; anything that throws ends in a message, never a
  // form stuck on "Approving…". The lock is the ref and the busy flag, not the
  // visible status, which moves while a run is still going.
  async function guardedApproval(work: () => Promise<void>) {
    if (approvingRef.current) return;
    approvingRef.current = true;
    setApprovalBusy(true);
    setApprovalStatus("working");
    setApprovalMessage(null);
    try {
      await work();
    } catch {
      setApprovalStatus("error");
      setApprovalMessage(
        "Something went wrong and it is not certain whether it was approved. Check the observation list before trying again."
      );
    } finally {
      approvingRef.current = false;
      setApprovalBusy(false);
    }
  }

  const startApproval = () =>
    guardedApproval(async () => {
      const checked = await checkObservation();
      if (!checked?.valid) {
        setApprovalStatus("error");
        setApprovalMessage(
          checked
            ? "Not approved: fix the errors listed above."
            : "Not approved: the checks could not run. Try again."
        );
        return;
      }
      const notes = checked.issues.filter(
        (issue) => issue.severity === "warning"
      ).length;
      if (notes > 0) {
        setApprovalNotes(notes);
        setApprovalStatus("confirming");
        return;
      }
      await runApproval();
    });

  const approval: ApprovalController = {
    busy: approvalBusy,
    cancel: () => setApprovalStatus("idle"),
    confirm: () => guardedApproval(runApproval),
    message: approvalMessage,
    start: startApproval,
    status: approvalStatus,
    warningCount: approvalNotes,
  };

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
    // The register sends only accepted observations by email (the default).
    const emailBlocked = approvedAsKeyed() ? null : EMAIL_NEEDS_APPROVAL;

    return (
      <ERegisterWorkbook
        approval={approval}
        emailBlocked={emailBlocked}
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
          if (approvingRef.current) return;
          // The checked METAR belongs to the values it was built from: editing
          // them falls back to the local preview until the next check.
          if (key !== "metar_text") setExpectedMetar(null);
          // Editing after a decision or a question starts the approval over.
          setApprovalStatus("idle");
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
            className="text-muted-foreground max-w-xs px-4 py-3 text-sm"
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
