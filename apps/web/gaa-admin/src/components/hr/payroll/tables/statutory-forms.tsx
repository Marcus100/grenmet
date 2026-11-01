"use client";

import {
  type DeductionKind,
  type DeductionTypeCreate,
  useHrCreateDeductionType,
  useHrCreateEmployeeDeduction,
  useHrCreateSocialInsuranceScheme,
  useHrCreateTaxTable,
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
import { parseMoneyToMinor, percentToRate } from "../payroll-money";
import { PayrollProblem } from "../payroll-states";

type Problem = { text: string; mfa: boolean } | null;

function problemFrom(error: unknown, area: string): Problem {
  const failure = describePayrollFailure(error);
  if (failure.kind === "unexpected") reportError(error, area);
  return { text: failure.message, mfa: failure.kind === "mfa" };
}

function Notice({
  problem,
  securityUrl,
}: {
  problem: Problem;
  securityUrl: string;
}) {
  return problem ? (
    <PayrollProblem securityUrl={problem.mfa ? securityUrl : undefined}>
      {problem.text}
    </PayrollProblem>
  ) : null;
}

/** Every table is saved PROVISIONAL. Confirming it is a separate action. */
const PROVISIONAL_NOTE =
  "Saved as PROVISIONAL. It can be previewed but not issued until someone else confirms it.";

function ProvisionalNote() {
  return <p className="text-muted-foreground text-sm">{PROVISIONAL_NOTE}</p>;
}

interface BandRow {
  key: number;
  rate: string;
  width: string;
}

let nextBandKey = 0;
function newBand(): BandRow {
  nextBandKey += 1;
  return { key: nextBandKey, rate: "", width: "" };
}

/** Income tax table: annual allowance and bands. The last band has no width. */
export function TaxTableForm({
  organisationId,
  securityUrl,
}: {
  organisationId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreateTaxTable();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [allowance, setAllowance] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [bands, setBands] = useState<BandRow[]>(() => [newBand()]);
  const [problem, setProblem] = useState<Problem>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    const allowanceMinor = parseMoneyToMinor(allowance);
    const rates = bands.map((band) => percentToRate(band.rate));
    if (!(code.trim() && name.trim())) {
      setProblem({ text: "Give the table a code and a name.", mfa: false });
      return;
    }
    if (allowanceMinor === null || !from) {
      setProblem({
        text: "Enter the annual allowance in XCD and the start date.",
        mfa: false,
      });
      return;
    }
    if (rates.some((rate) => rate === null)) {
      setProblem({
        text: "Each band needs a rate between 0 and 100 percent.",
        mfa: false,
      });
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          organisation_id: organisationId,
          code: code.trim(),
          name: name.trim(),
          method: "ANNUALISED",
          annual_allowance_minor: allowanceMinor,
          deduct_social_insurance: false,
          effective_from: from,
          source_note: note.trim() || null,
          bands: bands.map((band, index) => ({
            width_minor:
              index === bands.length - 1 ? null : parseMoneyToMinor(band.width),
            rate: percentToRate(band.rate) ?? "0",
          })),
        },
      });
      toast.success("Income tax table saved as PROVISIONAL");
      router.refresh();
    } catch (error) {
      setProblem(problemFrom(error, "hr-payroll-tax-table"));
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="tax-code">Code</FieldLabel>
          <Input
            id="tax-code"
            onChange={(e) => setCode(e.target.value)}
            value={code}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="tax-name">Name</FieldLabel>
          <Input
            id="tax-name"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="tax-allowance">
            Annual allowance (XCD)
          </FieldLabel>
          <Input
            id="tax-allowance"
            inputMode="decimal"
            onChange={(e) => setAllowance(e.target.value)}
            value={allowance}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="tax-from">Starts on</FieldLabel>
          <Input
            id="tax-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="tax-note">Source note (optional)</FieldLabel>
          <Input
            id="tax-note"
            onChange={(e) => setNote(e.target.value)}
            value={note}
          />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">Bands, lowest first</legend>
        {bands.map((band, index) => (
          <div
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            key={band.key}
          >
            <Input
              aria-label={`Band ${index + 1} width in XCD`}
              disabled={index === bands.length - 1}
              inputMode="decimal"
              onChange={(e) =>
                setBands(
                  bands.map((row, i) =>
                    i === index ? { ...row, width: e.target.value } : row
                  )
                )
              }
              placeholder={
                index === bands.length - 1 ? "No limit" : "Width in XCD"
              }
              value={index === bands.length - 1 ? "" : band.width}
            />
            <Input
              aria-label={`Band ${index + 1} rate in percent`}
              inputMode="decimal"
              onChange={(e) =>
                setBands(
                  bands.map((row, i) =>
                    i === index ? { ...row, rate: e.target.value } : row
                  )
                )
              }
              placeholder="Rate, for example 10"
              value={band.rate}
            />
            <Button
              disabled={bands.length === 1}
              onClick={() => setBands(bands.filter((_, i) => i !== index))}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove band
            </Button>
          </div>
        ))}
        <Button
          onClick={() => setBands([...bands, newBand()])}
          size="sm"
          type="button"
          variant="outline"
        >
          Add band
        </Button>
      </fieldset>
      <Notice problem={problem} securityUrl={securityUrl} />
      <ProvisionalNote />
      <Button disabled={create.isPending} type="submit">
        Save income tax table
      </Button>
    </form>
  );
}

/** Social insurance: employee and employer rates with ceilings. */
export function SocialInsuranceForm({
  organisationId,
  securityUrl,
}: {
  organisationId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreateSocialInsuranceScheme();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [employeeRate, setEmployeeRate] = useState("");
  const [employerRate, setEmployerRate] = useState("");
  const [monthly, setMonthly] = useState("");
  const [weekly, setWeekly] = useState("");
  const [from, setFrom] = useState("");
  const [problem, setProblem] = useState<Problem>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    const employee = percentToRate(employeeRate);
    const employer = percentToRate(employerRate);
    const monthlyMinor = parseMoneyToMinor(monthly);
    const weeklyMinor = parseMoneyToMinor(weekly);
    if (!(code.trim() && name.trim() && from)) {
      setProblem({
        text: "Give a code, a name and the start date.",
        mfa: false,
      });
      return;
    }
    if (employee === null || employer === null) {
      setProblem({ text: "Enter both rates as percentages.", mfa: false });
      return;
    }
    if (monthlyMinor === null || weeklyMinor === null) {
      setProblem({
        text: "Enter the monthly and weekly ceilings in XCD.",
        mfa: false,
      });
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          organisation_id: organisationId,
          code: code.trim(),
          name: name.trim(),
          employee_rate: employee,
          employer_rate: employer,
          monthly_ceiling_minor: monthlyMinor,
          weekly_ceiling_minor: weeklyMinor,
          effective_from: from,
        },
      });
      toast.success("Social insurance scheme saved as PROVISIONAL");
      router.refresh();
    } catch (error) {
      setProblem(problemFrom(error, "hr-payroll-scheme"));
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="si-code">Code</FieldLabel>
          <Input
            id="si-code"
            onChange={(e) => setCode(e.target.value)}
            value={code}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-name">Name</FieldLabel>
          <Input
            id="si-name"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-employee-rate">Employee rate (%)</FieldLabel>
          <Input
            id="si-employee-rate"
            inputMode="decimal"
            onChange={(e) => setEmployeeRate(e.target.value)}
            value={employeeRate}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-employer-rate">Employer rate (%)</FieldLabel>
          <Input
            id="si-employer-rate"
            inputMode="decimal"
            onChange={(e) => setEmployerRate(e.target.value)}
            value={employerRate}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-monthly">Monthly ceiling (XCD)</FieldLabel>
          <Input
            id="si-monthly"
            inputMode="decimal"
            onChange={(e) => setMonthly(e.target.value)}
            value={monthly}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-weekly">Weekly ceiling (XCD)</FieldLabel>
          <Input
            id="si-weekly"
            inputMode="decimal"
            onChange={(e) => setWeekly(e.target.value)}
            value={weekly}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="si-from">Starts on</FieldLabel>
          <Input
            id="si-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
      </div>
      <Notice problem={problem} securityUrl={securityUrl} />
      <ProvisionalNote />
      <Button disabled={create.isPending} type="submit">
        Save social insurance scheme
      </Button>
    </form>
  );
}

const KIND_LABEL: Record<DeductionKind, string> = {
  PERCENT_OF_BASIC: "Percent of basic pay",
  PERCENT_OF_GROSS: "Percent of gross pay",
  FIXED: "Fixed amount",
  SPLIT_PREMIUM: "Premium split between employee and employer",
};

type DeductionBase = Pick<
  DeductionTypeCreate,
  "organisation_id" | "code" | "name" | "kind" | "effective_from"
>;

interface DeductionInputs {
  employeeAmount: string;
  employeeRate: string;
  employeeShare: string;
  employerRate: string;
  premium: string;
}

/** The fields the API expects for each kind of deduction. */
function deductionFields(
  kind: DeductionKind,
  base: DeductionBase,
  input: DeductionInputs
): DeductionTypeCreate {
  if (kind === "FIXED") {
    return {
      ...base,
      employee_amount_minor: parseMoneyToMinor(input.employeeAmount),
    };
  }
  if (kind === "SPLIT_PREMIUM") {
    return {
      ...base,
      premium_minor: parseMoneyToMinor(input.premium),
      employee_share: percentToRate(input.employeeShare),
    };
  }
  return {
    ...base,
    employee_rate: percentToRate(input.employeeRate),
    employer_rate: percentToRate(input.employerRate),
  };
}

export function DeductionTypeForm({
  organisationId,
  securityUrl,
}: {
  organisationId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreateDeductionType();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeductionKind>("PERCENT_OF_BASIC");
  const [employeeRate, setEmployeeRate] = useState("");
  const [employerRate, setEmployerRate] = useState("");
  const [employeeAmount, setEmployeeAmount] = useState("");
  const [premium, setPremium] = useState("");
  const [employeeShare, setEmployeeShare] = useState("");
  const [from, setFrom] = useState("");
  const [problem, setProblem] = useState<Problem>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!(code.trim() && name.trim() && from)) {
      setProblem({
        text: "Give a code, a name and the start date.",
        mfa: false,
      });
      return;
    }
    const base = {
      organisation_id: organisationId,
      code: code.trim(),
      name: name.trim(),
      kind,
      effective_from: from,
    };
    const body = deductionFields(kind, base, {
      employeeAmount,
      employeeRate,
      employerRate,
      employeeShare,
      premium,
    });
    if (Object.values(body).some((value) => value === null)) {
      setProblem({
        text: "Check the amounts and percentages for this kind of deduction.",
        mfa: false,
      });
      return;
    }
    try {
      await create.mutateAsync({ body });
      toast.success("Deduction type saved as PROVISIONAL");
      router.refresh();
    } catch (error) {
      setProblem(problemFrom(error, "hr-payroll-deduction-type"));
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="dt-code">Code</FieldLabel>
          <Input
            id="dt-code"
            onChange={(e) => setCode(e.target.value)}
            value={code}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="dt-name">Name</FieldLabel>
          <Input
            id="dt-name"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="dt-kind">How it is calculated</FieldLabel>
          <NativeSelect
            id="dt-kind"
            onChange={(e) => setKind(e.target.value as DeductionKind)}
            value={kind}
          >
            {(Object.keys(KIND_LABEL) as DeductionKind[]).map((option) => (
              <option key={option} value={option}>
                {KIND_LABEL[option]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="dt-from">Starts on</FieldLabel>
          <Input
            id="dt-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
        {kind === "FIXED" ? (
          <Field>
            <FieldLabel htmlFor="dt-amount">Employee amount (XCD)</FieldLabel>
            <Input
              id="dt-amount"
              inputMode="decimal"
              onChange={(e) => setEmployeeAmount(e.target.value)}
              value={employeeAmount}
            />
          </Field>
        ) : null}
        {kind === "SPLIT_PREMIUM" ? (
          <>
            <Field>
              <FieldLabel htmlFor="dt-premium">Premium (XCD)</FieldLabel>
              <Input
                id="dt-premium"
                inputMode="decimal"
                onChange={(e) => setPremium(e.target.value)}
                value={premium}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dt-share">Employee share (%)</FieldLabel>
              <Input
                id="dt-share"
                inputMode="decimal"
                onChange={(e) => setEmployeeShare(e.target.value)}
                value={employeeShare}
              />
            </Field>
          </>
        ) : null}
        {kind === "PERCENT_OF_BASIC" || kind === "PERCENT_OF_GROSS" ? (
          <>
            <Field>
              <FieldLabel htmlFor="dt-employee-rate">
                Employee rate (%)
              </FieldLabel>
              <Input
                id="dt-employee-rate"
                inputMode="decimal"
                onChange={(e) => setEmployeeRate(e.target.value)}
                value={employeeRate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dt-employer-rate">
                Employer rate (%)
              </FieldLabel>
              <Input
                id="dt-employer-rate"
                inputMode="decimal"
                onChange={(e) => setEmployerRate(e.target.value)}
                value={employerRate}
              />
            </Field>
          </>
        ) : null}
      </div>
      <Notice problem={problem} securityUrl={securityUrl} />
      <ProvisionalNote />
      <Button disabled={create.isPending} type="submit">
        Save deduction type
      </Button>
    </form>
  );
}

export function EmployeeDeductionForm({
  deductionTypes,
  employees,
  organisationId,
  securityUrl,
}: {
  deductionTypes: {
    id: string;
    name: string;
    requires_authorisation: boolean;
  }[];
  employees: { user_id: string; name: string }[];
  organisationId: string;
  securityUrl: string;
}) {
  const router = useRouter();
  const create = useHrCreateEmployeeDeduction();
  const [userId, setUserId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [authorisation, setAuthorisation] = useState("");
  const [problem, setProblem] = useState<Problem>(null);
  const chosen = deductionTypes.find((type) => type.id === typeId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem(null);
    if (!(userId && typeId && from)) {
      setProblem({
        text: "Choose the employee, the deduction and the start date.",
        mfa: false,
      });
      return;
    }
    if (chosen?.requires_authorisation && !authorisation.trim()) {
      setProblem({
        text: "This deduction needs the employee's signed authorisation. Enter its reference first. It is not taken until they confirm.",
        mfa: false,
      });
      return;
    }
    try {
      await create.mutateAsync({
        body: {
          organisation_id: organisationId,
          user_id: userId,
          deduction_type_id: typeId,
          employee_amount_minor: amount ? parseMoneyToMinor(amount) : null,
          effective_from: from,
          effective_to: to || null,
          authorisation_reference: authorisation.trim() || null,
        },
      });
      toast.success("Employee enrolled. They confirm it from My deductions.");
      router.refresh();
    } catch (error) {
      setProblem(problemFrom(error, "hr-payroll-enrolment"));
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="enrol-employee">Employee</FieldLabel>
          <NativeSelect
            id="enrol-employee"
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
          <FieldLabel htmlFor="enrol-type">Deduction</FieldLabel>
          <NativeSelect
            id="enrol-type"
            onChange={(e) => setTypeId(e.target.value)}
            value={typeId}
          >
            <option value="">Choose a deduction</option>
            {deductionTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="enrol-amount">
            Employee amount (XCD, if fixed)
          </FieldLabel>
          <Input
            id="enrol-amount"
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            value={amount}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="enrol-from">Starts on</FieldLabel>
          <Input
            id="enrol-from"
            onChange={(e) => setFrom(e.target.value)}
            type="date"
            value={from}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="enrol-to">Ends on (optional)</FieldLabel>
          <Input
            id="enrol-to"
            onChange={(e) => setTo(e.target.value)}
            type="date"
            value={to}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="enrol-authorisation">
            Authorisation reference
            {chosen?.requires_authorisation ? " (required)" : " (optional)"}
          </FieldLabel>
          <Input
            id="enrol-authorisation"
            onChange={(e) => setAuthorisation(e.target.value)}
            value={authorisation}
          />
        </Field>
      </div>
      <Notice problem={problem} securityUrl={securityUrl} />
      <Button disabled={create.isPending} type="submit">
        Enrol employee
      </Button>
    </form>
  );
}
