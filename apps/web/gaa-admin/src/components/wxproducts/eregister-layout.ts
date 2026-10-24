// Column layout of the register, copied from the top part of the paper
// register (columns 1 to 65): one table per section, each column with its paper
// name, its WMO code and its paper column number. `fixed` columns are the
// group indicator digits printed on the form; they are shown greyed and never
// keyed or stored. Every column has an upper and a lower cell.

export interface FieldColumn {
  code: string;
  /**
   * The lower cell is calculated from other entries (visibility code from
   * kilometres, dew point and relative humidity from the wet bulb): shown
   * greyed and never keyed.
   */
  computed?: boolean;
  id: string;
  key: string;
  kind: "field";
  label: string;
  /** Paper column number. */
  no?: number;
  /** One cell holding two stored fields: Date-Time "YYGG", Past Weather "W1W2". */
  parts?: { keys: readonly [string, string]; length: number; width: number };
  /**
   * One stored value shown as two cells, like the paper's "Indicator and sign
   * 1Sn" beside the 3-digit temperature: `sign` holds the printed indicator
   * plus the sign digit ("10"), `digits` holds the rest.
   */
  signed?: {
    prefix: string;
    role: "digits" | "sign";
    /** Typical keyed digit after the prefix, shown as the sign cell placeholder. */
    example?: string;
  };
  /** A slightly wider cell for longer entries (barometer 1013.2). */
  size?: "md";
  /**
   * The upper cell is an entry for another field (Gust above Wind Speed).
   * `fallback` shows the reading decoded from the lower code while the entry is
   * empty (rows saved before kilometres were typed).
   */
  upper?: {
    code: string;
    fallback?: boolean;
    key: string;
    label: string;
    maxLength?: number;
  };
  /** Header name of the upper layer when it differs (Wet Bulb over Dew Point). */
  upperLabel?: string;
  wide?: boolean;
}

export interface FixedColumn {
  id: string;
  kind: "fixed";
  no?: number;
  text: string;
}

export type RegisterColumn = FixedColumn | FieldColumn;

export interface RegisterGroup {
  columns: readonly RegisterColumn[];
  title: string;
}

let fixedCount = 0;
const fixed = (text: string, no?: number): FixedColumn => ({
  id: `ind-${fixedCount++}`,
  kind: "fixed",
  no,
  text,
});
const field = (
  key: string,
  label: string,
  code: string,
  extra: Partial<Omit<FieldColumn, "code" | "key" | "kind" | "label">> = {}
): FieldColumn => ({
  code,
  id: extra.signed ? `${key}:${extra.signed.role}` : key,
  key,
  kind: "field",
  label,
  ...extra,
});

/** Indicator and sign (`1Sn`, `2Sn`, `5j1`) beside its value, two cells. */
const signedPair = (
  key: string,
  prefix: string,
  signCode: string,
  label: string,
  code: string,
  numbers: [number, number],
  extra: Partial<FieldColumn> = {},
  example = "0"
): FieldColumn[] => [
  field(key, "Ind. & Sign", signCode, {
    no: numbers[0],
    signed: { prefix, role: "sign", example },
    ...(extra.computed ? { computed: true } : {}),
  }),
  field(key, label, code, {
    no: numbers[1],
    signed: { prefix, role: "digits" },
    ...extra,
  }),
];

const layer = (n: number, first: number): RegisterColumn[] => [
  fixed("8", first),
  field(`s3_layer${n}_amount`, "Amt of Layer", "Ns", { no: first + 1 }),
  field(`s3_layer${n}_form`, "Form of Layer", "C", { no: first + 2 }),
  field(
    `s3_layer${n}_height`,
    n === 1 ? "Height of Lowest Layer" : "Height Next Higher Layer",
    "hshs",
    { no: first + 3 }
  ),
];

export const SECTION_0: RegisterGroup = {
  title: "SECTION 0 · IDENTIFICATION",
  columns: [
    field("report_type", "Report Indicator", "MiMiMjMj", { no: 1 }),
    field("date_time", "Date-Time GMT", "YYGG", {
      no: 2,
      parts: { keys: ["day", "time_utc"], length: 4, width: 2 },
    }),
    field("wind_indicator", "Wind Indicator", "iw", { no: 3 }),
    field("station_id", "Station Number", "IIiii", { no: 4 }),
  ],
};

export const SECTION_1: RegisterGroup = {
  title: "SECTION 1 · GLOBAL DATA",
  columns: [
    field("precip_indicator", "6-Group Indicator", "iR", { no: 5 }),
    field("station_wx_indicator", "7-Group Indicator", "ix", { no: 6 }),
    field("cloud_base", "Lowest Cloud Height", "h", { no: 7 }),
    field("visibility", "Visibility", "(VV) VV", {
      computed: true,
      no: 8,
      upper: {
        code: "km",
        fallback: true,
        key: "visibility_km",
        label: "Visibility (km)",
        maxLength: 5,
      },
      upperLabel: "Visibility km",
    }),
    field("total_cloud", "Total Cloud", "N", { no: 9 }),
    field("wind_dir", "Wind Direction", "(ddd) dd", { no: 10 }),
    field("wind_speed", "Wind Speed", "(fmfm) ff", {
      no: 11,
      upper: { code: "fmfm", key: "wind_gust", label: "Gust" },
    }),
    ...signedPair("air_temp", "1", "1Sn", "Air Temperature", "TTT", [12, 13]),
    ...signedPair(
      "dew_point",
      "2",
      "2Sn",
      "Dew Point",
      "(T'dT'd) TdTdTd",
      [14, 15],
      {
        computed: true,
        upper: { code: "T'dT'd", key: "wet_bulb", label: "Wet Bulb" },
        upperLabel: "Wet Bulb",
      }
    ),
    field("relative_humidity", "R.H.", "(e) UUU", {
      computed: true,
      no: 16,
      upperLabel: "V.P.",
    }),
    // Barometer as read; the cell above shows the total corrections (a station
    // setting). QFE and QNH over columns 19 and 21 are calculated from them.
    field("barometer_reading", "Barometer as Read", "Bar.", {
      no: 17,
      size: "md",
      upperLabel: "Total Corr.",
    }),
    fixed("3", 18),
    field("station_pressure", "Station Pressure", "P0P0P0P0", {
      no: 19,
      upperLabel: "QFE",
    }),
    fixed("4", 20),
    field("msl_pressure", "MSL Pressure", "PPPP", {
      no: 21,
      upperLabel: "QNH",
    }),
    fixed("6", 22),
    field("precip_amount", "Rainfall since Last Report", "RRR", { no: 23 }),
    field("precip_period", "6-hr Periods", "tR", { no: 24 }),
    fixed("7", 25),
    field("present_wx", "Present Weather", "ww", { no: 26 }),
    field("past_wx_1", "Past Weather", "W1W2", {
      no: 27,
      parts: { keys: ["past_wx_1", "past_wx_2"], length: 2, width: 1 },
    }),
    fixed("8", 28),
    field("low_cloud_amount", "Amount CL/CM", "Nh", { no: 29 }),
    field("low_cloud_type", "CL Clouds", "CL", { no: 30 }),
    field("mid_cloud_type", "CM Clouds", "CM", { no: 31 }),
    field("high_cloud_type", "CH Clouds", "CH", { no: 32 }),
  ],
};

export const SECTION_3: RegisterGroup = {
  title: "SECTION 3 · REGIONAL / NATIONAL DATA",
  columns: [
    fixed("333", 33),
    fixed("0", 34),
    field("s3_state_of_sky", "State of Sky", "Cs", { no: 35 }),
    field("s3_cloud_dir_low", "CL Direction", "DL", { no: 36 }),
    field("s3_cloud_dir_mid", "CM Direction", "DM", { no: 37 }),
    field("s3_cloud_dir_high", "CH Direction", "DH", { no: 38 }),
    ...signedPair(
      "s3_max_temp",
      "1",
      "1Sn",
      "Maximum Temperature",
      "TxTxTx",
      [39, 40]
    ),
    ...signedPair(
      "s3_min_temp",
      "2",
      "2Sn",
      "Minimum Temperature",
      "TnTnTn",
      [41, 42]
    ),
    ...signedPair(
      "s3_baro_change_24h",
      "5",
      "5j1",
      "24-hour Barometric Change",
      "P24P24P24",
      [43, 44],
      {},
      // The register keys j1 as 8 (rise or zero, group 58) or 9 (fall, 59).
      "8"
    ),
    fixed("7", 45),
    field("s3_rainfall_24h", "24-hour Rainfall", "R24R24R24R24", { no: 46 }),
    ...layer(1, 47),
    ...layer(2, 51),
    ...layer(3, 55),
    ...layer(4, 59),
    field("s3_group_909", "909 Group", "909"),
    field("s3_special_phenomena", "Special Phenomena", "9SpSpspsp", {
      no: 63,
    }),
    field("s3_remarks", "Remarks", "plain language, regional and national", {
      no: 64,
      wide: true,
    }),
    field("observer_initials", "Observer", "Initial", { no: 65 }),
  ],
};

/**
 * The TIME MARKS line of the paper register: the instrument charts marked at
 * the observation (anemograph, barograph, rain recorder, thermo-hygrograph).
 */
export const TIME_MARKS = [
  { key: "time_mark_anemograph", label: "Anemograph" },
  { key: "time_mark_barograph", label: "Barograph" },
  { key: "time_mark_rain_recorder", label: "Rain recorder" },
  { key: "time_mark_thermohygrograph", label: "Thermo-hygrograph" },
] as const;

// Stacked top to bottom: Section 0, then Section 1, then Section 3.
export const REGISTER_SECTIONS: readonly RegisterGroup[] = [
  SECTION_0,
  SECTION_1,
  SECTION_3,
];

export const REGISTER_FIELDS = REGISTER_SECTIONS.flatMap((section) =>
  section.columns.flatMap((column) => (column.kind === "field" ? [column] : []))
);

/** Stored field keys behind the cells (several cells may share one key). */
export const REGISTER_KEYS = [
  ...new Set([
    ...REGISTER_FIELDS.flatMap((column) => [
      ...(column.parts ? column.parts.keys : [column.key]),
      ...(column.upper ? [column.upper.key] : []),
    ]),
    ...TIME_MARKS.map((mark) => mark.key),
  ]),
];

/** "Wind Direction (dd)": how an issue names its field. */
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  REGISTER_FIELDS.filter((column) => column.signed?.role !== "sign").flatMap(
    (column) => {
      const name = `${column.label} (${column.code})`;
      return [
        ...(column.parts ? column.parts.keys : [column.key]).map(
          (key): [string, string] => [key, name]
        ),
        ...(column.upper
          ? [
              [
                column.upper.key,
                `${column.upper.label} (${column.upper.code})`,
              ] as [string, string],
            ]
          : []),
      ];
    }
  )
);

FIELD_LABELS.visibility_km = "Visibility in km";
for (const mark of TIME_MARKS) {
  FIELD_LABELS[mark.key] = `Time mark: ${mark.label}`;
}

/** The stored keys a cell edits. */
export function columnKeys(column: FieldColumn): readonly string[] {
  return column.parts ? column.parts.keys : [column.key];
}

const FULL_SIGNED_LENGTH = 4;

/** Split a stored sign+digits value ("0254") into its lead and digits. */
export function splitSigned(
  stored: string,
  lead?: string
): { digits: string; lead: string } {
  if (lead !== undefined) {
    return { digits: stored.slice(lead.length), lead };
  }
  return stored.length === FULL_SIGNED_LENGTH
    ? { digits: stored.slice(1), lead: stored.slice(0, 1) }
    : { digits: stored, lead: "" };
}

/** What a cell shows: the stored text, or the part of it the cell owns. */
export function cellValue(
  column: FieldColumn,
  values: Record<string, string>,
  leads: Record<string, string> = {}
): string {
  if (column.parts) {
    return column.parts.keys.map((key) => values[key] ?? "").join("");
  }
  const stored = values[column.key] ?? "";
  if (!column.signed) return stored;
  const { digits, lead } = splitSigned(stored, leads[column.key]);
  if (column.signed.role === "digits") return digits;
  return lead ? `${column.signed.prefix}${lead}` : "";
}

/** The stored values a cell edit changes, and the lead to remember. */
export function cellUpdates(
  column: FieldColumn,
  text: string,
  values: Record<string, string>,
  leads: Record<string, string> = {}
): { lead?: string; updates: [string, string][] } {
  if (column.parts) {
    const { keys, length, width } = column.parts;
    return {
      updates: [
        [keys[0], text.slice(0, width)],
        [keys[1], text.slice(width, length)],
      ],
    };
  }
  if (!column.signed) return { updates: [[column.key, text]] };
  const { digits, lead } = splitSigned(
    values[column.key] ?? "",
    leads[column.key]
  );
  if (column.signed.role === "sign") {
    // "10" = indicator 1 and sign 0; a lone indicator digit leaves the sign open.
    const next = text.length >= 2 ? text.slice(1, 2) : "";
    return { lead: next, updates: [[column.key, `${next}${digits}`]] };
  }
  return { updates: [[column.key, `${lead}${text}`]] };
}
