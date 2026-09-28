"use client";

import {
  hrCreateParkingPermit,
  hrGetParkingPermits,
  hrIssueParkingDecal,
  hrSubmitParkingPermit,
  hrUpdateParkingPermit,
  type ParkingAction,
  type ParkingPermitCreate,
  type ParkingPermitPublic,
  useHrGetHrProfileMe,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { CoApproverPicker } from "@/components/hr/co-approver-picker";
import { grenadaToday } from "@/components/hr/expiry";
import { downloadHrPdf, HrPdfPreview } from "@/components/hr/hr-pdf-preview";
import { useSigning } from "@/components/hr/signatures/signature-api";
import { SigningPanel } from "@/components/hr/signatures/signing-panel";
import { reportError } from "@/lib/report-error";

const actions = [
  ["NEW_PERMIT", "New permit"],
  ["ANNUAL_RENEWAL", "Annual renewal"],
  ["REPLACEMENT_LOST_STOLEN", "Replacement (lost/stolen)"],
  ["INFORMATION_CHANGE", "Information change"],
  ["OTHER", "Other"],
] satisfies [ParkingAction, string][];

export function ParkingApplication() {
  const id = useId();
  const actor = useSessionUser();
  const profile = useHrGetHrProfileMe();
  const signing = useSigning();
  const client = useQueryClient();
  const department = profile.data?.employment.department;
  const [departmentView, setDepartmentView] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ParkingPermitPublic | null>(null);
  const [values, setValues] = useState({
    company: null as string | null,
    phone: null as string | null,
    registration: "",
    insuranceIssue: "",
    insuranceExpiry: "",
    action: "NEW_PERMIT" as ParkingAction,
    other: "",
  });
  const [coApprovers, setCoApprovers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["parking-applications", departmentView, department?.id, page],
    queryFn: () =>
      hrGetParkingPermits({
        query: {
          page,
          size: 20,
          department_id: departmentView ? department?.id : undefined,
        },
      }).unwrap(),
  });
  const permissions = profile.data?.permissions ?? [];
  const canCreate = permissions.includes("parking.permit.create");
  const canIssue = permissions.includes("parking.permit.issue");
  const locked = Boolean(
    selected &&
      (selected.status !== "DRAFT" ||
        selected.submitted_by_user_id !== actor.id)
  );
  const body: ParkingPermitCreate = {
    user_id: selected?.user_id ?? actor.id,
    department_id: selected?.department_id ?? department?.id ?? "",
    company_name:
      values.company ??
      (department?.organisation_id === "gaa"
        ? "Grenada Airports Authority"
        : null),
    phone: values.phone ?? profile.data?.identity.phone ?? null,
    vehicle_registration_no: values.registration.trim(),
    vehicle_insurance_issue_date: values.insuranceIssue || null,
    vehicle_insurance_expiry_date: values.insuranceExpiry || null,
    action_requested: values.action,
    action_other_detail: values.other.trim() || null,
    fee_amount: selected?.fee_amount ?? "40.00",
    as_draft: true,
  };

  function load(permit: ParkingPermitPublic, renewal = false) {
    setSelected(renewal ? null : permit);
    setValues({
      company: permit.company_name ?? "",
      phone: permit.phone ?? "",
      registration: permit.vehicle_registration_no,
      insuranceIssue: permit.vehicle_insurance_issue_date ?? "",
      insuranceExpiry: permit.vehicle_insurance_expiry_date ?? "",
      action: renewal ? "ANNUAL_RENEWAL" : permit.action_requested,
      other: permit.action_other_detail ?? "",
    });
    setCoApprovers([]);
    setError("");
    setNotice(
      renewal
        ? "New renewal application: confirm current insurance and submit for fresh approval."
        : ""
    );
  }
  function reset() {
    setSelected(null);
    setValues({
      company: null,
      phone: null,
      registration: "",
      insuranceIssue: "",
      insuranceExpiry: "",
      action: "NEW_PERMIT",
      other: "",
    });
    setCoApprovers([]);
    setNotice("");
    setError("");
  }
  async function refresh() {
    await client.invalidateQueries({ queryKey: ["parking-applications"] });
    await client.invalidateQueries({ queryKey: ["parking-expiry"] });
  }
  async function save(submit: boolean) {
    setError("");
    setNotice("");
    if (
      !(body.vehicle_registration_no && body.department_id) ||
      (values.insuranceIssue &&
        values.insuranceExpiry &&
        values.insuranceExpiry < values.insuranceIssue) ||
      (submit && values.action === "OTHER" && !values.other.trim())
    ) {
      setError(
        "Enter a vehicle registration and department. Insurance expiry must follow issue; explain an Other action before submission."
      );
      return;
    }
    if (submit && !signing.data) {
      setError("Save your signature in your profile before signing this form.");
      return;
    }
    setBusy(true);
    try {
      let saved = selected
        ? await hrUpdateParkingPermit({
            path: { permit_id: selected.id },
            body,
          }).unwrap()
        : await hrCreateParkingPermit({ body }).unwrap();
      setSelected(saved);
      if (submit)
        saved = await hrSubmitParkingPermit({
          path: { permit_id: saved.id },
          body: {
            signature_version: signing.data?.version,
            co_approver_user_ids: coApprovers,
          },
        }).unwrap();
      setSelected(saved);
      setNotice(
        submit
          ? "Signed application submitted for approval."
          : "Draft saved. Reopen it from the applications below."
      );
      await refresh();
    } catch (caught) {
      reportError(caught, "hr-parking-save");
      setError(hrApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  async function issue(
    event: FormEvent<HTMLFormElement>,
    permit: ParkingPermitPublic
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await hrIssueParkingDecal({
        path: { permit_id: permit.id },
        body: {
          decal_number: String(data.get("decal")),
          valid_from: String(data.get("from")),
          valid_to: String(data.get("to")),
          received_by: String(data.get("recipient") || "") || null,
        },
      }).unwrap();
      setNotice("Decal issuance recorded.");
      await refresh();
    } catch (caught) {
      reportError(caught, "hr-parking-issue");
      setError(hrApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  const ready = Boolean(body.department_id && body.vehicle_registration_no);
  return (
    <section aria-label="Parking applications" className="space-y-6">
      {profile.isPending && <p role="status">Loading employee information…</p>}
      {profile.isError && (
        <p role="alert">
          Unable to load your HR profile. Refresh before creating an
          application.
        </p>
      )}
      {canCreate && (
        <div className="grid gap-6 xl:grid-cols-2">
          <form
            aria-label="Parking access application"
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await save(true);
            }}
          >
            <h2 className="font-medium text-xl">
              Airport security parking access application
            </h2>
            <p className="text-sm">
              Employee and department come from the HR record. Each renewal or
              replacement requires a new application.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <label htmlFor={`${id}-employee`}>
                Employee
                <Input
                  id={`${id}-employee`}
                  readOnly
                  value={
                    selected?.user_id && selected.user_id !== actor.id
                      ? "Recorded employee (see signed copy)"
                      : (actor.full_name ?? "")
                  }
                />
              </label>
              <label htmlFor={`${id}-department`}>
                Department
                <Input
                  id={`${id}-department`}
                  readOnly
                  value={department?.name ?? body.department_id}
                />
              </label>
              <label htmlFor={`${id}-date`}>
                Application date
                <Input
                  id={`${id}-date`}
                  readOnly
                  value={grenadaToday(
                    selected?.created_at
                      ? new Date(selected.created_at)
                      : new Date()
                  )}
                />
              </label>
              <label htmlFor={`${id}-fee`}>
                Fee
                <Input
                  id={`${id}-fee`}
                  readOnly
                  value={`$${body.fee_amount}`}
                />
              </label>
            </div>
            <fieldset
              className="grid gap-4 md:grid-cols-2"
              disabled={busy || locked}
            >
              <label htmlFor={`${id}-company`}>
                Company name
                <Input
                  id={`${id}-company`}
                  maxLength={255}
                  onChange={(e) =>
                    setValues({ ...values, company: e.target.value })
                  }
                  value={
                    values.company ??
                    (department?.organisation_id === "gaa"
                      ? "Grenada Airports Authority"
                      : "")
                  }
                />
              </label>
              <label htmlFor={`${id}-phone`}>
                Phone
                <Input
                  id={`${id}-phone`}
                  maxLength={30}
                  onChange={(e) =>
                    setValues({ ...values, phone: e.target.value })
                  }
                  value={values.phone ?? profile.data?.identity.phone ?? ""}
                />
              </label>
              <label htmlFor={`${id}-registration`}>
                Vehicle registration number
                <Input
                  id={`${id}-registration`}
                  maxLength={50}
                  onChange={(e) =>
                    setValues({ ...values, registration: e.target.value })
                  }
                  required
                  value={values.registration}
                />
              </label>
              <label htmlFor={`${id}-action`}>
                Action requested
                <select
                  className="block w-full rounded-md border border-input bg-background p-2"
                  id={`${id}-action`}
                  onChange={(e) => {
                    const action = actions.find(
                      ([code]) => code === e.target.value
                    )?.[0];
                    if (action) setValues({ ...values, action });
                  }}
                  value={values.action}
                >
                  {actions.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-insurance-issue`}>
                Insurance issue date
                <Input
                  id={`${id}-insurance-issue`}
                  onChange={(e) =>
                    setValues({ ...values, insuranceIssue: e.target.value })
                  }
                  type="date"
                  value={values.insuranceIssue}
                />
              </label>
              <label htmlFor={`${id}-insurance-expiry`}>
                Insurance expiry date
                <Input
                  id={`${id}-insurance-expiry`}
                  min={values.insuranceIssue || undefined}
                  onChange={(e) =>
                    setValues({ ...values, insuranceExpiry: e.target.value })
                  }
                  type="date"
                  value={values.insuranceExpiry}
                />
              </label>
              {values.action === "OTHER" && (
                <label htmlFor={`${id}-other`}>
                  Other action details
                  <Input
                    id={`${id}-other`}
                    maxLength={255}
                    onChange={(e) =>
                      setValues({ ...values, other: e.target.value })
                    }
                    value={values.other}
                  />
                </label>
              )}
            </fieldset>
            <p className="text-sm">
              A $40 fee is charged for each vehicle decal for one year or part
              thereof. Affix it to the left windscreen above the Licence Disc.
              Report changes, lost or stolen decals to Airport Security. Read
              the full original conditions in the PDF before signing.
            </p>
            <CoApproverPicker
              departmentId={body.department_id}
              disabled={busy || locked}
              excludeUserId={actor.id}
              onChange={setCoApprovers}
              selected={coApprovers}
            />
            <SigningPanel submission={locked ? selected : null} />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || locked || !ready}
                onClick={async () => {
                  await save(false);
                }}
                type="button"
                variant="outline"
              >
                Save draft
              </Button>
              <Button
                disabled={busy || locked || !ready || !signing.data}
                type="submit"
              >
                Sign &amp; submit
              </Button>
              <Button
                disabled={busy}
                onClick={reset}
                type="button"
                variant="outline"
              >
                New application
              </Button>
              <Button
                disabled={!ready || busy}
                onClick={() => {
                  downloadHrPdf({
                    previewPath: "/api/v1/hr/parking-permits/preview-pdf",
                    payload: body,
                    signedDocumentId: locked
                      ? selected?.signed_document_id
                      : null,
                    filename: "parking-application.pdf",
                  }).catch((caught: unknown) => {
                    reportError(caught, "hr-parking-pdf");
                    setError(hrApiErrorMessage(caught));
                  });
                }}
                type="button"
                variant="outline"
              >
                Download PDF
              </Button>
            </div>
          </form>
          <HrPdfPreview
            payload={body}
            previewPath="/api/v1/hr/parking-permits/preview-pdf"
            ready={ready}
            signedDocumentId={locked ? selected?.signed_document_id : null}
            title="Parking application"
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="flex flex-wrap gap-3">
        <h2 className="font-medium text-xl">Applications</h2>
        {permissions.includes("parking.permit.read.department") && (
          <label htmlFor={`${id}-department-view`}>
            <input
              checked={departmentView}
              id={`${id}-department-view`}
              onChange={(e) => {
                setDepartmentView(e.target.checked);
                setPage(1);
              }}
              type="checkbox"
            />{" "}
            Department applications
          </label>
        )}
      </div>
      {query.isPending && <p role="status">Loading applications…</p>}
      {query.isError && (
        <div role="alert">
          Unable to load applications.{" "}
          <Button onClick={() => query.refetch()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          <ul className="space-y-3">
            {query.data.data.map((permit) => (
              <li
                className="space-y-3 rounded-lg border border-border p-4"
                key={permit.id}
              >
                <h3 className="font-medium">
                  {permit.vehicle_registration_no} · {permit.status}
                </h3>
                <p>
                  {
                    actions.find(
                      ([code]) => code === permit.action_requested
                    )?.[1]
                  }{" "}
                  · Insurance expiry:{" "}
                  {permit.vehicle_insurance_expiry_date ?? "Not recorded"}
                </p>
                {permit.issued_at && (
                  <p>
                    Decal {permit.decal_number} · {permit.valid_from}–
                    {permit.valid_to} · Received by{" "}
                    {permit.received_by ?? "Not recorded"}
                  </p>
                )}
                <div className="flex gap-2">
                  {canCreate && (
                    <Button onClick={() => load(permit)} variant="outline">
                      {permit.status === "DRAFT"
                        ? "Open draft"
                        : "View application"}
                    </Button>
                  )}
                  {canCreate && permit.user_id === actor.id && (
                    <Button
                      onClick={() => load(permit, true)}
                      variant="outline"
                    >
                      Apply for renewal
                    </Button>
                  )}
                  {permit.signed_document_id && (
                    <a
                      className="underline"
                      href={`/api/v1/hr/signed-documents/${permit.signed_document_id}/pdf`}
                    >
                      Signed application PDF
                    </a>
                  )}
                </div>
                {canIssue &&
                  permit.status === "APPROVED" &&
                  !permit.issued_at && (
                    <form
                      aria-label={`Issue decal for ${permit.vehicle_registration_no}`}
                      className="grid gap-3 md:grid-cols-2"
                      onSubmit={async (e) => {
                        await issue(e, permit);
                      }}
                    >
                      <label htmlFor={`${id}-${permit.id}-decal`}>
                        Decal number
                        <Input
                          id={`${id}-${permit.id}-decal`}
                          maxLength={50}
                          name="decal"
                          required
                        />
                      </label>
                      <label htmlFor={`${id}-${permit.id}-recipient`}>
                        Received by (print name)
                        <Input
                          id={`${id}-${permit.id}-recipient`}
                          maxLength={255}
                          name="recipient"
                        />
                      </label>
                      <label htmlFor={`${id}-${permit.id}-from`}>
                        Valid from
                        <Input
                          id={`${id}-${permit.id}-from`}
                          name="from"
                          required
                          type="date"
                        />
                      </label>
                      <label htmlFor={`${id}-${permit.id}-to`}>
                        Valid to
                        <Input
                          id={`${id}-${permit.id}-to`}
                          name="to"
                          required
                          type="date"
                        />
                      </label>
                      <Button disabled={busy} type="submit">
                        Record decal issuance
                      </Button>
                    </form>
                  )}
              </li>
            ))}
          </ul>
          {!query.data.count && <p>No parking applications yet.</p>}
          <div className="flex items-center gap-3">
            <Button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              variant="outline"
            >
              Previous applications
            </Button>
            <p>
              Page {page} · {query.data.count} applications
            </p>
            <Button
              disabled={page * 20 >= query.data.count}
              onClick={() => setPage(page + 1)}
              variant="outline"
            >
              Next applications
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
