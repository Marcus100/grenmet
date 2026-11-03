"use client";

import {
  type PayBasis,
  useHrCreateEmployeeBasicPay,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { describePayrollFailure } from "../payroll-failure";
import { parseMoneyToMinor } from "../payroll-money";
import { PayrollProblem } from "../payroll-states";

export interface EmployeeOption {
  name: string;
  user_id: string;
}

/** Records dated basic pay. Needs rates.manage and two-step verification. */
export function BasicPayForm({
  employees,
  organisationId,
  securityUrl,
}: {
  employees: EmployeeOption[];
  organisationId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreateEmployeeBasicPay();
  const [userId, setUserId] = useState("");
  const [basis, setBasis] = useState<PayBasis>("SALARIED");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    const amountMinor = parseMoneyToMinor(amount);
    if (!userId) {
      setProblem({ text: "Choose the employee.", mfa: false });
      return;
    }
    if (amountMinor === null || amountMinor <= 0) {
      setProblem({
        text: "Enter the amount in XCD, for example 2500.00.",
        mfa: false,
      });
      return;
    }
    if (!(Number(hours) > 0)) {
      setProblem({ text: "Enter the standard hours per month.", mfa: false });
      return;
    }
    if (!from) {
      setProblem({ text: "Choose the date this pay starts.", mfa: false });
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          organisation_id: organisationId,
          user_id: userId,
          pay_basis: basis,
          amount_minor: amountMinor,
          standard_monthly_hours: hours,
          effective_from: from,
          effective_to: to || null,
          reason: reason.trim() || null,
        },
      });
      toast.success("Basic pay recorded");
      setAmount("");
      setReason("");
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected") {
        reportError(error, "hr-payroll-basic-pay");
      }
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="basic-pay-employee">Employee</FieldLabel>
          <NativeSelect
            id="basic-pay-employee"
            onChange={(e) => setUserId(e.target.value)}
            value={userId}
          >
            <option value="">Choose an employee</option>
            {employees.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="basic-pay-basis">Paid as</FieldLabel>
          <NativeSelect
            id="basic-pay-basis"
            onChange={(e) => setBasis(e.target.value as PayBasis)}
            value={basis}
          >
            <option value="SALARIED">Salary (monthly amount)</option>
            <option value="HOURLY">Hourly rate</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="basic-pay-amount">
            {basis === "SALARIED"
              ? "Monthly basic pay (XCD)"
              : "Hourly rate (XCD)"}
          </FieldLabel>
          <Input
            id="basic-pay-amount"
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            value={amount}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="basic-pay-hours">
            Standard hours per month
          </FieldLabel>
          <Input
            id="basic-pay-hours"
            inputMode="decimal"
            onChange={(e) => setHours(e.target.value)}
            value={hours}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="basic-pay-from">Starts on</FieldLabel>
          <Input
            id="basic-pay-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="basic-pay-to">Ends on (optional)</FieldLabel>
          <Input
            id="basic-pay-to"
            onChange={(e) => setTo(e.target.value)}
            type="date"
            value={to}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="basic-pay-reason">
            Reason for the change (optional)
          </FieldLabel>
          <Input
            id="basic-pay-reason"
            onChange={(e) => setReason(e.target.value)}
            value={reason}
          />
        </Field>
      </div>
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Needs two-step verification. You cannot set your own pay.
      </p>
      <Button disabled={create.isPending} type="submit">
        Save basic pay
      </Button>
    </form>
  );
}
