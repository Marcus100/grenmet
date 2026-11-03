"use client";

import { type RateKind, useHrCreatePayItemRate } from "@barrelsgd/api-client";
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

export interface PayItemOption {
  id: string;
  name: string;
  rule_state: string;
}

/** Adds a dated item rate. Needs rates.manage and two-step verification. */
export function ItemRateForm({
  items,
  securityUrl,
}: {
  items: PayItemOption[];
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreatePayItemRate();
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<RateKind>("HOURLY_MULTIPLIER");
  const [multiplier, setMultiplier] = useState("");
  const [amount, setAmount] = useState("");
  const [guaranteedHours, setGuaranteedHours] = useState("");
  const [guaranteedMultiplier, setGuaranteedMultiplier] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");
  const [problem, setProblem] = useState<{ text: string; mfa: boolean } | null>(
    null
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!itemId) {
      setProblem({ text: "Choose the pay item.", mfa: false });
      return;
    }
    if (!from) {
      setProblem({ text: "Choose the date this rate starts.", mfa: false });
      return;
    }
    const body =
      kind === "HOURLY_MULTIPLIER"
        ? { multiplier: multiplier.trim() }
        : { amount_minor: parseMoneyToMinor(amount) };
    if (kind === "HOURLY_MULTIPLIER" && !(Number(multiplier) > 0)) {
      setProblem({
        text: "Enter the multiple of the hourly rate, for example 1.5.",
        mfa: false,
      });
      return;
    }
    if (
      kind === "FIXED_AMOUNT" &&
      (body.amount_minor === null || body.amount_minor === undefined)
    ) {
      setProblem({ text: "Enter the fixed amount in XCD.", mfa: false });
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          pay_item_id: itemId,
          rate_kind: kind,
          ...body,
          guaranteed_hours:
            kind === "FIXED_AMOUNT" && guaranteedHours ? guaranteedHours : null,
          guaranteed_multiplier:
            kind === "FIXED_AMOUNT" && guaranteedMultiplier
              ? guaranteedMultiplier
              : null,
          effective_from: from,
          effective_to: to || null,
          source_reference: source.trim() || null,
        },
      });
      toast.success("Rate recorded as PROVISIONAL");
      router.refresh();
    } catch (error) {
      const failure = describePayrollFailure(error);
      if (failure.kind === "unexpected") {
        reportError(error, "hr-payroll-item-rate");
      }
      setProblem({ text: failure.message, mfa: failure.kind === "mfa" });
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="rate-item">Pay item</FieldLabel>
          <NativeSelect
            id="rate-item"
            onChange={(e) => setItemId(e.target.value)}
            value={itemId}
          >
            <option value="">Choose a pay item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.rule_state === "PROVISIONAL" ? " (provisional)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-kind">How it is paid</FieldLabel>
          <NativeSelect
            id="rate-kind"
            onChange={(e) => setKind(e.target.value as RateKind)}
            value={kind}
          >
            <option value="HOURLY_MULTIPLIER">
              Multiple of the hourly rate
            </option>
            <option value="FIXED_AMOUNT">Fixed amount</option>
          </NativeSelect>
        </Field>
        {kind === "HOURLY_MULTIPLIER" ? (
          <Field>
            <FieldLabel htmlFor="rate-multiplier">
              Multiple (for example 1.5)
            </FieldLabel>
            <Input
              id="rate-multiplier"
              inputMode="decimal"
              onChange={(e) => setMultiplier(e.target.value)}
              value={multiplier}
            />
          </Field>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="rate-amount">Fixed amount (XCD)</FieldLabel>
              <Input
                id="rate-amount"
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                value={amount}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="rate-guaranteed-hours">
                Guaranteed hours (optional)
              </FieldLabel>
              <Input
                id="rate-guaranteed-hours"
                inputMode="decimal"
                onChange={(e) => setGuaranteedHours(e.target.value)}
                value={guaranteedHours}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="rate-guaranteed-multiplier">
                Multiple for those hours (optional)
              </FieldLabel>
              <Input
                id="rate-guaranteed-multiplier"
                inputMode="decimal"
                onChange={(e) => setGuaranteedMultiplier(e.target.value)}
                value={guaranteedMultiplier}
              />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="rate-from">Starts on</FieldLabel>
          <Input
            id="rate-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="rate-to">Ends on (optional)</FieldLabel>
          <Input
            id="rate-to"
            onChange={(e) => setTo(e.target.value)}
            type="date"
            value={to}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="rate-source">
            Source reference (optional)
          </FieldLabel>
          <Input
            id="rate-source"
            onChange={(e) => setSource(e.target.value)}
            value={source}
          />
        </Field>
      </div>
      {problem ? (
        <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
          {problem.text}
        </PayrollProblem>
      ) : null}
      <Button disabled={create.isPending} type="submit">
        Save rate
      </Button>
    </form>
  );
}
