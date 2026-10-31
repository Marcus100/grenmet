"use client";

import {
  useHrCreatePayLine,
  useHrListEmployeePayProfiles,
  useHrListPayItems,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { isPayrollQuery } from "./payroll-format";

/** Lines entered by hand: call-out, and overtime until the roster rules land. */
export function ManualLineForm({
  organisationId,
  periodId,
}: {
  organisationId: string;
  periodId: string;
}) {
  const queryClient = useQueryClient();
  const itemsQuery = useHrListPayItems({
    query: { organisation_id: organisationId },
  });
  const profilesQuery = useHrListEmployeePayProfiles({
    query: { organisation_id: organisationId, limit: 500 },
  });
  const create = useHrCreatePayLine();
  const [userId, setUserId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [workDate, setWorkDate] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");

  const items = (itemsQuery.data?.data ?? []).filter(
    (item) => item.accepts_manual_lines && item.is_active
  );
  const people = profilesQuery.data?.data ?? [];
  const unit = items.find((item) => item.id === itemId)?.unit;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem("");
    if (!(userId && itemId)) {
      setProblem("Choose the employee and the pay item.");
      return;
    }
    if (reason.trim().length < 3) {
      setProblem("Give a reason for this line.");
      return;
    }
    try {
      await create.mutateAsync({
        path: { period_id: periodId },
        body: {
          user_id: userId,
          pay_item_id: itemId,
          quantity,
          reason: reason.trim(),
          work_date: workDate || null,
        },
      });
      await queryClient.invalidateQueries({
        predicate: (query) => isPayrollQuery(query.queryKey),
      });
      setReason("");
      setQuantity("1");
      toast.success("Line added");
    } catch (error) {
      setProblem(hrApiErrorMessage(error));
    }
  }

  return (
    <section
      aria-label="Add a line by hand"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <div>
        <h3 className="font-semibold text-base">Add a line by hand</h3>
        <p className="text-muted-foreground text-sm">
          For call-outs, and overtime until it is calculated from the roster
          rules. Every line needs a reason.
        </p>
      </div>
      <form className="grid gap-4 md:grid-cols-6" onSubmit={onSubmit}>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="payroll-line-employee">Employee</FieldLabel>
          <NativeSelect
            id="payroll-line-employee"
            onChange={(event) => setUserId(event.target.value)}
            value={userId}
          >
            <option value="">Choose…</option>
            {people.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.employee_name}
                {person.employee_number ? ` (${person.employee_number})` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="payroll-line-item">Pay item</FieldLabel>
          <NativeSelect
            id="payroll-line-item"
            onChange={(event) => setItemId(event.target.value)}
            value={itemId}
          >
            <option value="">Choose…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.rule_state === "PROVISIONAL" ? " (Provisional)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="payroll-line-quantity">
            {unit === "HOURS" ? "Hours" : "Quantity"}
          </FieldLabel>
          <Input
            className="w-28"
            id="payroll-line-quantity"
            inputMode="decimal"
            min="0"
            onChange={(event) => setQuantity(event.target.value)}
            step={unit === "HOURS" ? "0.25" : "1"}
            type="number"
            value={quantity}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="payroll-line-date">Date (optional)</FieldLabel>
          <Input
            className="w-40"
            id="payroll-line-date"
            onChange={(event) => setWorkDate(event.target.value)}
            type="date"
            value={workDate}
          />
        </Field>
        <Field className="md:col-span-5">
          <FieldLabel htmlFor="payroll-line-reason">Reason</FieldLabel>
          <Textarea
            id="payroll-line-reason"
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </Field>
        <div className="flex items-end">
          <Button disabled={create.isPending} type="submit">
            Add line
          </Button>
        </div>
      </form>
      {problem && (
        <p className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
