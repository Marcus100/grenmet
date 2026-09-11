"use client";
import type {
  GradeSetup,
  PolicyPublic,
  StaffSetup,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { OrganisationChart } from "@/components/hr/setup/organisation-chart";
import { CatalogueSetup } from "./catalogue-setup";
import {
  approveRegistration,
  offboardStaff,
  readGrades,
  readPolicies,
  readStaff,
  recordBalance,
  saveGrade,
  savePolicy,
  saveStaff,
} from "./setup-api";

function StaffEditor({
  staff,
  grades,
  colleagues,
  onSaved,
}: {
  staff: StaffSetup;
  grades: GradeSetup[];
  colleagues: StaffSetup[];
  onSaved: () => void;
}) {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOffboard, setConfirmOffboard] = useState(false);
  return (
    <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer font-medium">
        {staff.name} · {staff.status}
      </summary>
      <p className="my-3 text-muted-foreground text-sm">
        {staff.email} ·{" "}
        {staff.email_verified ? "Email verified" : "Email verification pending"}
      </p>
      {staff.registration_pending && (
        <div className="my-4 space-y-3 rounded-lg border border-border bg-muted p-4">
          <p className="font-medium">Registration awaiting approval</p>
          <p className="text-sm">
            Verify the employee’s identity, save their department and grade,
            then approve staff access. Email verification is required; personnel
            details can be completed later.
          </p>
          <Button
            disabled={
              busy ||
              !staff.email_verified ||
              !staff.department_id ||
              !staff.grade_id ||
              !staff.mailbox_ready
            }
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await approveRegistration(staff.user_id);
                setMessage("Registration approved. Staff access is enabled.");
                onSaved();
              } catch {
                setMessage(
                  "Approval failed. Confirm email verification and active staff setup."
                );
              } finally {
                setBusy(false);
              }
            }}
            type="button"
          >
            Approve staff access
          </Button>
        </div>
      )}
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          const form = new FormData(event.currentTarget);
          const grade = grades.find((item) => item.id === form.get("grade_id"));
          if (!grade) {
            setMessage("Choose a grade");
            setBusy(false);
            return;
          }
          try {
            await saveStaff(staff.user_id, {
              department_id: grade.department_id,
              grade_id: grade.id,
              employee_number:
                String(form.get("employee_number") || "") || null,
              employment_type:
                String(form.get("employment_type") || "") || null,
              start_date: String(form.get("start_date") || "") || null,
              supervisor_id: String(form.get("supervisor_id") || "") || null,
              mailbox_ready: form.get("mailbox_ready") === "on",
            });
            setMessage("Saved. Role assignments are unchanged.");
            onSaved();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Unable to save"
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={`${fieldId}-grade_id`}>
          Grade
          <select
            className="block w-full rounded border border-border bg-background p-2"
            defaultValue={staff.grade_id}
            id={`${fieldId}-grade_id`}
            name="grade_id"
          >
            <option value="">Choose a grade</option>
            {grades
              .filter((g) => g.is_active)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.department_id} — {g.label}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor={`${fieldId}-employee_number`}>
          Verified employee number
          <Input
            defaultValue={staff.employee_number ?? ""}
            id={`${fieldId}-employee_number`}
            name="employee_number"
          />
        </label>
        <label htmlFor={`${fieldId}-employment_type`}>
          Employment type
          <select
            className="block w-full rounded border border-border bg-background p-2"
            defaultValue={staff.employment_type ?? ""}
            id={`${fieldId}-employment_type`}
            name="employment_type"
          >
            <option value="">Not yet verified</option>
            {["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${fieldId}-supervisor_id`}>
          Supervisor
          <select
            className="block w-full rounded border border-border bg-background p-2"
            defaultValue={staff.supervisor_id ?? ""}
            id={`${fieldId}-supervisor_id`}
            name="supervisor_id"
          >
            <option value="">Not assigned</option>
            {colleagues
              .filter(
                (person) =>
                  person.user_id !== staff.user_id && person.employment_ready
              )
              .map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name}
                </option>
              ))}
          </select>
        </label>
        <label htmlFor={`${fieldId}-start_date`}>
          Start date
          <Input
            defaultValue={staff.start_date ?? ""}
            id={`${fieldId}-start_date`}
            name="start_date"
            type="date"
          />
        </label>
        <label
          className="flex items-center gap-2"
          htmlFor={`${fieldId}-mailbox_ready`}
        >
          <input
            defaultChecked={staff.mailbox_ready}
            id={`${fieldId}-mailbox_ready`}
            name="mailbox_ready"
            type="checkbox"
          />
          Account enabled — unchecking disables sign-in and ends sessions
        </label>
        <p className="text-muted-foreground text-sm md:col-span-2">
          Save the details you have verified. HR requests require an employee
          number, employment type, and start date. Blank personnel fields
          preserve existing values.
        </p>
        <Button
          disabled={
            busy ||
            staff.status === "inactive" ||
            !grades.some((grade) => grade.is_active)
          }
          type="submit"
        >
          {busy ? "Saving…" : "Save staff setup"}
        </Button>
      </form>
      {message && (
        <p className="mt-3" role="status">
          {message}
        </p>
      )}
      <BalanceEditor userId={staff.user_id} />
      {confirmOffboard && (
        <p role="status">
          This revokes staff access and retains historical records.{" "}
          <Button onClick={() => setConfirmOffboard(false)} variant="outline">
            Cancel
          </Button>
        </p>
      )}
      <Button
        className="mt-4"
        disabled={busy || staff.status === "inactive"}
        onClick={async () => {
          if (!confirmOffboard) {
            setConfirmOffboard(true);
            return;
          }
          setBusy(true);
          try {
            const result = await offboardStaff(staff.user_id);
            setMessage(result.message ?? "Staff access ended");
            onSaved();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Unable to offboard"
            );
          } finally {
            setBusy(false);
          }
        }}
        variant="destructive"
      >
        {confirmOffboard ? "Confirm ending staff access" : "End staff access"}
      </Button>
    </details>
  );
}

function BalanceEditor({ userId }: { userId: string }) {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 grid gap-3 border-border border-t pt-4 md:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const form = new FormData(event.currentTarget);
        try {
          const result = await recordBalance(userId, {
            leave_type: form.get("leave_type"),
            balance: form.get("balance"),
            reason: form.get("reason"),
          });
          setMessage(result.message ?? "Saved");
        } catch {
          setMessage("Unable to save balance");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`${fieldId}-leave_type`}>
        Leave type
        <select
          className="block w-full rounded border border-border bg-background p-2"
          id={`${fieldId}-leave_type`}
          name="leave_type"
        >
          {[
            "VACATION",
            "SICK",
            "CASUAL",
            "MATERNITY",
            "PATERNITY",
            "STUDY",
            "COMPASSIONATE",
            "PROFESSIONAL_APPOINTMENT",
            "BEREAVEMENT",
            "WITHOUT_PAY",
            "OTHER",
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${fieldId}-balance`}>
        Verified balance (days)
        <Input
          id={`${fieldId}-balance`}
          max="9999"
          min="0"
          name="balance"
          required
          step="0.01"
          type="number"
        />
      </label>
      <label htmlFor={`${fieldId}-reason`}>
        Reason / source
        <Input
          id={`${fieldId}-reason`}
          maxLength={200}
          minLength={5}
          name="reason"
          required
        />
      </label>
      <Button disabled={busy} type="submit">
        {busy ? "Saving…" : "Record balance adjustment"}
      </Button>
      {message && (
        <p className="md:col-span-4" role="status">
          {message}
        </p>
      )}
    </form>
  );
}

function GradeEditor({
  grade,
  onSaved,
}: {
  grade: GradeSetup;
  onSaved: () => void;
}) {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-3 rounded border border-border p-4 md:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await saveGrade(grade.id, {
            ...grade,
            label: data.get("label"),
            rank: Number(data.get("rank")),
          });
          setMessage("Saved");
          onSaved();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Unable to save grade"
          );
        }
      }}
    >
      <label htmlFor={`${fieldId}-label`}>
        Grade label
        <Input
          defaultValue={grade.label}
          id={`${fieldId}-label`}
          name="label"
          required
        />
      </label>
      <label htmlFor={`${fieldId}-rank`}>
        Seniority order
        <Input
          defaultValue={grade.rank}
          id={`${fieldId}-rank`}
          min={1}
          name="rank"
          required
          type="number"
        />
      </label>
      <Button type="submit">Save grade</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function PolicyEditor({
  policy,
  onSaved,
}: {
  policy: PolicyPublic;
  onSaved: () => void;
}) {
  const fieldId = useId();
  const [message, setMessage] = useState("");
  return (
    <form
      className="space-y-3 rounded border border-border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
          await savePolicy(policy.key, {
            allow_self_approval: data.get("self") === "on",
            require_distinct_approvers: data.get("distinct") === "on",
          });
          setMessage("Saved for future submissions");
          onSaved();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Unable to save policy"
          );
        }
      }}
    >
      <p className="font-medium">
        {policy.key === "cap"
          ? "CAP alerts"
          : policy.key.replaceAll(":", " · ").replaceAll("_", " ")}
      </p>
      <label className="flex gap-2" htmlFor={`${fieldId}-self`}>
        <input
          defaultChecked={policy.allow_self_approval}
          id={`${fieldId}-self`}
          name="self"
          type="checkbox"
        />
        Allow someone to approve their own request
      </label>
      {policy.key !== "cap" && (
        <label className="flex gap-2" htmlFor={`${fieldId}-distinct`}>
          <input
            defaultChecked={policy.require_distinct_approvers}
            id={`${fieldId}-distinct`}
            name="distinct"
            type="checkbox"
          />
          Require different people at each approval stage
        </label>
      )}
      <Button type="submit">Save policy</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function StaffSetupManager() {
  const [staff, setStaff] = useState<StaffSetup[]>([]);
  const [grades, setGrades] = useState<GradeSetup[]>([]);
  const [policies, setPolicies] = useState<PolicyPublic[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const [people, bands, rules] = await Promise.all([
        readStaff(),
        readGrades(),
        readPolicies(),
      ]);
      setStaff(people);
      setGrades(bands);
      setPolicies(rules);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load setup"
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (loading) return <p role="status">Loading staff setup…</p>;
  if (error) return <p role="alert">{error}</p>;
  return (
    <div className="space-y-6">
      <p>
        Complete verified staff details here.{" "}
        <Link className="underline" href="/users">
          Manage accounts and individual role assignments
        </Link>
        .
      </p>
      <OrganisationChart staff={staff} />
      <CatalogueSetup onSaved={load} />
      {grades.length === 0 && (
        <p role="alert">
          No grades are configured. Preview and import the missing reference
          data above before assigning staff.
        </p>
      )}
      {grades.length > 0 && !grades.some((grade) => grade.is_active) && (
        <p role="alert">
          All grades are inactive. An administrator must review grade activation
          before assigning staff.
        </p>
      )}
      {policies.length === 0 && (
        <p role="alert">
          Approval policies are missing. New HR and CAP submissions are blocked
          until policies are configured.
        </p>
      )}
      <div className="space-y-3">
        {staff.map((person) => (
          <StaffEditor
            colleagues={staff}
            grades={grades}
            key={person.user_id}
            onSaved={load}
            staff={person}
          />
        ))}
        {staff.length === 0 && (
          <p>No staff credentials have been issued yet.</p>
        )}
      </div>
      <h2 className="font-semibold text-xl">Grades</h2>
      {grades.map((grade) => (
        <GradeEditor grade={grade} key={grade.id} onSaved={load} />
      ))}
      <h2 className="font-semibold text-xl">Approval policies</h2>
      <p className="text-muted-foreground">
        Changes apply to new submissions. Requests already in progress keep
        their original policy.
      </p>
      {policies.map((policy) => (
        <PolicyEditor key={policy.key} onSaved={load} policy={policy} />
      ))}
    </div>
  );
}
