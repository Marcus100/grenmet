"use client";

import {
  getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey,
  listPeriodsApiV1HrRostersPeriodsGetQueryKey,
  type RosterAssignmentInput,
  useBulkAssignmentsApiV1HrRostersAssignmentsBulkPost,
  useCreatePeriodApiV1HrRostersPeriodsPost,
  useGetPeriodApiV1HrRostersPeriodsPeriodIdGet,
  useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet,
  useListDepartmentsEndpointApiV1HrDepartmentsGet,
  useListPeriodsApiV1HrRostersPeriodsGet,
  useListShiftCatalogApiV1HrRostersShiftsGet,
  usePublishPeriodApiV1HrRostersPeriodsPeriodIdPublishPatch,
} from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@grenmet/ui/components/ui/dialog";
import { NativeSelect } from "@grenmet/ui/components/ui/native-select";
import { cn } from "@grenmet/ui/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Printer,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildAssignmentMap,
  buildCycleCodes,
  cellKey,
  findPeriodForMonth,
  initialName,
  isoDate,
  legendLabel,
  monthRange,
  nextCode,
} from "./roster-utils";

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

const CODE_STYLE: Record<string, string> = {
  M: "bg-primary/10 text-primary",
  E: "bg-primary/10 text-primary",
  N: "bg-primary/10 text-primary",
  D: "bg-accent/15 text-accent-foreground",
  O: "bg-muted text-muted-foreground",
  V: "bg-gm-warning-green-bg text-gm-warning-green-fg",
  S: "bg-gm-warning-amber-bg text-gm-warning-amber-fg",
  L: "bg-gm-warning-yellow-bg text-gm-warning-yellow-fg",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "outline",
  PUBLISHED: "default",
  CLOSED: "secondary",
};

export function DutyRoster() {
  const queryClient = useQueryClient();
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [departmentId, setDepartmentId] = useState<string>();
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});

  const departmentsQuery = useListDepartmentsEndpointApiV1HrDepartmentsGet();
  const departments = departmentsQuery.data?.data ?? [];
  const activeDepartmentId = departmentId ?? departments[0]?.id;

  const shiftsQuery = useListShiftCatalogApiV1HrRostersShiftsGet();
  const catalog = shiftsQuery.data?.data ?? [];
  const cycleCodes = useMemo(() => buildCycleCodes(catalog), [catalog]);

  const membersQuery =
    useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet(
      activeDepartmentId ?? "",
      { query: { enabled: Boolean(activeDepartmentId) } }
    );
  const members = membersQuery.data?.data ?? [];

  const periodsQuery = useListPeriodsApiV1HrRostersPeriodsGet(
    { department_id: activeDepartmentId ?? "" },
    { query: { enabled: Boolean(activeDepartmentId) } }
  );
  const period = findPeriodForMonth(periodsQuery.data?.data ?? [], monthDate);

  const detailsQuery = useGetPeriodApiV1HrRostersPeriodsPeriodIdGet(
    period?.id ?? "",
    { query: { enabled: Boolean(period) } }
  );
  const serverAssignments = useMemo(
    () => buildAssignmentMap(detailsQuery.data?.assignments ?? []),
    [detailsQuery.data?.assignments]
  );

  const createPeriodMutation = useCreatePeriodApiV1HrRostersPeriodsPost();
  const bulkMutation = useBulkAssignmentsApiV1HrRostersAssignmentsBulkPost();
  const publishMutation =
    usePublishPeriodApiV1HrRostersPeriodsPeriodIdPublishPatch();

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1);
    return {
      day: i + 1,
      iso: isoDate(year, month, i + 1),
      weekday: WEEKDAY[date.getDay()],
      isSunday: date.getDay() === 0,
    };
  });
  const monthLabel = monthDate.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const editable = Boolean(period) && period?.status !== "CLOSED";
  const pendingCount = Object.keys(pendingEdits).length;

  function shiftMonth(delta: number) {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
    setPendingEdits({});
  }

  function changeDepartment(id: string) {
    setDepartmentId(id);
    setPendingEdits({});
  }

  function cycle(userId: string, iso: string) {
    if (!editable) return;
    const key = cellKey(userId, iso);
    setPendingEdits((cur) => {
      const current = cur[key] ?? serverAssignments[key] ?? "";
      const next = nextCode(cycleCodes, current);
      if (next === serverAssignments[key]) {
        const { [key]: _dropped, ...rest } = cur;
        return rest;
      }
      return { ...cur, [key]: next };
    });
  }

  async function createPeriod() {
    if (!activeDepartmentId) return;
    const range = monthRange(monthDate);
    await createPeriodMutation.mutateAsync({
      data: {
        department_id: activeDepartmentId,
        period_start: range.start,
        period_end: range.end,
      },
    });
    await queryClient.invalidateQueries({
      queryKey: listPeriodsApiV1HrRostersPeriodsGetQueryKey({
        department_id: activeDepartmentId,
      }),
    });
    toast.success(`Roster period created for ${monthLabel}`);
  }

  async function save() {
    if (!period || pendingCount === 0) return;
    const assignments: RosterAssignmentInput[] = Object.entries(
      pendingEdits
    ).map(([key, shiftCode]) => {
      const [userId, date] = key.split("|");
      return {
        user_id: userId,
        assignment_date: date,
        shift_code: shiftCode,
      };
    });
    await bulkMutation.mutateAsync({
      data: { roster_period_id: period.id, assignments },
    });
    await queryClient.invalidateQueries({
      queryKey: getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey(period.id),
    });
    setPendingEdits({});
    toast.success(`Saved ${assignments.length} assignment(s)`);
  }

  async function publish() {
    if (!period) return;
    await publishMutation.mutateAsync({ period_id: period.id });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listPeriodsApiV1HrRostersPeriodsGetQueryKey({
          department_id: activeDepartmentId ?? "",
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: getPeriodApiV1HrRostersPeriodsPeriodIdGetQueryKey(period.id),
      }),
    ]);
    toast.success(`${monthLabel} roster published`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => shiftMonth(-1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-40 text-center font-medium text-lg">
            {monthLabel}
          </span>
          <Button
            onClick={() => shiftMonth(1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight className="size-4" />
          </Button>
          {period ? (
            <Badge variant={STATUS_VARIANT[period.status] ?? "outline"}>
              {period.status}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {departments.length > 1 ? (
            <NativeSelect
              aria-label="Department"
              onChange={(event) => changeDepartment(event.target.value)}
              value={activeDepartmentId ?? ""}
            >
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <Button
            disabled={pendingCount === 0}
            onClick={() => setPendingEdits({})}
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcw data-icon="inline-start" />
            Discard
          </Button>
          <Button
            disabled={!period || pendingCount === 0 || bulkMutation.isPending}
            onClick={save}
            size="sm"
            type="button"
          >
            <Save data-icon="inline-start" />
            Save{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
          {period?.status === "DRAFT" ? (
            <Dialog>
              <DialogTrigger
                render={
                  <Button
                    disabled={pendingCount > 0 || publishMutation.isPending}
                    size="sm"
                    type="button"
                    variant="outline"
                  />
                }
              >
                <Send data-icon="inline-start" />
                Publish
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Publish {monthLabel} roster?</DialogTitle>
                  <DialogDescription>
                    Publishing snapshots the roster as the signed plan of
                    record. Staff schedules become official; later changes are
                    tracked as amendments.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <DialogClose render={<Button onClick={publish} />}>
                    Publish
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
          <Button
            onClick={() => window.print()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Printer data-icon="inline-start" />
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {catalog.map((shift) => (
          <span className="flex items-center gap-1.5" key={shift.code}>
            <span
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-sm font-medium text-[10px]",
                CODE_STYLE[shift.code] ?? "bg-muted text-muted-foreground"
              )}
            >
              {shift.code}
            </span>
            {legendLabel(shift)}
          </span>
        ))}
        {editable ? (
          <span className="text-muted-foreground/70">
            Click a cell to cycle shifts, then Save.
          </span>
        ) : null}
      </div>

      {period ? null : (
        <div className="flex items-center justify-between rounded-xl border border-dashed px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {activeDepartmentId || departmentsQuery.isLoading
              ? `No roster period exists for ${monthLabel}.`
              : "No departments are configured — an HR department with staff must exist before a roster can be created."}
          </span>
          <Button
            disabled={!activeDepartmentId || createPeriodMutation.isPending}
            onClick={createPeriod}
            size="sm"
            type="button"
          >
            <CalendarPlus data-icon="inline-start" />
            Create period
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-center text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th
                className="sticky left-0 z-10 w-40 border-border border-r bg-muted/50 px-2 py-1.5 text-left font-semibold"
                rowSpan={2}
              >
                Name
              </th>
              {days.map((d) => (
                <th
                  className={cn(
                    "w-7 border-border border-l py-0.5 font-medium",
                    d.isSunday && "text-destructive"
                  )}
                  key={`wk-${d.day}`}
                >
                  {d.weekday}
                </th>
              ))}
            </tr>
            <tr>
              {days.map((d) => (
                <th
                  className={cn(
                    "border-border border-t border-l py-0.5 font-semibold",
                    d.isSunday && "text-destructive"
                  )}
                  key={`day-${d.day}`}
                >
                  {d.day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const name = initialName(member.first_name, member.last_name);
              return (
                <tr className="border-border border-t" key={member.user_id}>
                  <td className="sticky left-0 z-10 border-border border-r bg-background px-2 py-1 text-left font-medium">
                    {name}
                  </td>
                  {days.map((d) => {
                    const key = cellKey(member.user_id, d.iso);
                    const code =
                      pendingEdits[key] ?? serverAssignments[key] ?? "";
                    const isPending = key in pendingEdits;
                    return (
                      <td
                        className="border-border border-l p-0"
                        key={`${member.user_id}-${d.day}`}
                      >
                        <button
                          className={cn(
                            "h-6 w-full font-medium text-[11px] leading-none outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                            code && CODE_STYLE[code],
                            isPending && "ring-1 ring-ring ring-inset",
                            !editable && "cursor-default"
                          )}
                          disabled={!editable}
                          onClick={() => cycle(member.user_id, d.iso)}
                          type="button"
                        >
                          {code}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {members.length === 0 && !membersQuery.isLoading ? (
              <tr>
                <td
                  className="px-2 py-6 text-muted-foreground"
                  colSpan={daysInMonth + 1}
                >
                  No active members in this department.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
