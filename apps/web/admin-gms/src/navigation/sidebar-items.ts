import {
  AlertTriangle,
  BookOpen,
  Bus,
  Calendar,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Compass,
  FileText,
  Fingerprint,
  House,
  LayoutDashboard,
  type LucideIcon,
  Map as MapIcon,
  NotebookPen,
  Package,
  Plane,
  Radar,
  Rss,
  SprayCan,
  SquarePen,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Ticket,
  Tornado,
  Users,
  Waves,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  badge?: NavBadge;
  disabled?: boolean;
  icon?: LucideIcon;
  id: string;
  newTab?: boolean;
  title: string;
  url: string;
}

interface NavItemBase {
  badge?: NavBadge;
  disabled?: boolean;
  icon?: LucideIcon;
  id: string;
  newTab?: boolean;
  title: string;
}

export interface NavMainLinkItem extends NavItemBase {
  subItems?: never;
  url: string;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  items: NavMainItem[];
  label?: string;
}

// Placeholder destination for target-IA sections that have no page yet.
// Keeps the "still beta" nav honest: every item lands somewhere real (no 404s)
// while advertising the intended structure via a "soon" badge.
const COMING_SOON_URL = "/coming-soon";

// Group order is deliberate: daily coordination (ungrouped) and HR first (the
// actively built surface), then the weather production groups, then station
// operations. "Products" mirrors the service areas in the internal product
// catalogue so the nav grows with the catalogue instead of being restructured
// per product. HR Setup has no nav row — it is reached from the HR dashboard.
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      { id: "home", title: "Home", url: "/", icon: House },
      { id: "calendar", title: "Calendar", url: "/calendar", icon: Calendar },
      { id: "roster", title: "Roster", url: "/roster", icon: CalendarDays },
      { id: "staff", title: "Staff", url: "/users", icon: Users },
    ],
  },
  {
    id: 2,
    label: "Human Resources",
    items: [
      {
        id: "hr-overview",
        title: "Dashboard",
        url: "/hr",
        icon: LayoutDashboard,
      },
      {
        id: "hr-clock-in",
        title: "Clock In",
        url: COMING_SOON_URL,
        icon: Fingerprint,
        badge: "soon",
      },
      {
        id: "hr-daily-forms",
        title: "Daily Forms",
        icon: FileText,
        subItems: [
          {
            id: "hr-status",
            title: "Daily Status Report",
            url: "/hr/status",
          },
          { id: "hr-timesheet", title: "Timesheet", url: "/hr/timesheet" },
        ],
      },
      {
        id: "hr-requests",
        title: "Requests",
        icon: ClipboardList,
        subItems: [
          { id: "hr-leave", title: "Leave Application", url: "/hr/leave" },
          { id: "hr-shift", title: "Shift Exchange", url: "/hr/shift" },
          { id: "hr-absentee", title: "Absentee Report", url: "/hr/absentee" },
        ],
      },
      {
        id: "hr-approvals",
        title: "Approvals",
        url: "/hr/approvals",
        icon: CheckSquare,
      },
    ],
  },
  {
    id: 3,
    label: "Observations",
    items: [
      {
        id: "eregister",
        title: "eRegister (Hourly)",
        url: "/wxproducts/hourly",
        icon: NotebookPen,
      },
      { id: "wxwatch", title: "WxWatch", url: "/wxwatch", icon: Radar },
      {
        id: "climate-data",
        title: "Climate & Data",
        url: COMING_SOON_URL,
        icon: Thermometer,
        badge: "soon",
      },
    ],
  },
  {
    id: 4,
    label: "Warnings",
    items: [
      { id: "cap-alerts", title: "Alerts", url: "/cap", icon: AlertTriangle },
      { id: "cap-map", title: "Map", url: "/cap/map", icon: MapIcon },
      { id: "cap-feeds", title: "Feeds", url: "/cap/integrations", icon: Rss },
      { id: "cap-editor", title: "Editor", url: "/cap/admin", icon: SquarePen },
    ],
  },
  {
    id: 5,
    label: "Forecasts",
    items: [
      {
        id: "fcst-morning",
        title: "Morning",
        url: "/wxproducts/fcsts/morning",
        icon: Sunrise,
      },
      {
        id: "fcst-midday",
        title: "Midday",
        url: "/wxproducts/fcsts/midday",
        icon: Sun,
      },
      {
        id: "fcst-evening",
        title: "Evening",
        url: "/wxproducts/fcsts/evening",
        icon: Sunset,
      },
    ],
  },
  {
    id: 6,
    label: "Products",
    items: [
      {
        id: "products-tc-outlook",
        title: "Tropical Weather Outlook",
        url: COMING_SOON_URL,
        icon: Tornado,
        badge: "soon",
      },
      {
        id: "products-marine",
        title: "Marine",
        icon: Waves,
        subItems: [
          {
            id: "bulletin-marine",
            title: "Marine Bulletin",
            url: "/wxproducts/bulletins/marine",
          },
        ],
      },
      {
        id: "products-aviation",
        title: "Aviation",
        url: COMING_SOON_URL,
        icon: Plane,
        badge: "soon",
      },
      {
        id: "products-sectors",
        title: "Other Sectors",
        url: COMING_SOON_URL,
        icon: Compass,
        badge: "soon",
      },
    ],
  },
  {
    id: 7,
    label: "Operations",
    items: [
      {
        // Repurposed salesbus module: internal stores/supplies requisition.
        // Routes keep the /salesbus prefix until the pages are reworked.
        id: "stores",
        title: "Stores",
        icon: Package,
        subItems: [
          {
            id: "stores-requisition",
            title: "Requisition",
            url: "/salesbus/sales",
          },
          {
            id: "stores-inventory",
            title: "Inventory",
            url: "/salesbus/inventory",
          },
          {
            id: "stores-delivered",
            title: "Delivered",
            url: "/salesbus/settlements",
          },
        ],
      },
      { id: "bus", title: "Bus", url: "/bus", icon: Bus },
      { id: "janitor", title: "Janitor", url: "/janitor", icon: SprayCan },
      {
        id: "it-tickets",
        title: "IT Tickets",
        url: COMING_SOON_URL,
        icon: Ticket,
        badge: "soon",
      },
      {
        id: "resources",
        title: "Resources",
        url: COMING_SOON_URL,
        icon: BookOpen,
        badge: "soon",
      },
    ],
  },
];
