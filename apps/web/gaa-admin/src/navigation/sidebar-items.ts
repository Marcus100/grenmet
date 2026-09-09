import {
  AlertTriangle,
  BookOpen,
  Bus,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  CloudSun,
  Contact,
  FileText,
  Gauge,
  House,
  type LucideIcon,
  NotebookPen,
  Package,
  Plane,
  Radar,
  SprayCan,
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
// while keeping unfinished sections reachable.

// Group order is deliberate: daily coordination and HR (the actively built
// surface) sit ungrouped up top, then "Products" (every forecaster-facing
// product and composer), then "Services" (Climate & Data), then station
// "Operations".
export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      { id: "home", title: "Home", url: "/", icon: House },
      { id: "calendar", title: "Calendar", url: "/calendar", icon: Calendar },
      {
        // Ordered by daily rhythm: the dashboard people land on, the forms they
        // file, then the supervisory surfaces. HR Setup is deliberately absent
        // — it is configuration, reached from the dashboard's HR Setup card,
        // not a daily destination.
        id: "hr",
        title: "Human Resources",
        icon: Contact,
        subItems: [
          { id: "hr-dashboard", title: "Dashboard", url: "/hr", icon: Gauge },
          {
            id: "hr-forms",
            title: "Forms",
            url: "/hr/forms",
            icon: FileText,
          },
          {
            id: "hr-approvals",
            title: "Approvals",
            url: "/hr/approvals",
            icon: ClipboardCheck,
          },
          {
            id: "roster",
            title: "Duty Roster",
            url: "/roster",
            icon: CalendarDays,
          },
        ],
      },
      { id: "staff", title: "Staff", url: "/users", icon: Users },
    ],
  },
  {
    id: 2,
    label: "Products",
    // Ordered by the production rhythm, most frequent first: hourly
    // observations, continuous station monitoring, the 3×-daily forecast desk,
    // scheduled aviation products, daily bulletins/outlooks, and event-driven
    // alerting last.
    items: [
      {
        id: "eregister",
        title: "wxRegister",
        url: "/wxproducts/hourly",
        icon: NotebookPen,
      },
      { id: "wxwatch", title: "WxWatch", url: "/wxwatch", icon: Radar },
      {
        id: "forecasts",
        title: "Impact-Based Forecasts",
        url: "/wxproducts/fcsts",
        icon: CloudSun,
      },
      {
        id: "taf-metar",
        title: "TAF/Metar Composer",
        url: "/wxproducts/aviation",
        icon: Plane,
      },
      {
        id: "bulletin-marine",
        title: "Bulletins",
        url: "/wxproducts/bulletins",
        icon: Waves,
      },
      {
        id: "products-tc-outlook",
        title: "NHC Products",
        url: "/wxproducts/nhc",
        icon: Tornado,
      },
      {
        id: "cap-composer",
        title: "CAP Composer",
        url: "/cap",
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 3,
    label: "Services",
    items: [
      {
        id: "climate-data",
        title: "Climate & Data",
        url: "/climate",
        icon: Thermometer,
      },
    ],
  },
  {
    id: 4,
    label: "Operations",
    // Ordered like Products — daily scheduled operations first (transport and
    // facility runs happen every shift/day), then as-needed supplies, then
    // event-driven tickets, with reference material last.
    items: [
      { id: "bus", title: "Bus", url: "/bus", icon: Bus },
      { id: "janitor", title: "Janitor", url: "/janitor", icon: SprayCan },
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
      {
        id: "it-tickets",
        title: "IT Tickets",
        url: "/it-tickets",
        icon: Ticket,
      },
      {
        id: "resources",
        title: "Resources",
        url: "/resources",
        icon: BookOpen,
      },
    ],
  },
];
