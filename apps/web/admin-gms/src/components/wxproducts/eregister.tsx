import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@grenmet/ui/components/ui/table";
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

// Modernised Meteorological Observations eRegister (station 78958, MBIA).
// Static representative content — a design cut of the legacy Excel register;
// data entry and wis2box/SYNOP transmission are wired in a later phase.

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
            Last {OBS_LOG.length} hours
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
            {OBS_LOG.map((row) => (
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
                  <Badge variant="light-success">Sent</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <p className="text-muted-foreground text-xs">
        Static design preview — observation entry, QC and wis2box transmission
        are wired in a later phase.
      </p>
    </div>
  );
}
