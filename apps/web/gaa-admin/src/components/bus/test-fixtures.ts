import type {
  TimetableTripView,
  TimetableVersionDetail,
  TimetableVersionSummary,
  TransportAccess,
  TransportCatalogue,
} from "@barrelsgd/api-client";

export const fullAccess: TransportAccess = {
  canView: true,
  canManageTimetable: true,
  canPublishTimetable: true,
};

export const viewerAccess: TransportAccess = {
  canView: true,
  canManageTimetable: false,
  canPublishTimetable: false,
};

export const staffAccess: TransportAccess = {
  canView: false,
  canManageTimetable: false,
  canPublishTimetable: false,
};

export const catalogue: TransportCatalogue = {
  routes: [
    {
      id: 1,
      number: 1,
      name: "St. Patrick (Western Main Road)",
      description: "Along the Western Main Road unto MBIA",
      active: true,
    },
    {
      id: 6,
      number: 6,
      name: "Mardigras and Surrounding Areas",
      description: null,
      active: true,
    },
  ],
  shifts: [
    {
      id: 1,
      slug: "morning",
      name: "Morning",
      startTime: "05:30",
      endTime: "14:00",
    },
  ],
  stops: [
    {
      id: 11,
      code: "VICTORIA-POLICE",
      name: "Victoria Police Station",
      landmark: null,
      latitude: 12.19,
      longitude: -61.7,
      active: true,
      routeNumbers: [1],
    },
    {
      id: 12,
      code: "MARDIGRAS",
      name: "Mardigras",
      landmark: "Junction by the church",
      latitude: null,
      longitude: null,
      active: true,
      routeNumbers: [6],
    },
  ],
  calendars: [
    {
      id: 1,
      slug: "daily",
      name: "Daily",
      days: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      runsOnPublicHolidays: true,
    },
  ],
};

export const route1Trip: TimetableTripView = {
  id: 100,
  routeId: 1,
  shiftId: 1,
  calendarId: 1,
  direction: "inbound",
  departTime: "03:30",
  arriveTime: "05:30",
  status: "confirmed",
  notes: null,
  sourceRef: null,
  stops: [
    {
      sequence: 1,
      stopId: 11,
      stopName: "Victoria Police Station",
      time: "03:30",
      timepoint: false,
    },
  ],
};

export const route6Trip: TimetableTripView = {
  ...route1Trip,
  id: 600,
  routeId: 6,
  departTime: "04:30",
  status: "awaiting_confirmation",
  notes: "Awaiting GAA HR confirmation.",
  stops: [
    {
      sequence: 1,
      stopId: 12,
      stopName: "Mardigras",
      time: null,
      timepoint: false,
    },
  ],
};

export function summary(
  overrides: Partial<TimetableVersionSummary> = {}
): TimetableVersionSummary {
  return {
    id: 1,
    label: "GAA staff transport memo",
    status: "published",
    state: "current",
    effectiveDate: "2026-09-25",
    sourceRef: "seed/transport-routes.csv",
    notes: null,
    basedOnId: null,
    createdAt: "2026-09-25T08:00:00Z",
    updatedAt: "2026-09-25T08:00:00Z",
    publishedAt: "2026-09-25T08:00:00Z",
    tripCount: 2,
    ...overrides,
  };
}

export function detail(
  overrides: Partial<TimetableVersionDetail> = {}
): TimetableVersionDetail {
  return {
    version: summary(),
    trips: [route1Trip, route6Trip],
    issues: [
      {
        severity: "warning",
        code: "awaiting_confirmation",
        message: "Times are awaiting confirmation",
        tripId: 600,
        routeId: 6,
      },
    ],
    ...overrides,
  };
}
