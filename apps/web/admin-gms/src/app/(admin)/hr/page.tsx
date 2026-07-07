import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  ArrowLeftRight,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Clock,
  Settings2,
  UserX,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "HR Forms",
  description: "Human Resources forms for the Meteorological Department",
};

const FORMS = [
  {
    href: "/hr/leave",
    title: "Application for Leave of Absence",
    description: "Request annual, sick, study or other leave.",
    icon: CalendarOff,
  },
  {
    href: "/hr/status",
    title: "Daily Airport Status Report",
    description: "Record daily operational status and observations.",
    icon: ClipboardList,
  },
  {
    href: "/hr/shift",
    title: "Shift Exchange Requisition",
    description: "Request and approve a shift swap between officers.",
    icon: ArrowLeftRight,
  },
  {
    href: "/hr/absentee",
    title: "Absentee Report",
    description: "Log staff absences and the reasons given.",
    icon: UserX,
  },
  {
    href: "/hr/timesheet",
    title: "Official Time Sheet",
    description: "Weekly hours worked per officer, submitted to HR.",
    icon: Clock,
  },
  {
    href: "/roster",
    title: "Meteorological Duty Roster",
    description: "Assign monthly shifts across the department.",
    icon: CalendarDays,
  },
  {
    href: "/hr-setup",
    title: "HR Setup",
    description: "Departments, staff records and shift types.",
    icon: Settings2,
  },
] as const;

export default function HrPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">HR Forms</h1>
        <p className="text-muted-foreground text-sm">
          Meteorological Department — choose a form to fill in, preview and
          print.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FORMS.map((form) => {
          const Icon = form.icon;
          return (
            <Link
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={form.href}
              key={form.href}
            >
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <Icon className="size-6 text-muted-foreground" />
                  <CardTitle className="mt-2">{form.title}</CardTitle>
                  <CardDescription>{form.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
