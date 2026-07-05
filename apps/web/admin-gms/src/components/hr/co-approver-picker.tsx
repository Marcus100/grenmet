"use client";

import { useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet } from "@grenmet/api-client";
import { Badge } from "@grenmet/ui/components/ui/badge";
import { Button } from "@grenmet/ui/components/ui/button";
import { Checkbox } from "@grenmet/ui/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@grenmet/ui/components/ui/popover";
import { Spinner } from "@grenmet/ui/components/ui/spinner";
import { UserPlus, X } from "lucide-react";
import type { ReactNode } from "react";

interface CoApproverPickerProps {
  /** Department whose members can be chosen as co-approvers. */
  departmentId: string | undefined;
  disabled?: boolean;
  /** Usually the current user — cannot co-approve their own request. */
  excludeUserId?: string;
  onChange: (userIds: string[]) => void;
  /** Currently-selected co-approver user ids. */
  selected: string[];
}

/**
 * Multi-select of department colleagues who must all approve a submission before
 * it advances to the supervisor/management tiers. Backed by the department
 * members endpoint; selections surface as removable badges.
 */
export function CoApproverPicker({
  departmentId,
  selected,
  onChange,
  excludeUserId,
  disabled = false,
}: CoApproverPickerProps) {
  const membersQuery =
    useListDepartmentMembersEndpointApiV1HrDepartmentsDepartmentIdMembersGet(
      departmentId ?? ""
    );
  const members = (membersQuery.data?.data ?? []).filter(
    (member) => member.user_id !== excludeUserId
  );

  const toggle = (userId: string) => {
    onChange(
      selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId]
    );
  };

  const nameFor = (userId: string) => {
    const member = members.find((candidate) => candidate.user_id === userId);
    return member ? `${member.first_name} ${member.last_name}` : "Colleague";
  };

  let listBody: ReactNode;
  if (membersQuery.isLoading) {
    listBody = (
      <div className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
        <Spinner className="size-4" /> Loading colleagues…
      </div>
    );
  } else if (members.length === 0) {
    listBody = (
      <div className="p-3 text-muted-foreground text-sm">
        No colleagues found in your department.
      </div>
    );
  } else {
    listBody = members.map((member) => (
      <button
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
        key={member.user_id}
        onClick={() => toggle(member.user_id)}
        type="button"
      >
        <Checkbox
          checked={selected.includes(member.user_id)}
          className="pointer-events-none"
          tabIndex={-1}
        />
        <span className="flex flex-col">
          <span className="font-medium">
            {member.first_name} {member.last_name}
          </span>
          {member.position ? (
            <span className="text-muted-foreground text-xs">
              {member.position}
            </span>
          ) : null}
        </span>
      </button>
    ));
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              className="justify-start"
              disabled={disabled || !departmentId}
              type="button"
              variant="outline"
            >
              <UserPlus data-icon="inline-start" />
              {selected.length > 0
                ? `${selected.length} co-approver${selected.length === 1 ? "" : "s"} selected`
                : "Add co-approvers"}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 p-0">
          <div className="max-h-64 overflow-y-auto p-1">{listBody}</div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((userId) => (
            <Badge className="gap-1" key={userId} variant="secondary">
              {nameFor(userId)}
              <button
                aria-label={`Remove ${nameFor(userId)}`}
                className="rounded-full text-muted-foreground hover:text-destructive"
                onClick={() => toggle(userId)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
