import {
  timetablePublishSchema,
  timetableTripInputSchema,
  timetableVersionCreateSchema,
  transportAddTimetableTrip,
  transportCreateRouteEntry,
  transportCreateStop,
  transportCreateTimetableDraft,
  transportDeleteTimetableTrip,
  transportDiscardTimetableDraft,
  transportPublishTimetableDraft,
  transportReplaceTimetableTrip,
  transportRouteInputSchema,
  transportStopInputSchema,
  transportUpdateRouteEntry,
  transportUpdateStop,
  transportUpdateTimetableDraft,
} from "@barrelsgd/api-client";

// Client-side mutations through the gaa-admin API proxy. Bodies are parsed with
// the generated Zod schemas first so malformed input never reaches the API.

export const startDraft = (body: unknown) =>
  transportCreateTimetableDraft({
    body: timetableVersionCreateSchema.parse(body),
  }).unwrap();

export const saveDraftDetails = (versionId: number, body: unknown) =>
  transportUpdateTimetableDraft({
    path: { version_id: versionId },
    body: timetableVersionCreateSchema.parse(body),
  }).unwrap();

export const discardDraft = (versionId: number) =>
  transportDiscardTimetableDraft({ path: { version_id: versionId } }).unwrap();

export const publishDraft = (versionId: number, body: unknown) =>
  transportPublishTimetableDraft({
    path: { version_id: versionId },
    body: timetablePublishSchema.parse(body),
  }).unwrap();

export const saveTrip = (
  versionId: number,
  tripId: number | null,
  body: unknown
) => {
  const parsed = timetableTripInputSchema.parse(body);
  return tripId === null
    ? transportAddTimetableTrip({
        path: { version_id: versionId },
        body: parsed,
      }).unwrap()
    : transportReplaceTimetableTrip({
        path: { version_id: versionId, trip_id: tripId },
        body: parsed,
      }).unwrap();
};

export const removeTrip = (versionId: number, tripId: number) =>
  transportDeleteTimetableTrip({
    path: { version_id: versionId, trip_id: tripId },
  }).unwrap();

export const saveStop = (stopId: number | null, body: unknown) => {
  const parsed = transportStopInputSchema.parse(body);
  return stopId === null
    ? transportCreateStop({ body: parsed }).unwrap()
    : transportUpdateStop({ path: { stop_id: stopId }, body: parsed }).unwrap();
};

export const saveRoute = (routeId: number | null, body: unknown) => {
  const parsed = transportRouteInputSchema.parse(body);
  return routeId === null
    ? transportCreateRouteEntry({ body: parsed }).unwrap()
    : transportUpdateRouteEntry({
        path: { route_id: routeId },
        body: parsed,
      }).unwrap();
};

/** The API's `detail` message when there is one; otherwise a generic fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
    const issues = (error as { issues?: { message?: unknown }[] }).issues;
    const first = issues?.[0]?.message;
    if (typeof first === "string") return first;
  }
  return fallback;
}
