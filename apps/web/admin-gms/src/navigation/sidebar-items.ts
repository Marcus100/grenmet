import {
  AlertTriangle,
  Banknote,
  Calendar,
  CalendarDays,
  ChartBar,
  CheckSquare,
  CircleUser,
  CloudSun,
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
  MessagesSquare,
  Radar,
  Rocket,
  ScrollText,
  Server,
  ShoppingBag,
  SquareKanban,
  Truck,
  Users,
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

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Admin",
    items: [
      { id: "home", title: "Home", url: "/", icon: House },
      { id: "calendar", title: "Calendar", url: "/calendar", icon: Calendar },
      { id: "roster", title: "Roster", url: "/roster", icon: CalendarDays },
      {
        id: "profile",
        title: "User Profile",
        url: "/profile",
        icon: CircleUser,
      },
      {
        id: "hr",
        title: "Human Resource",
        icon: Users,
        subItems: [
          { id: "hr-leave", title: "Leave Application", url: "/hr/leave" },
          { id: "hr-shift", title: "Shift Exchange", url: "/hr/shift" },
          { id: "hr-absentee", title: "Absentee Report", url: "/hr/absentee" },
          { id: "hr-status", title: "Daily Airport Status", url: "/hr/status" },
          { id: "hr-timesheet", title: "Time Sheet", url: "/hr/timesheet" },
          { id: "hr-forms", title: "All Forms", url: "/hr" },
        ],
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
        ],
      },
    ],
  },
  {
    id: 2,
    label: "Weather",
    items: [
      {
        id: "cap",
        title: "CAP Alerts",
        icon: AlertTriangle,
        subItems: [
          { id: "cap-alerts", title: "Alerts", url: "/cap" },
          { id: "cap-map", title: "Alert Map", url: "/cap/map" },
          { id: "cap-feeds", title: "Feeds", url: "/cap/integrations" },
          { id: "cap-editor", title: "Editor", url: "/cap/admin" },
        ],
      },
      { id: "wxwatch", title: "WxWatch", url: "/wxwatch", icon: Radar },
      {
        id: "wxproducts-forecasts",
        title: "Public Forecasts",
        icon: CloudSun,
        subItems: [
          { id: "fcst-hourly", title: "Hourly", url: "/wxproducts/hourly" },
          {
            id: "fcst-morning",
            title: "Morning",
            url: "/wxproducts/fcsts/morning",
          },
          {
            id: "fcst-midday",
            title: "Midday",
            url: "/wxproducts/fcsts/midday",
          },
          {
            id: "fcst-evening",
            title: "Evening",
            url: "/wxproducts/fcsts/evening",
          },
        ],
      },
      {
        id: "wxproducts-bulletins",
        title: "Bulletins",
        icon: ScrollText,
        subItems: [
          {
            id: "bulletin-marine",
            title: "Marine Bulletin",
            url: "/wxproducts/bulletins/marine",
          },
        ],
      },
    ],
  },
  {
    id: 3,
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
