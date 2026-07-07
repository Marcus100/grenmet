import {
  ArrowLeftRight,
  CalendarDays,
  CalendarOff,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileBarChart,
  LayoutGrid,
  type LucideIcon,
  Timer,
  Users,
  UserX,
} from "lucide-react";

// Placeholder content for the consolidated HR dashboard. HR is print-only today
// (FastAPI endpoints exist but are not wired — see admin-gms CLAUDE.md), so these
// figures are representative. When the HR API is wired, swap these arrays for
// Server Component fetches; the presentational components stay unchanged.

export type Trend = "up" | "down" | "flat";

export interface Stat {
  delta?: string;
  foot: string;
  icon: LucideIcon;
  id: string;
  label: string;
  trend?: Trend;
  value: string;
  valueSuffix?: string;
}

export interface Module {
  count?: string;
  countHot?: boolean;
  description: string;
  href: string;
  icon: LucideIcon;
  id: string;
  title: string;
}

export interface PersonOut {
  department: string;
  id: string;
  name: string;
  note: string;
  status: "leave" | "sick" | "field";
}

export interface Activity {
  detail: string;
  icon: LucideIcon;
  id: string;
  title: string;
  when: string;
}

export interface Approval {
  id: string;
  kind: string;
  name: string;
  when: string;
}

export type RequestState = "pending" | "review" | "approved";

export interface MyRequest {
  id: string;
  meta: string;
  state: RequestState;
  title: string;
}

export interface OrgStat {
  icon: LucideIcon;
  id: string;
  label: string;
  value: string;
}

export const staffStats: Stat[] = [
  {
    id: "leave-balance",
    label: "Leave balance",
    value: "14",
    valueSuffix: "days",
    foot: "of 21 · 7 taken",
    icon: CalendarOff,
  },
  {
    id: "open-requests",
    label: "Open requests",
    value: "2",
    delta: "1 waiting",
    trend: "flat",
    foot: "1 approved this week",
    icon: ClipboardList,
  },
  {
    id: "next-shift",
    label: "Next shift",
    value: "Tue",
    valueSuffix: "06:00",
    foot: "Morning · Airport Met",
    icon: Clock,
  },
  {
    id: "team-out",
    label: "Team out today",
    value: "3",
    foot: "from your department",
    icon: Users,
  },
];

export const adminStats: Stat[] = [
  {
    id: "pending-approvals",
    label: "Pending approvals",
    value: "7",
    delta: "+3",
    trend: "up",
    foot: "since yesterday",
    icon: CheckSquare,
  },
  {
    id: "on-leave",
    label: "On leave today",
    value: "3",
    valueSuffix: "/ 48",
    foot: "6.3% of staff",
    icon: CalendarOff,
  },
  {
    id: "requests-week",
    label: "Requests this week",
    value: "18",
    delta: "+22%",
    trend: "up",
    foot: "vs last week",
    icon: ClipboardList,
  },
  {
    id: "roster-coverage",
    label: "Roster coverage",
    value: "96",
    valueSuffix: "%",
    delta: "−2",
    trend: "down",
    foot: "gaps to fill",
    icon: Timer,
  },
];

// Forms/records launched from the "New request" menu (moved out of the dashboard
// body — the dashboard is for review, not data entry). `group` splits the menu
// into requests (approval-bound) and records (self-filed).
export interface NewRequestItem {
  description: string;
  group: "request" | "record";
  href: string;
  icon: LucideIcon;
  id: string;
  title: string;
}

export const newRequestItems: NewRequestItem[] = [
  {
    id: "leave",
    group: "request",
    title: "Leave application",
    description: "Annual, sick or special leave",
    href: "/hr/leave",
    icon: CalendarOff,
  },
  {
    id: "shift",
    group: "request",
    title: "Shift exchange",
    description: "Swap a duty with a colleague",
    href: "/hr/shift",
    icon: ArrowLeftRight,
  },
  {
    id: "absentee",
    group: "request",
    title: "Absentee report",
    description: "Log an unplanned absence",
    href: "/hr/absentee",
    icon: UserX,
  },
  {
    id: "status",
    group: "record",
    title: "Daily status report",
    description: "Airport observation sign-off",
    href: "/hr/status",
    icon: ClipboardCheck,
  },
  {
    id: "timesheet",
    group: "record",
    title: "Timesheet",
    description: "Hours for the pay period",
    href: "/hr/timesheet",
    icon: Clock,
  },
];

export const adminModules: Module[] = [
  {
    id: "approvals",
    title: "Approvals",
    description: "Review pending requests",
    href: "/hr/approvals",
    icon: CheckSquare,
    count: "7",
    countHot: true,
  },
  {
    id: "roster-plan",
    title: "Duty roster",
    description: "Plan & publish shifts",
    href: "/roster",
    icon: CalendarDays,
  },
  {
    id: "staff",
    title: "Staff",
    description: "Directory & accounts",
    href: "/users",
    icon: Users,
    count: "48",
  },
  {
    id: "hr-setup",
    title: "HR Setup",
    description: "Departments & shift types",
    href: "/hr-setup",
    icon: LayoutGrid,
  },
  {
    id: "reports",
    title: "Reports",
    description: "Attendance & leave exports",
    href: "/coming-soon",
    icon: FileBarChart,
  },
];

export interface PersonIn {
  department: string;
  id: string;
  name: string;
  shift: string;
  status: "on-now" | "later";
}

// Headline attendance counts for today (in vs away).
export const presenceToday = { in: 31, out: 6 };

export const onDutyToday: PersonIn[] = [
  {
    id: "kn",
    name: "Kwame Noel",
    department: "Aviation Forecasting",
    shift: "Morning · 06:00–14:00",
    status: "on-now",
  },
  {
    id: "as",
    name: "Ayana Simon",
    department: "Observations",
    shift: "Morning · 06:00–14:00",
    status: "on-now",
  },
  {
    id: "tc",
    name: "Trevor Charles",
    department: "Climate Data",
    shift: "Day · 08:00–16:00",
    status: "on-now",
  },
  {
    id: "nf",
    name: "Nadia Frederick",
    department: "Aviation Forecasting",
    shift: "Evening · 14:00–22:00",
    status: "later",
  },
  {
    id: "rj",
    name: "Rohan James",
    department: "Marine",
    shift: "Night · 22:00–06:00",
    status: "later",
  },
];

export const whosOut: PersonOut[] = [
  {
    id: "dp",
    name: "Dwight Phillip",
    department: "Aviation Forecasting",
    note: "back Thu 9 Jul",
    status: "leave",
  },
  {
    id: "mj",
    name: "Marsha John",
    department: "Climate Data",
    note: "back tomorrow",
    status: "sick",
  },
  {
    id: "rb",
    name: "Renard Baptiste",
    department: "Observations",
    note: "Pearls station",
    status: "field",
  },
];

export const recentActivity: Activity[] = [
  {
    id: "a1",
    title: "Leave application approved",
    detail: "Your 12–14 Jul request · approved by K. Modeste",
    when: "2h",
    icon: CheckSquare,
  },
  {
    id: "a2",
    title: "Shift exchange requested",
    detail: "Swap Fri night with T. Alexander · awaiting co-approval",
    when: "Yst",
    icon: ArrowLeftRight,
  },
  {
    id: "a3",
    title: "Timesheet submitted",
    detail: "Pay period 23 Jun – 6 Jul · 76.0 hrs",
    when: "2d",
    icon: Clock,
  },
];

export const pendingApprovals: Approval[] = [
  {
    id: "ap1",
    name: "Terrence Alexander",
    kind: "Leave · 4 days · 21–24 Jul",
    when: "10m",
  },
  {
    id: "ap2",
    name: "Simone Lewis",
    kind: "Shift exchange · Fri night",
    when: "1h",
  },
  { id: "ap3", name: "Jomo Ferguson", kind: "Absentee · 1 day", when: "3h" },
];

export const myRequests: MyRequest[] = [
  {
    id: "r1",
    title: "Shift exchange",
    meta: "Fri night → T. Alexander",
    state: "pending",
  },
  {
    id: "r2",
    title: "Leave · special",
    meta: "1 day · 18 Jul",
    state: "review",
  },
  {
    id: "r3",
    title: "Leave · annual",
    meta: "3 days · 12–14 Jul",
    state: "approved",
  },
];

export const orgStats: OrgStat[] = [
  { id: "o1", label: "Active staff", value: "48", icon: Users },
  { id: "o2", label: "Departments", value: "6", icon: LayoutGrid },
  { id: "o3", label: "Shift types", value: "4", icon: Clock },
  { id: "o4", label: "Roster coverage", value: "96%", icon: Timer },
];
