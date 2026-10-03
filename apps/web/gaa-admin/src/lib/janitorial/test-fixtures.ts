import type {
  JanitorialAccess,
  JanitorialArea,
  JanitorialBuilding,
  JanitorialCatalogue,
  JanitorialGrant,
  JanitorialShiftBoard,
  JanitorialStaffList,
} from "@barrelsgd/api-client";

// Shared janitorial catalogue fixtures for unit and page tests.

function area(
  overrides: Partial<JanitorialArea> & { id: number }
): JanitorialArea {
  return {
    code: `GND-A${String(overrides.id).padStart(4, "0")}`,
    name: "Area",
    sectionId: null,
    spaceType: "other",
    cleanlinessLevel: null,
    quantity: 1,
    active: true,
    revision: 1,
    tasks: [],
    bundles: [],
    ...overrides,
  };
}

export const terminal: JanitorialBuilding = {
  id: 1,
  siteId: 1,
  code: "air-terminal-building-atb",
  name: "Air Terminal Building (ATB)",
  kind: "terminal",
  active: true,
  revision: 1,
  sections: [
    {
      id: 2,
      name: "Meeting Rooms & Office Spaces",
      note: null,
      active: true,
      revision: 1,
    },
  ],
  areas: [
    area({
      id: 10,
      name: "Restrooms",
      spaceType: "restroom",
      cleanlinessLevel: 1,
      quantity: 6,
      tasks: [
        {
          id: 100,
          activity: "Clean Mirrors",
          mode: "light",
          active: true,
          revision: 1,
          frequency: { count: 1, periodValue: 15, periodUnit: "minute" },
        },
        {
          id: 101,
          activity: "Retired Task",
          mode: null,
          active: false,
          revision: 2,
          frequency: { count: 1, periodValue: 5, periodUnit: "minute" },
        },
      ],
    }),
    area({
      id: 11,
      name: "Reception Area",
      sectionId: 2,
      spaceType: "office",
      cleanlinessLevel: 2,
      bundles: [
        {
          id: 5,
          name: "Terrazzo Maintenance and Floor Care",
          items: [
            {
              activity: "Buff Terrazzo Floor",
              frequency: { count: 3, periodValue: 5, periodUnit: "day" },
            },
          ],
        },
      ],
    }),
    area({ id: 12, name: "Old Kiosk", active: false }),
  ],
};

export const tower: JanitorialBuilding = {
  id: 3,
  siteId: 1,
  code: "air-traffic-control-tower",
  name: "Control Tower",
  kind: "auxiliary",
  active: true,
  revision: 1,
  sections: [],
  areas: [
    area({
      id: 20,
      name: "Whole building",
      spaceType: "technical",
      cleanlinessLevel: 3,
      tasks: [
        {
          id: 200,
          activity: "Sweep Stairs",
          mode: null,
          active: true,
          revision: 1,
          frequency: { count: 1, periodValue: 1, periodUnit: "day" },
        },
      ],
    }),
  ],
};

export const catalogue: JanitorialCatalogue = {
  sites: [
    { id: 1, code: "GND", name: "Maurice Bishop International Airport" },
    { id: 2, code: "CRU", name: "Lauriston Airport" },
  ],
  buildings: [terminal, tower],
};

export const managerAccess: JanitorialAccess = {
  canView: true,
  canManageCatalogue: true,
  canManageStaff: true,
  canManageShifts: true,
  canManageScope: true,
  buildingIds: null,
};

export const viewerAccess: JanitorialAccess = {
  canView: true,
  canManageCatalogue: false,
  canManageStaff: false,
  canManageShifts: false,
  canManageScope: false,
  buildingIds: [1, 3],
};

export const noAccess: JanitorialAccess = {
  ...viewerAccess,
  canView: false,
  buildingIds: [],
};

export const staffList: JanitorialStaffList = {
  contractors: [
    {
      id: "7a1c2b9e-2f5e-4f0e-9a51-1b2c3d4e5f60",
      name: "CleanCo Ltd",
      active: true,
      revision: 1,
    },
  ],
  staff: [
    {
      id: "5f2b8e0a-7c1d-4e3f-8a9b-0c1d2e3f4a5b",
      userId: "0b5d7c3e-1a2f-4b6c-9d8e-7f6a5b4c3d2e",
      name: "Maria Joseph",
      email: "maria@cleanco.example.com",
      accountActive: true,
      contractorId: "7a1c2b9e-2f5e-4f0e-9a51-1b2c3d4e5f60",
      role: "cleaner",
      badgeNo: "C-014",
      active: true,
      revision: 1,
    },
    {
      id: "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f",
      userId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      name: "Kevin Paul",
      email: "kevin@cleanco.example.com",
      accountActive: false,
      contractorId: "7a1c2b9e-2f5e-4f0e-9a51-1b2c3d4e5f60",
      role: "contractor_supervisor",
      badgeNo: null,
      active: true,
      revision: 1,
    },
  ],
};

export const grants: JanitorialGrant[] = [
  {
    id: "3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b",
    userId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
    name: "Sam Supervisor",
    email: "sam@gaa.example.com",
    buildingId: 3,
    grantedBy: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6b",
    grantedAt: "2026-09-20T12:00:00Z",
  },
];

export const shiftBoard: JanitorialShiftBoard = {
  patterns: [
    {
      id: 1,
      siteId: 1,
      name: "Morning",
      startsAt: "06:00",
      endsAt: "14:00",
      active: true,
      revision: 1,
    },
    {
      id: 2,
      siteId: 1,
      name: "Night",
      startsAt: "22:00",
      endsAt: "06:00",
      active: true,
      revision: 1,
    },
  ],
  zones: [
    {
      id: 4,
      siteId: 1,
      name: "Terminal restrooms",
      areaIds: [10],
      active: true,
      revision: 1,
    },
  ],
  assignments: [
    {
      id: "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
      workDate: "2026-10-05",
      shiftPatternId: 1,
      staffId: "5f2b8e0a-7c1d-4e3f-8a9b-0c1d2e3f4a5b",
      zoneId: 4,
      status: "scheduled",
      note: null,
      revision: 1,
    },
    {
      id: "6c5d4e3f-2a1b-4c9d-8e7f-6a5b4c3d2e1f",
      workDate: "2026-10-06",
      shiftPatternId: 2,
      staffId: "5f2b8e0a-7c1d-4e3f-8a9b-0c1d2e3f4a5b",
      zoneId: 4,
      status: "cancelled",
      note: null,
      revision: 2,
    },
  ],
};
