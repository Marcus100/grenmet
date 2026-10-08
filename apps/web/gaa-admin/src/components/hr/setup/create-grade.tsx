"use client";

import { useHrListDepartments } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useEffect, useId, useState } from "react";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { reportError } from "@/lib/report-error";
import { saveGrade } from "./setup-api";

export function CreateGrade({
  organisationId,
  onSaved,
}: {
  organisationId?: string;
  onSaved: () => void;
}) {
  const id = useId();
  const departments = useHrListDepartments({
    query: { organisation_id: organisationId },
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (departments.error)
      reportError(departments.error, "hr-grade-departments");
  }, [departments.error]);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        Add grade
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add grade</DialogTitle>
          <DialogDescription>
            Define a grade for a department in this organisation. This does not
            assign staff or permissions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            setMessage("");
            try {
              await saveGrade(crypto.randomUUID(), {
                department_id: String(data.get("department_id")),
                code: String(data.get("code")).trim().toUpperCase(),
                label: String(data.get("label")).trim(),
                rank: Number(data.get("rank")),
                is_active: true,
              });
              onSaved();
              form.reset();
              setOpen(false);
            } catch (error) {
              reportError(error, "hr-grade-create");
              setMessage(hrApiErrorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-1" htmlFor={`${id}-department`}>
            Department
            <NativeSelect
              defaultValue=""
              disabled={departments.isPending || departments.isError}
              id={`${id}-department`}
              name="department_id"
              required
            >
              <option value="">Choose a department</option>
              {departments.data?.data.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          {departments.isError && (
            <p role="alert">Unable to load departments.</p>
          )}
          {!(departments.isPending || departments.isError) &&
            departments.data?.data.length === 0 && (
              <p>Create a department before adding grades.</p>
            )}
          <label className="block space-y-1" htmlFor={`${id}-code`}>
            Grade code
            <Input
              id={`${id}-code`}
              maxLength={50}
              name="code"
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <label className="block space-y-1" htmlFor={`${id}-name`}>
            Grade name
            <Input id={`${id}-name`} maxLength={150} name="label" required />
          </label>
          <label className="block space-y-1" htmlFor={`${id}-rank`}>
            Seniority order
            <Input
              defaultValue={1}
              id={`${id}-rank`}
              max={1000}
              min={1}
              name="rank"
              required
              type="number"
            />
          </label>
          <Button
            disabled={
              busy ||
              departments.isPending ||
              departments.isError ||
              !departments.data?.data.length
            }
            type="submit"
          >
            {busy ? "Saving…" : "Save new grade"}
          </Button>
          {message && <p role="alert">{message}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
