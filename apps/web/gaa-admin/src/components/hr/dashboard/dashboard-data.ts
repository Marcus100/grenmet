import type { HrDashboardPublic } from "@barrelsgd/api-client";
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
  Users,
  UserX,
} from "lucide-react";

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

export type RequestState =
  | "pending"
  | "review"
  | "approved"
  | "draft"
  | "rejected"
  | "cancelled";

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
  status: "scheduled";
}

// Headline attendance counts for today (in vs away).

/** Only navigation is static; all figures and people come from the API. */
export function dashboardData(data: HrDashboardPublic) {
  const requests = data.requests ?? [];
  const away = data.away ?? [];
  const onDuty = data.on_duty ?? [];
  const approvals = data.approvals ?? [];
  const staffStats: Stat[] = [
    {
      id: "leave-balance",
      label: "Vacation balance",
      value: data.vacation_balance ?? "Not recorded",
      valueSuffix:
        data.vacation_balance === null || data.vacation_balance === undefined
          ? undefined
          : "days",
      foot: "Recorded leave ledger balance",
      icon: CalendarOff,
    },
    {
      id: "open-requests",
      label: "Open requests",
      value: String(data.open_requests),
      foot: "Your drafts and requests awaiting resolution",
      icon: ClipboardList,
    },
    {
      id: "next-shift",
      label: "Next scheduled shift",
      value: data.next_shift ?? "Not scheduled",
      foot: "Published roster after today",
      icon: Clock,
    },
    {
      id: "team-out",
      label: "Scheduled away today",
      value: String(away.length),
      foot: data.scope,
      icon: Users,
    },
  ];
  const adminStats: Stat[] = [
    {
      id: "pending-approvals",
      label: "Pending approvals",
      value: String(approvals.length),
      foot: "Requests you can action now",
      icon: CheckSquare,
    },
    {
      id: "scheduled",
      label: "Scheduled to work today",
      value: String(onDuty.length),
      foot: data.scope,
      icon: CalendarDays,
    },
    {
      id: "staff",
      label: "Active staff",
      value: String(data.active_staff),
      foot: data.scope,
      icon: Users,
    },
    {
      id: "shifts",
      label: "Active shift types",
      value: String(data.shift_types),
      foot: "Configured shift catalogue",
      icon: Clock,
    },
  ];
  const states: Record<string, RequestState> = {
    DRAFT: "draft",
    SUBMITTED: "pending",
    PENDING: "pending",
    RETURNED: "review",
    APPROVED: "approved",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
  };
  const myRequests: MyRequest[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    meta: `Updated ${request.updated_at.slice(0, 10)}`,
    state: states[request.status] ?? "review",
  }));
  const recentActivity: Activity[] = requests.map((request) => ({
    id: request.id,
    title: request.title,
    detail: request.status.replaceAll("_", " "),
    when: request.updated_at.slice(0, 10),
    icon: ClipboardList,
  }));
  const onDutyToday: PersonIn[] = onDuty.map((person) => ({
    ...person,
    status: "scheduled",
  }));
  const whosOut: PersonOut[] = away.map((person) => ({
    ...person,
    note: person.shift,
    status: "leave",
  }));
  const pendingApprovals: Approval[] = approvals.map((approval) => ({
    ...approval,
    when: approval.submitted_at?.slice(0, 10) ?? "",
  }));
  const orgStats: OrgStat[] = [
    {
      id: "staff",
      label: "Active staff",
      value: String(data.active_staff),
      icon: Users,
    },
    {
      id: "departments",
      label: "Departments",
      value: String(data.departments),
      icon: LayoutGrid,
    },
    {
      id: "shifts",
      label: "Active shift types",
      value: String(data.shift_types),
      icon: Clock,
    },
  ];
  return {
    staffStats,
    adminStats,
    myRequests,
    recentActivity,
    onDutyToday,
    whosOut,
    pendingApprovals,
    orgStats,
    presenceToday: { in: onDuty.length, out: away.length },
  };
}
