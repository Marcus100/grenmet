import type {
  CapAlertCreate,
  CapAlertPublic,
  CapAlertUpdate,
  CapAreaCreate,
  CapAreaPublic,
  CapCategory,
  CapCertainty,
  CapInfoCreate,
  CapInfoPublic,
  CapNameValue,
  CapScope,
  CapSettingsPublic,
  CapSeverity,
  CapStatus,
  CapUrgency,
  GmsColour,
} from "@barrelsgd/api-client";
import { parseSectors, type SectorKey } from "@barrelsgd/gms/sectors";
import {
  AWARENESS_PARAMETER,
  type GmsCatalogue,
  type GmsProduct,
  levelParameters,
  needsColour,
  PRODUCT_PARAMETER,
  SECTORS_PARAMETER,
  sectorParameters,
} from "./cap/cap-levels";

/**
 * The desk editor's form, and the conversions between it and the API. Pure:
 * every rule that decides whether a warning may be published lives in FastAPI;
 * this only shapes what the forecaster typed into `CapAlertCreate` or
 * `CapAlertUpdate`, and back again when a saved draft is edited.
 */
export interface AlertFields {
  certainty: CapCertainty;
  contact: string;
  description: string;
  effective: string;
  event: string;
  expires: string;
  headline: string;
  instruction: string;
  language: string;
  note: string;
  onset: string;
  scope: CapScope;
  senderName: string;
  severity: CapSeverity;
  status: CapStatus;
  urgency: CapUrgency;
  web: string;
}

export interface AlertFormState {
  areas: CapAreaCreate[];
  categories: CapCategory[];
  colour: GmsColour | null;
  fields: AlertFields;
  product: GmsProduct | null;
  sectors: SectorKey[];
  /** Source bulletin parameters to save (empty: none linked). */
  sourceParameters: CapNameValue[];
}

/** What an edit carries over untouched: everything the form does not show. */
export interface EditCarryOver {
  /** Fields of the first info block the form does not show. */
  infoExtras: Pick<
    CapInfoCreate,
    "audience" | "event_codes" | "resources" | "response_types"
  >;
  /** Info blocks after the first; the desk edits the first only. */
  otherInfo: CapInfoCreate[];
  /** Parameters of the first info block the form does not manage. */
  otherParameters: CapNameValue[];
}

const SOURCE_PARAMETERS = new Set([
  "GMS:source-bulletin-kind",
  "GMS:source-bulletin-id",
  "GMS:source-bulletin-revision",
]);
const MANAGED_PARAMETERS = new Set([
  PRODUCT_PARAMETER,
  AWARENESS_PARAMETER,
  SECTORS_PARAMETER,
  ...SOURCE_PARAMETERS,
]);
const PRODUCTS: readonly GmsProduct[] = [
  "Outlook",
  "Watch",
  "Warning",
  "Advisory",
];

export const DEFAULT_FIELDS: AlertFields = {
  certainty: "Unknown",
  contact: "meteorology@gaa.gd; 1-473-444-4142",
  description: "",
  effective: "",
  event: "",
  expires: "",
  headline: "",
  instruction: "",
  language: "en",
  note: "",
  onset: "",
  scope: "Public",
  senderName: "Grenada Meteorological Service",
  severity: "Unknown",
  status: "Actual",
  urgency: "Unknown",
  web: "",
};

/**
 * A new alert. Only the sender's identity is seeded (from CAP settings); no
 * hazard content is ever prefilled.
 */
export function emptyForm(settings?: CapSettingsPublic | null): AlertFormState {
  return {
    areas: [],
    categories: [],
    colour: null,
    fields: {
      ...DEFAULT_FIELDS,
      contact: settings?.contact || DEFAULT_FIELDS.contact,
      senderName: settings?.sender_name || DEFAULT_FIELDS.senderName,
      web: settings?.web ?? DEFAULT_FIELDS.web,
    },
    product: null,
    sectors: [],
    sourceParameters: [],
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A saved UTC instant as a datetime-local value in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local (browser local time) to the UTC ISO string the API expects. */
export function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parameterValue(
  parameters: readonly CapNameValue[],
  name: string
): string | undefined {
  return parameters.find((item) => item.value_name === name)?.value;
}

/** "Moderate; orange; Severe" (awareness_level) to "orange". */
function colourFromAwareness(
  catalogue: GmsCatalogue,
  value: string | undefined
): GmsColour | null {
  const key = value?.split(";")[1]?.trim();
  const rule = catalogue.colours.find((item) => item.key === key);
  return rule ? (rule.key as GmsColour) : null;
}

export function areaToCreate(area: CapAreaPublic): CapAreaCreate {
  return {
    altitude: area.altitude,
    area_desc: area.area_desc,
    ceiling: area.ceiling,
    circles: area.circles,
    geocodes: area.geocodes,
    geometry: area.geometry,
    kind: area.kind,
    multipolygons: area.multipolygons,
    polygons: area.polygons,
    predefined_area_id: area.predefined_area_id,
  };
}

export function infoToCreate(info: CapInfoPublic): CapInfoCreate {
  return {
    areas: (info.areas ?? []).map(areaToCreate),
    audience: info.audience,
    categories: info.categories,
    certainty: info.certainty,
    contact: info.contact,
    description: info.description,
    effective: info.effective,
    event: info.event,
    event_codes: info.event_codes,
    expires: info.expires,
    headline: info.headline,
    instruction: info.instruction,
    language: info.language,
    onset: info.onset,
    parameters: info.parameters,
    resources: (info.resources ?? []).map((resource) => ({
      deref_uri: resource.deref_uri,
      digest: resource.digest,
      mime_type: resource.mime_type,
      resource_desc: resource.resource_desc,
      size: resource.size,
      uri: resource.uri,
    })),
    response_types: info.response_types,
    sender_name: info.sender_name,
    severity: info.severity,
    urgency: info.urgency,
    web: info.web,
  };
}

/** A saved draft back into the form, plus what the form must carry over untouched. */
export function formFromAlert(
  alert: CapAlertPublic,
  catalogue: GmsCatalogue
): { form: AlertFormState; carryOver: EditCarryOver } {
  const [first, ...rest] = alert.info ?? [];
  const parameters = first?.parameters ?? [];
  const productValue = parameterValue(parameters, PRODUCT_PARAMETER);
  const product = PRODUCTS.find((item) => item === productValue) ?? null;
  return {
    form: {
      areas: (first?.areas ?? []).map(areaToCreate),
      categories: first?.categories ?? [],
      colour: colourFromAwareness(
        catalogue,
        parameterValue(parameters, AWARENESS_PARAMETER)
      ),
      fields: {
        certainty: first?.certainty ?? "Unknown",
        contact: first?.contact ?? "",
        description: first?.description ?? "",
        effective: toLocalInput(first?.effective),
        event: first?.event ?? "",
        expires: toLocalInput(first?.expires),
        headline: first?.headline ?? "",
        instruction: first?.instruction ?? "",
        language: first?.language ?? "en",
        note: alert.note ?? "",
        onset: toLocalInput(first?.onset),
        scope: alert.scope,
        senderName: first?.sender_name ?? "",
        severity: first?.severity ?? "Unknown",
        status: alert.status,
        urgency: first?.urgency ?? "Unknown",
        web: first?.web ?? "",
      },
      product,
      sectors: parseSectors(parameterValue(parameters, SECTORS_PARAMETER)),
      sourceParameters: parameters.filter((item) =>
        SOURCE_PARAMETERS.has(item.value_name)
      ),
    },
    carryOver: {
      infoExtras: {
        audience: first?.audience,
        event_codes: first?.event_codes,
        resources: first ? infoToCreate(first).resources : [],
        response_types: first?.response_types,
      },
      otherInfo: rest.map(infoToCreate),
      otherParameters: parameters.filter(
        (item) => !MANAGED_PARAMETERS.has(item.value_name)
      ),
    },
  };
}

/** The first reason the draft cannot be saved yet, or null. */
export function blockingError(
  form: AlertFormState,
  catalogue: GmsCatalogue
): string | null {
  const { fields } = form;
  if (
    !(
      fields.headline.trim() &&
      fields.event.trim() &&
      fields.description.trim()
    )
  ) {
    return "Headline, event, and description are required.";
  }
  if (form.categories.length === 0) {
    return "Select at least one CAP category.";
  }
  if (!form.product) {
    return "Choose the product: Outlook, Watch, Warning or Small Craft Advisory.";
  }
  if (needsColour(catalogue, form.product) && !form.colour) {
    return `Choose a colour for this ${form.product}.`;
  }
  return null;
}

function buildInfo(
  form: AlertFormState,
  catalogue: GmsCatalogue,
  carryOver: EditCarryOver | null
): CapInfoCreate {
  const { fields } = form;
  const product = form.product as GmsProduct;
  return {
    ...(carryOver?.infoExtras ?? {}),
    areas: form.areas,
    categories: form.categories,
    certainty: fields.certainty,
    contact: fields.contact.trim() || null,
    description: fields.description.trim(),
    effective: toIsoOrNull(fields.effective),
    event: fields.event.trim(),
    expires: toIsoOrNull(fields.expires),
    headline: fields.headline.trim(),
    instruction: fields.instruction.trim() || null,
    language: fields.language.trim() || "en",
    onset: toIsoOrNull(fields.onset),
    parameters: [
      ...levelParameters(catalogue, product, form.colour),
      ...sectorParameters(form.sectors),
      ...form.sourceParameters,
      ...(carryOver?.otherParameters ?? []),
    ],
    sender_name: fields.senderName.trim() || null,
    severity: fields.severity,
    urgency: fields.urgency,
    web: fields.web.trim() || null,
  };
}

/** A new desk alert is always an Alert: Updates come from Issue Update, Cancels from Cancel. */
export function buildCreatePayload(
  form: AlertFormState,
  catalogue: GmsCatalogue
): CapAlertCreate {
  return {
    info: [buildInfo(form, catalogue, null)],
    msg_type: "Alert",
    note: form.fields.note.trim() || null,
    scope: form.fields.scope,
    status: form.fields.status,
  };
}

/**
 * PATCH body for a saved draft. Message type, sender, identifier, references
 * and incidents are left out, so FastAPI keeps them; every info block is sent
 * because the API replaces the list as a whole.
 */
export function buildUpdatePayload(
  form: AlertFormState,
  catalogue: GmsCatalogue,
  carryOver: EditCarryOver
): CapAlertUpdate {
  return {
    info: [buildInfo(form, catalogue, carryOver), ...carryOver.otherInfo],
    note: form.fields.note.trim(),
    scope: form.fields.scope,
    status: form.fields.status,
  };
}
