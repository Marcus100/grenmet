"use client";

import {
  createRegisterObservationApiV1EregisterObservationsPost,
  listRegisterObservationsApiV1EregisterObservationsGet,
  type RegisterObservationRead,
  validateSynopObservationApiV1EregisterObservationsValidateSynopPost,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import {
  CloudSun,
  Droplets,
  ExternalLink,
  Eye,
  Gauge,
  type LucideIcon,
  Mail,
  Radio,
  Save,
  Send,
  Thermometer,
  ThermometerSnowflake,
  Wind,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

// Modernised Meteorological Observations eRegister (station 78958, MBIA).
// The register is backed by the dedicated FastAPI eRegister database; the
// representative rows remain visible when that service is unavailable.

const STATION = {
  name: "Maurice Bishop International Airport",
  number: "78958",
  icao: "TGPY",
  position: "12.0°N · 61.47°W",
  observer: "Fimber Frank",
  date: "Tue 07 Jul 2026",
  hour: "23:00 UTC",
  backedUp: "07/07/2026 · 07:00",
};

interface Reading {
  icon: LucideIcon;
  id: string;
  label: string;
  note: string;
  unit?: string;
  value: string;
}

const CURRENT_READINGS: Reading[] = [
  {
    id: "air-temp",
    label: "Air temperature",
    value: "25.4",
    unit: "°C",
    note: "Dew point 22.8 °C",
    icon: Thermometer,
  },
  {
    id: "humidity",
    label: "Relative humidity",
    value: "86",
    unit: "%",
    note: "Wet bulb 23.6 °C",
    icon: Droplets,
  },
  {
    id: "wind",
    label: "Wind",
    value: "070° / 10",
    unit: "kt",
    note: "Gust 18 kt",
    icon: Wind,
  },
  {
    id: "qnh",
    label: "QNH",
    value: "1014.9",
    unit: "hPa",
    note: "MSLP 1014.6 · QFE 1013.5",
    icon: Gauge,
  },
  {
    id: "visibility",
    label: "Visibility",
    value: "10",
    unit: "km",
    note: "Slight haze",
    icon: Eye,
  },
  {
    id: "cloud",
    label: "Total cloud",
    value: "6",
    unit: "/8",
    note: "FEW018 · SCT300",
    icon: CloudSun,
  },
];

interface CodedGroup {
  code: string;
  id: string;
  label: string;
  value: string;
}

const SECTION_1: CodedGroup[] = [
  { id: "mimi", code: "MiMiMjMj", label: "Report ind.", value: "AAXX" },
  {
    id: "yygg",
    code: "YYGGiw",
    label: "Day · hr · wind ind.",
    value: "07 23 4",
  },
  { id: "iiiii", code: "IIiii", label: "Station no.", value: "78958" },
  { id: "ir", code: "iR", label: "6-group ind.", value: "4" },
  { id: "ix", code: "ix", label: "7-group ind.", value: "1" },
  { id: "h", code: "h", label: "Lowest cloud", value: "4" },
  { id: "vv", code: "VV", label: "Visibility", value: "65" },
  { id: "n", code: "N", label: "Total cloud", value: "6" },
  { id: "ddff", code: "dddff", label: "Wind dir / speed", value: "070 10" },
  { id: "ttt", code: "1SnTTT", label: "Air temp", value: "1 0254" },
  { id: "td", code: "2SnTdTdTd", label: "Dew point", value: "2 0228" },
  { id: "po", code: "3PoPoPo", label: "QFE / stn pres", value: "3 0135" },
  { id: "pppp", code: "4PPPP", label: "QNH / MSLP", value: "4 0149" },
  { id: "rrr", code: "6RRRtR", label: "Rainfall since", value: "6 000 1" },
  { id: "ww", code: "7wwW1W2", label: "Present / past wx", value: "7 05 8 2" },
  { id: "clcm", code: "8NhCLCMCH", label: "Cloud amounts", value: "8 6 8 7 /" },
];

const SECTION_3: CodedGroup[] = [
  { id: "sect3", code: "333", label: "Section ind.", value: "333" },
  { id: "sky", code: "0Cs", label: "State of sky", value: "0 · Cs" },
  { id: "tmax", code: "1SnTxTxTx", label: "Max temp", value: "1 0302" },
  { id: "tmin", code: "2SnTnTnTn", label: "Min temp", value: "2 0246" },
  { id: "baro", code: "5j1P24", label: "24 hr baro change", value: "5 9010" },
  { id: "rain24", code: "7R24", label: "24 hr rainfall", value: "7 0004" },
  { id: "layer1", code: "8NsChshs", label: "Layer 1", value: "8 1 8 18" },
  { id: "layer2", code: "8NsChshs", label: "Layer 2", value: "8 6 0 77" },
  { id: "phen", code: "9SpSpspsp", label: "Special phen.", value: "909" },
];

// Daily summary grid — synoptic-hour readings as rows, elements as columns.
const DAILY_SUMMARY = [
  { id: "d00", hour: "00:00", rain: "0.0", max: "27.9", min: "25.1" },
  { id: "d06", hour: "06:00", rain: "0.2", max: "26.1", min: "24.6" },
  { id: "d12", hour: "12:00", rain: "1.4", max: "30.2", min: "25.8" },
  { id: "d18", hour: "18:00", rain: "0.0", max: "30.2", min: "25.4" },
];

const DAILY_TOTALS = { rain: "1.6", max: "30.2", min: "24.6" };

const METAR = "TGPY 072300Z 07010G18KT 9999 FEW018 SCT300 25/23 Q1015 NOSIG";

interface ObsLogRow {
  hour: string;
  id: string;
  synop: string;
}

const OBS_LOG: ObsLogRow[] = [
  {
    id: "l23",
    hour: "23:00",
    synop:
      "AAXX 07234 78958 41465 82010 10254 20228 30135 40149 60001 70582 86870 333 10302 20246 59010 70004 81818 909//",
  },
  {
    id: "l22",
    hour: "22:00",
    synop:
      "AAXX 07224 78958 41464 82011 10256 20229 30134 40148 60001 70282 86870 333 81818",
  },
  {
    id: "l21",
    hour: "21:00",
    synop:
      "AAXX 07214 78958 41465 82013 10259 20230 30133 40147 60001 70282 85870 333 81717",
  },
  {
    id: "l20",
    hour: "20:00",
    synop:
      "AAXX 07204 78958 41464 82015 10263 20231 30134 40148 60001 70182 84770 333 81616",
  },
  {
    id: "l19",
    hour: "19:00",
    synop:
      "AAXX 07194 78958 41465 82016 10267 20230 30135 40149 60001 70182 84770 333 81616",
  },
  {
    id: "l18",
    hour: "18:00",
    synop:
      "AAXX 07184 78958 41464 82016 10271 20229 30136 40150 60001 70182 83670 333 10302 81515",
  },
];

const REGISTER_GROUPS = [
  {
    title: "IDENTIFICATION",
    fields: [
      ["Report", "report_type", "MiMiMjMj"],
      ["Day", "day", "YY"],
      ["Hour", "time_utc", "GG"],
      ["Station", "station_id", "IIiii"],
      ["Wind ind.", "wind_indicator", "iw"],
    ],
  },
  {
    title: "SECTION 1 · GLOBAL DATA",
    fields: [
      ["Precip. ind.", "precip_indicator", "iR"],
      ["Station/weather ind.", "station_wx_indicator", "ix"],
      ["Cloud base", "cloud_base", "h"],
      ["Visibility", "visibility", "VV"],
      ["Total cloud", "total_cloud", "N"],
      ["Wind dir.", "wind_dir", "dd"],
      ["Wind speed", "wind_speed", "ff"],
      ["Air temp.", "air_temp", "1snTTT"],
      ["Dew point", "dew_point", "2snTdTdTd"],
      ["Station pressure", "station_pressure", "3P0P0P0P0"],
      ["MSL pressure", "msl_pressure", "4PPPP"],
      ["Pressure tendency", "pressure_tendency", "5a"],
      ["Pressure change", "pressure_change", "5ppp"],
      ["Precip. amount", "precip_amount", "6RRR"],
      ["Precip. period", "precip_period", "6tR"],
      ["Present weather", "present_wx", "7ww"],
      ["Past wx 1", "past_wx_1", "7W1"],
      ["Past wx 2", "past_wx_2", "7W2"],
      ["Low cloud amt.", "low_cloud_amount", "8Nh"],
      ["Low cloud type", "low_cloud_type", "8CL"],
      ["Mid cloud type", "mid_cloud_type", "8CM"],
      ["High cloud type", "high_cloud_type", "8CH"],
    ],
  },
  {
    title: "SECTION 3 · REGIONAL / NATIONAL DATA",
    fields: [
      ["State of sky", "s3_state_of_sky", "0"],
      ["Low cloud dir.", "s3_cloud_dir_low", "DL"],
      ["Mid cloud dir.", "s3_cloud_dir_mid", "DM"],
      ["High cloud dir.", "s3_cloud_dir_high", "DH"],
      ["Max temp.", "s3_max_temp", "1snTxTxTx"],
      ["Min temp.", "s3_min_temp", "2snTnTnTn"],
      ["24h baro change", "s3_baro_change_24h", "5appp"],
      ["24h rainfall", "s3_rainfall_24h", "7RRR"],
      ["Layer 1 amt.", "s3_layer1_amount", "8Ns"],
      ["Layer 1 form", "s3_layer1_form", "C"],
      ["Layer 1 height", "s3_layer1_height", "hshs"],
      ["Layer 2 amt.", "s3_layer2_amount", "8Ns"],
      ["Layer 2 form", "s3_layer2_form", "C"],
      ["Layer 2 height", "s3_layer2_height", "hshs"],
      ["Layer 3 amt.", "s3_layer3_amount", "8Ns"],
      ["Layer 3 form", "s3_layer3_form", "C"],
      ["Layer 3 height", "s3_layer3_height", "hshs"],
      ["Layer 4 amt.", "s3_layer4_amount", "8Ns"],
      ["Layer 4 form", "s3_layer4_form", "C"],
      ["Layer 4 height", "s3_layer4_height", "hshs"],
      ["Special phenomena", "s3_special_phenomena", "95SpSpspsp"],
      ["Remarks", "s3_remarks", "—"],
      ["Notes", "notes", "—"],
    ],
  },
] as const;

const REGISTER_DEFAULTS: Record<string, string> = Object.fromEntries(
  REGISTER_GROUPS.flatMap((group) => group.fields.map(([, key]) => [key, ""]))
);

// Shared spreadsheet-style cell chrome: vertical gridlines between columns.
const GRID_CELL = "border-border border-r last:border-r-0";
const HEAD_ROW = "bg-muted/50 hover:bg-muted/50";

function SectionCard({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-3.5">
        <CardTitle className="text-sm">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="overflow-hidden rounded-b-xl p-0">
        {children}
      </CardContent>
    </Card>
  );
}

// Horizontal coding strip like the legacy register sheet: SYNOP code letters
// as column headers, the coded values in the row beneath.
function CodedStrip({ groups }: { groups: CodedGroup[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className={HEAD_ROW}>
          {groups.map((group) => (
            <TableHead
              className={`${GRID_CELL} h-auto px-3 py-2 text-center`}
              key={group.id}
            >
              <div className="text-xs">{group.label}</div>
              <div className="font-mono font-normal text-[10px] text-muted-foreground">
                {group.code}
              </div>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          {groups.map((group) => (
            <TableCell
              className={`${GRID_CELL} px-3 py-2.5 text-center font-medium font-mono text-sm tabular-nums`}
              key={group.id}
            >
              {group.value}
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}

function SummaryHead({
  icon: Icon,
  label,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  unit: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span>{label}</span>
      <span className="font-normal text-muted-foreground text-xs">{unit}</span>
    </span>
  );
}

export function ERegister() {
  const [view, setView] = useState<"archive" | "new">("archive");
  const [liveObservations, setLiveObservations] = useState<
    RegisterObservationRead[]
  >([]);
  const [observedAt, setObservedAt] = useState("2026-07-07T23:00");
  const [structuredValues, setStructuredValues] = useState<
    Record<string, string>
  >({
    ...REGISTER_DEFAULTS,
    report_type: "AAXX",
    day: "07",
    time_utc: "23",
    station_id: STATION.number,
    wind_indicator: "4",
    wind_dir: "070",
    wind_speed: "10",
    visibility: "10",
    total_cloud: "6",
    air_temp: "25.4",
    dew_point: "23.0",
    msl_pressure: "1014.9",
  });
  const [validationIssues, setValidationIssues] = useState<
    { field: string; message: string }[]
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

  useEffect(() => {
    let active = true;
    listRegisterObservationsApiV1EregisterObservationsGet({
      query: { kind: "SYNOP", station_id: STATION.number, limit: 6 },
      throwOnError: false,
    })
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data) {
          setLiveState("unavailable");
          return;
        }
        setLiveObservations(result.data.observations);
        setLiveState("ready");
      })
      .catch(() => {
        if (active) setLiveState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  async function validateDraft() {
    setValidationState("checking");
    const result =
      await validateSynopObservationApiV1EregisterObservationsValidateSynopPost(
        {
          body: { workbook: structuredValues },
          throwOnError: false,
        }
      );
    if (result.error || !result.data) {
      setValidationState("error");
      return;
    }
    setValidationIssues(result.data.issues ?? []);
    setValidationState(result.data.valid ? "valid" : "invalid");
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    const result =
      await createRegisterObservationApiV1EregisterObservationsPost({
        body: {
          station_id: STATION.number,
          station_name: STATION.name,
          aerodrome_icao: STATION.icao,
          kind: "SYNOP",
          observed_at: new Date(observedAt).toISOString(),
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
    setLiveObservations((current) => [result.data, ...current].slice(0, 6));
    setLiveState("ready");
  }

  const displayedLog: ObsLogRow[] = liveObservations.length
    ? liveObservations.map((observation) => ({
        id: observation.id,
        hour: observation.observed_at
          ? new Date(observation.observed_at).toISOString().slice(11, 16)
          : "Unknown",
        synop: observation.raw_tac ?? "Structured SYNOP record",
      }))
    : OBS_LOG;

  if (view === "new") {
    const updateValue = (key: keyof typeof structuredValues, value: string) =>
      setStructuredValues((current) => ({ ...current, [key]: value }));
    const iso = new Date(observedAt).toISOString();
    const metarPreview = `TGPY ${iso.slice(8, 10)}${iso.slice(11, 15)}Z ${structuredValues.wind_dir}${structuredValues.wind_speed.padStart(2, "0")}KT ${structuredValues.visibility === "10" ? "9999" : structuredValues.visibility} ${structuredValues.present_wx || "NSW"} ${structuredValues.total_cloud === "0" ? "NSC" : `BKN${structuredValues.total_cloud}00`} ${structuredValues.air_temp}/${structuredValues.dew_point} Q${structuredValues.msl_pressure.replace(".", "")}`;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
              Meteorological Observations Register
            </p>
            <h1 className="mt-1 font-semibold text-2xl tracking-tight">
              New observation
            </h1>
            <p className="text-muted-foreground text-sm">
              {STATION.name} · {STATION.icao} · structured WMO entry
            </p>
          </div>
          <Button onClick={() => setView("archive")} variant="outline">
            Observation archive
          </Button>
        </div>
        <SectionCard
          action={<Badge variant="light-info">Draft · QC required</Badge>}
          title="Hourly observation workbook"
        >
          <form className="space-y-5 p-4" onSubmit={saveDraft}>
            <div className="grid gap-4 border-b pb-5 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="new-observed-at">Observation time (UTC)</Label>
                <Input
                  id="new-observed-at"
                  onChange={(event) => setObservedAt(event.target.value)}
                  type="datetime-local"
                  value={observedAt}
                />
              </div>
              <div className="grid gap-2">
                <Label>Station</Label>
                <Input disabled value={`${STATION.icao} · ${STATION.number}`} />
              </div>
              <div className="grid gap-2">
                <Label>Observer</Label>
                <Input disabled value={STATION.observer} />
              </div>
            </div>
            <div className="grid gap-4">
              {REGISTER_GROUPS.map((group) => (
                <Card className="gap-0 overflow-hidden py-0" key={group.title}>
                  <CardHeader className="border-b bg-muted/30 px-3 py-2">
                    <CardTitle className="font-semibold text-xs uppercase tracking-wide">
                      {group.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    <Table className="min-w-max border-collapse">
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          {group.fields.map(([label, key, code]) => (
                            <TableHead
                              className="h-28 min-w-10 border-border border-r p-0 align-bottom"
                              key={key}
                            >
                              <div className="flex h-28 flex-col items-center justify-end gap-1 pb-1">
                                <span className="block rotate-180 whitespace-nowrap text-[11px] [writing-mode:vertical-rl]">
                                  {label}
                                </span>
                                <span className="block whitespace-nowrap font-mono font-normal text-[10px] text-muted-foreground">
                                  {code}
                                </span>
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="align-top">
                          {group.fields.map(([label, key]) => (
                            <TableCell
                              className="border-border border-r p-0"
                              key={key}
                            >
                              <Input
                                aria-label={label}
                                className={`h-7 min-w-10 rounded-none border-0 bg-transparent px-0.5 font-mono text-[11px] shadow-none focus-visible:ring-1 ${validationIssues.some((issue) => issue.field === key) ? "bg-destructive/10 text-destructive" : ""}`}
                                onChange={(event) => {
                                  updateValue(key, event.target.value);
                                  setValidationIssues((issues) =>
                                    issues.filter(
                                      (issue) => issue.field !== key
                                    )
                                  );
                                  setValidationState("idle");
                                }}
                                value={structuredValues[key] ?? ""}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
            {validationIssues.length > 0 && (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-xs"
                role="alert"
              >
                {validationIssues.map((issue) => (
                  <p key={`${issue.field}-${issue.message}`}>
                    <strong>{issue.field}</strong>: {issue.message}
                  </p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {validationState === "valid"
                  ? "WMO checks passed for the current workbook."
                  : "Validate before saving to identify WMO field errors."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={validationState === "checking"}
                  onClick={validateDraft}
                  type="button"
                  variant="outline"
                >
                  {validationState === "checking"
                    ? "Checking…"
                    : "Validate observation"}
                </Button>
                <Button disabled={saveState === "saving"} type="submit">
                  <Save />
                  {saveState === "saving" ? "Saving…" : "Save draft"}
                </Button>
              </div>
            </div>
            {saveState === "saved" && (
              <p className="text-muted-foreground text-xs" role="status">
                Draft saved to eRegister. QC approval is still required.
              </p>
            )}
            {saveState === "error" && (
              <p className="text-destructive text-xs" role="alert">
                Draft could not be saved. Check the API and try again.
              </p>
            )}
          </form>
        </SectionCard>
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            action={<Badge variant="secondary">Preview</Badge>}
            title="SYNOP"
          >
            <div className="space-y-3 p-4">
              <p className="text-muted-foreground text-xs">
                WMO encoder will generate this after code-table and cross-field
                validation.
              </p>
              <code className="block rounded-lg bg-muted px-3 py-3 font-mono text-muted-foreground text-xs">
                Pending validation · {STATION.number} ·{" "}
                {observedAt.replace("T", " ")} UTC
              </code>
            </div>
          </SectionCard>
          <SectionCard
            action={<Badge variant="secondary">Preview</Badge>}
            title="METAR / SPECI"
          >
            <div className="space-y-3 p-4">
              <p className="text-muted-foreground text-xs">
                SPECI appears only when a configured special-report trigger
                applies.
              </p>
              <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-3 font-mono text-xs">
                {metarPreview}
              </code>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Station header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
            Meteorological Observations Register
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            eRegister — Hourly Observations
          </h1>
          <p className="text-muted-foreground text-sm">
            {STATION.name} · Station {STATION.number} ({STATION.icao}) ·{" "}
            {STATION.position}
          </p>
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
          <Button size="lg" variant="outline">
            <Send />
            Send last obs
          </Button>
          <Button size="lg" variant="outline">
            <Mail />
            Email observation
          </Button>
          <Button size="lg">
            <Save />
            QC &amp; save
          </Button>
        </div>
      </div>

      {/* Observation context strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">Observation hour</span>{" "}
          <span className="font-medium tabular-nums">
            {STATION.date} · {STATION.hour}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">Observer</span>{" "}
          <span className="font-medium">{STATION.observer}</span>
        </span>
        <Badge variant="light-success">QC passed</Badge>
        <Badge variant={liveState === "ready" ? "light-info" : "secondary"}>
          {liveState === "ready"
            ? `${liveObservations.length} live SYNOP records`
            : liveState === "loading"
              ? "Loading live SYNOP"
              : "Sample register data"}
        </Badge>
        <Badge variant="light-info">CL backed up · {STATION.backedUp}</Badge>
        <a
          className="ml-auto inline-flex items-center gap-1.5 font-medium text-primary text-sm hover:underline"
          href="https://wis2box.wis.wmo.int"
          rel="noreferrer"
          target="_blank"
        >
          wis2box · SYNOP form
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      {/* Current observation + daily summary grids */}
      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <SectionCard
          action={<Badge variant="secondary">{STATION.hour}</Badge>}
          title="Current observation"
        >
          <Table>
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={`${GRID_CELL} px-3.5`}>
                  Parameter
                </TableHead>
                <TableHead className={`${GRID_CELL} px-3.5 text-right`}>
                  Value
                </TableHead>
                <TableHead className={`${GRID_CELL} px-3.5`}>Unit</TableHead>
                <TableHead className="px-3.5">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CURRENT_READINGS.map((reading) => {
                const Icon = reading.icon;
                return (
                  <TableRow key={reading.id}>
                    <TableCell className={`${GRID_CELL} px-3.5`}>
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {reading.label}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`${GRID_CELL} px-3.5 text-right font-medium font-mono tabular-nums`}
                    >
                      {reading.value}
                    </TableCell>
                    <TableCell
                      className={`${GRID_CELL} px-3.5 text-muted-foreground`}
                    >
                      {reading.unit ?? "—"}
                    </TableCell>
                    <TableCell className="px-3.5 text-muted-foreground text-xs">
                      {reading.note}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard
          action={
            <span className="text-muted-foreground text-xs">
              Station day 12–12 UTC
            </span>
          }
          title="Daily summaries"
        >
          <Table>
            <TableHeader>
              <TableRow className={HEAD_ROW}>
                <TableHead className={`${GRID_CELL} px-3.5`}>
                  Hour (UTC)
                </TableHead>
                <TableHead className={`${GRID_CELL} px-3.5 text-right`}>
                  <SummaryHead icon={Droplets} label="Rainfall" unit="mm" />
                </TableHead>
                <TableHead className={`${GRID_CELL} px-3.5 text-right`}>
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
                    className={`${GRID_CELL} px-3.5 font-medium tabular-nums`}
                  >
                    {row.hour}
                  </TableCell>
                  <TableCell
                    className={`${GRID_CELL} px-3.5 text-right font-mono tabular-nums`}
                  >
                    {row.rain}
                  </TableCell>
                  <TableCell
                    className={`${GRID_CELL} px-3.5 text-right font-mono tabular-nums`}
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
                <TableCell className={`${GRID_CELL} px-3.5`}>
                  Daily 12–12
                </TableCell>
                <TableCell
                  className={`${GRID_CELL} px-3.5 text-right font-mono tabular-nums`}
                >
                  {DAILY_TOTALS.rain}
                </TableCell>
                <TableCell
                  className={`${GRID_CELL} px-3.5 text-right font-mono tabular-nums`}
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
      </div>

      {/* Coded sections — horizontal register strips */}
      <SectionCard title="Section 1 — surface observation">
        <CodedStrip groups={SECTION_1} />
      </SectionCard>

      <SectionCard title="Section 3 — regional groups">
        <CodedStrip groups={SECTION_3} />
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <span className="font-medium text-muted-foreground text-xs">
            Remarks
          </span>
          <Badge variant="light-warning">SLT HZ</Badge>
          <span className="text-muted-foreground text-xs">
            Slight haze — regional and national plain-language additions
          </span>
        </div>
      </SectionCard>

      {/* METAR strip */}
      <SectionCard
        action={
          <Button size="sm" variant="outline">
            <Radio />
            Send SPECI
          </Button>
        }
        title="METAR"
      >
        <div className="px-4 py-3">
          <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-3 py-2.5 font-mono text-sm tabular-nums">
            {METAR}
          </code>
        </div>
      </SectionCard>

      {/* Transmitted observations log */}
      <SectionCard
        action={
          <span className="text-muted-foreground text-xs">
            Last {displayedLog.length} records
          </span>
        }
        title="Transmitted observations"
      >
        <Table>
          <TableHeader>
            <TableRow className={HEAD_ROW}>
              <TableHead className={`${GRID_CELL} px-3.5`}>
                Hour (UTC)
              </TableHead>
              <TableHead className={`${GRID_CELL} px-3.5`}>
                SYNOP message
              </TableHead>
              <TableHead className="px-3.5">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedLog.map((row) => (
              <TableRow key={row.id}>
                <TableCell
                  className={`${GRID_CELL} px-3.5 font-medium tabular-nums`}
                >
                  {row.hour}
                </TableCell>
                <TableCell
                  className={`${GRID_CELL} px-3.5 font-mono text-muted-foreground text-xs tabular-nums`}
                >
                  {row.synop}
                </TableCell>
                <TableCell className="px-3.5">
                  <Badge
                    variant={
                      liveState === "ready" ? "secondary" : "light-success"
                    }
                  >
                    {liveState === "ready" ? "Recorded" : "Sample"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <p className="text-muted-foreground text-xs">
        Live records are read from FastAPI. QC approval and WIS2box publication
        remain explicit workflow steps.
      </p>
    </div>
  );
}
