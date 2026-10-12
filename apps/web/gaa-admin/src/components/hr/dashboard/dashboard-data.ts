import type { HrDashboardPublic } from "@barrelsgd/api-client";
import {
  ArrowLeftRight,
  CalendarOff,
  ClipboardCheck,
  Clock,
  type LucideIcon,
  UserX,
} from "lucide-react";

export interface PersonOut {
  department: string;
  id: string;
  name: string;
  note: string;
}

export interface PersonIn {
  department: string;
  id: string;
  name: string;
  shift: string;
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
  /** Segments filled in the three-step progress bar (0 = no bar). */
  step: 0 | 1 | 2;
  title: string;
}

// Forms/records launched from the "Other forms" menu. `group` splits the menu
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

const states: Record<string, { state: RequestState; step: 0 | 1 | 2 }> = {
  DRAFT: { state: "draft", step: 0 },
  SUBMITTED: { state: "pending", step: 1 },
  PENDING: { state: "pending", step: 1 },
  RETURNED: { state: "review", step: 2 },
  APPROVED: { state: "approved", step: 0 },
  REJECTED: { state: "rejected", step: 0 },
  CANCELLED: { state: "cancelled", step: 0 },
};

/** Only navigation is static; all figures and people come from the API. */
export function dashboardData(data: HrDashboardPublic) {
  const myRequests: MyRequest[] = (data.requests ?? []).map((request) => {
    const mapped = states[request.status] ?? { state: "review", step: 2 };
    return {
      id: request.id,
      title: request.title,
      meta: `Updated ${request.updated_at.slice(0, 10)}`,
      ...mapped,
    };
  });
  const onDutyToday: PersonIn[] = data.on_duty ?? [];
  const whosOut: PersonOut[] = (data.away ?? []).map((person) => ({
    ...person,
    note: person.shift,
  }));
  return {
    myRequests,
    onDutyToday,
    whosOut,
    pendingCount: (data.approvals ?? []).length,
  };
}
