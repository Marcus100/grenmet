import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Bus,
  Calendar,
  CalendarDays,
  ChartBar,
  CheckSquare,
  Clock,
  Compass,
  FileText,
  Fingerprint,
  Gauge,
  GraduationCap,
  History,
  House,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MessagesSquare,
  Plane,
  Radar,
  Rocket,
  Rss,
  ScrollText,
  Server,
  Settings2,
  ShoppingBag,
  SprayCan,
  SquareKanban,
  SquarePen,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Ticket,
  Truck,
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
const COMING_SOON_URL = "/studio/coming-soon";

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Admin",
    items: [
      { id: "home", title: "Home", url: "/", icon: House },
      { id: "calendar", title: "Calendar", url: "/calendar", icon: Calendar },
      { id: "roster", title: "Roster", url: "/roster", icon: CalendarDays },
      { id: "staff", title: "Staff", url: "/users", icon: Users },
    ],
  },
  {
    id: 2,
    label: "Human Resource",
    items: [
      {
        id: "hr-overview",
        title: "Overview",
        url: "/hr",
        icon: LayoutDashboard,
      },
      {
        id: "hr-forms",
        title: "Forms",
        icon: FileText,
        subItems: [
          { id: "hr-leave", title: "Leave Application", url: "/hr/leave" },
          { id: "hr-shift", title: "Shift Exchange", url: "/hr/shift" },
          { id: "hr-absentee", title: "Absentee Report", url: "/hr/absentee" },
        ],
      },
      {
        id: "hr-other-forms",
        title: "Other forms",
        icon: ScrollText,
        subItems: [
          { id: "hr-status", title: "Daily Airport Status", url: "/hr/status" },
          { id: "hr-timesheet", title: "Time Sheet", url: "/hr/timesheet" },
        ],
      },
      {
        id: "hr-approvals",
        title: "Approvals",
        url: "/hr/approvals",
        icon: CheckSquare,
      },
      {
        id: "hr-setup",
        title: "HR Setup",
        url: "/hr-setup",
        icon: Settings2,
      },
      {
        id: "salesbus",
        title: "SalesBus",
        icon: ShoppingBag,
        subItems: [
          { id: "salesbus-sales", title: "Sales", url: "/salesbus/sales" },
          {
            id: "salesbus-inventory",
            title: "Inventory",
            url: "/salesbus/inventory",
          },
          {
            id: "salesbus-settlements",
            title: "Settlements",
            url: "/salesbus/settlements",
          },
          { id: "salesbus-cart", title: "Cart", url: "/salesbus/sales/cart" },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Warnings",
    items: [
      { id: "cap-alerts", title: "Alerts", url: "/cap", icon: AlertTriangle },
      { id: "cap-map", title: "Alert Map", url: "/cap/map", icon: MapIcon },
      { id: "cap-feeds", title: "Feeds", url: "/cap/integrations", icon: Rss },
      { id: "cap-editor", title: "Editor", url: "/cap/admin", icon: SquarePen },
    ],
  },
  {
    id: 4,
    label: "Weather & Forecasts",
    items: [
      { id: "wxwatch", title: "WxWatch", url: "/wxwatch", icon: Radar },
      {
        id: "fcst-hourly",
        title: "Hourly",
        url: "/wxproducts/hourly",
        icon: Clock,
      },
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
    id: 5,
    label: "Products",
    items: [
      {
        id: "bulletin-marine",
        title: "Marine Bulletin",
        url: "/wxproducts/bulletins/marine",
        icon: Waves,
      },
    ],
  },
  {
    id: 6,
    label: "Coming soon",
    items: [
      {
        id: "sectors",
        title: "Sectors",
        url: COMING_SOON_URL,
        icon: Compass,
        badge: "soon",
      },
      {
        id: "aviation",
        title: "Aviation",
        url: COMING_SOON_URL,
        icon: Plane,
        badge: "soon",
      },
      {
        id: "climate-data",
        title: "Climate & Data",
        url: COMING_SOON_URL,
        icon: Thermometer,
        badge: "soon",
      },
      {
        id: "resources",
        title: "Resources",
        url: COMING_SOON_URL,
        icon: BookOpen,
        badge: "soon",
      },
      {
        id: "janitor",
        title: "Janitor",
        url: "/janitor",
        icon: SprayCan,
      },
      {
        id: "bus",
        title: "Bus",
        url: COMING_SOON_URL,
        icon: Bus,
        badge: "soon",
      },
      {
        id: "tickets",
        title: "Tickets",
        url: COMING_SOON_URL,
        icon: Ticket,
        badge: "soon",
      },
      {
        id: "clock-in",
        title: "Clock In",
        url: COMING_SOON_URL,
        icon: Fingerprint,
        badge: "soon",
      },
    ],
  },
  {
    id: 7,
    label: "Studio (demo)",
    items: [
      {
        id: "studio-default",
        title: "Default",
        url: "/studio/default",
        icon: LayoutDashboard,
      },
      { id: "studio-crm", title: "CRM", url: "/studio/crm", icon: ChartBar },
      {
        id: "studio-analytics",
        title: "Analytics",
        url: "/studio/analytics",
        icon: Gauge,
      },
      {
        id: "studio-finance",
        title: "Finance",
        url: "/studio/finance",
        icon: Banknote,
      },
      {
        id: "studio-ecommerce",
        title: "E-commerce",
        url: "/studio/ecommerce",
        icon: ShoppingBag,
      },
      {
        id: "studio-academy",
        title: "Academy",
        url: "/studio/academy",
        icon: GraduationCap,
      },
      {
        id: "studio-productivity",
        title: "Productivity",
        url: "/studio/productivity",
        icon: CheckSquare,
      },
      {
        id: "studio-infrastructure",
        title: "Infrastructure",
        url: "/studio/infrastructure",
        icon: Server,
      },
      { id: "studio-users", title: "Users", url: "/studio/users", icon: Users },
      {
        id: "studio-roles",
        title: "Roles",
        url: "/studio/roles",
        icon: Fingerprint,
      },
      {
        id: "studio-tasks",
        title: "Tasks",
        url: "/studio/tasks",
        icon: ListTodo,
      },
      {
        id: "studio-invoice",
        title: "Invoice",
        url: "/studio/invoice",
        icon: FileText,
      },
      {
        id: "studio-kanban",
        title: "Kanban",
        url: "/studio/kanban",
        icon: SquareKanban,
      },
      {
        id: "studio-logistics",
        title: "Logistics",
        url: "/studio/logistics",
        icon: Truck,
      },
      {
        id: "studio-calendar",
        title: "Calendar",
        url: "/studio/calendar",
        icon: Calendar,
      },
      { id: "studio-mail", title: "Mail", url: "/studio/mail", icon: Mail },
      {
        id: "studio-chat",
        title: "Chat",
        url: "/studio/chat",
        icon: MessagesSquare,
      },
      {
        id: "studio-coming-soon",
        title: "Coming Soon",
        url: "/studio/coming-soon",
        icon: Rocket,
      },
      {
        id: "studio-legacy",
        title: "Legacy Dashboards",
        icon: History,
        subItems: [
          {
            id: "studio-legacy-default",
            title: "Default v1",
            url: "/studio/legacy/default-v1",
          },
          {
            id: "studio-legacy-crm",
            title: "CRM v1",
            url: "/studio/legacy/crm-v1",
          },
          {
            id: "studio-legacy-analytics",
            title: "Analytics v1",
            url: "/studio/legacy/analytics-v1",
          },
          {
            id: "studio-legacy-finance",
            title: "Finance v1",
            url: "/studio/legacy/finance-v1",
          },
        ],
      },
    ],
  },
];
