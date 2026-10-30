"use client";
import {
  type AviationDraftRead,
  type AviationIssue,
  type AviationRevisionRead,
  aviationDraftListSchema,
  aviationDraftReadSchema,
  aviationHistorySchema,
  aviationValidationResponseSchema,
  browserSessionSchema,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@barrelsgd/ui/components/ui/tabs";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";
import { SectionCard } from "@/components/wxproducts/eregister-ui";

type AviationKind = AviationDraftRead["kind"];

const TIMES = [
  ["observed_at", "Observation time (UTC)"],
  ["issued_at", "Intended issue time (UTC)"],
  ["valid_from", "Validity start (UTC)"],
  ["valid_to", "Validity end (UTC)"],
] as const;
const EMPTY = {
  message: "",
  observed_at: "",
  issued_at: "",
  valid_from: "",
  valid_to: "",
};
const BASE = "/_backend/weather/aviation/drafts";
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body ? body.detail : null;
    throw new Error(
      typeof detail === "string"
        ? detail
        : "Could not complete the request. Check your access, connection and UTC time fields."
    );
  }
  return body;
}
function utcInput(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, -1) : "";
}

function CodingFindings({ issues }: { issues: AviationIssue[] | null }) {
  if (issues === null) return null;
  if (issues.length === 0) {
    return <p className="text-xs">Coding check: no findings.</p>;
  }
  return (
    <ul aria-label="Coding findings" className="space-y-2 text-xs">
      {issues.map((issue) => (
        <li
          className={
            issue.severity === "error"
              ? "border-destructive/30 border-l-destructive bg-destructive/5 rounded-md border border-l-4 px-3 py-2"
              : "border-border border-l-warning bg-card rounded-md border border-l-4 px-3 py-2"
          }
          key={`${issue.code}-${issue.group ?? ""}-${issue.message}`}
        >
          <p>
            <strong>{issue.severity === "error" ? "Error" : "Note"}</strong>
            {issue.group ? (
              <>
                {" · "}
                <code className="font-mono">{issue.group}</code>
              </>
            ) : null}
            {": "}
            {issue.message}
          </p>
          <p className="text-muted-foreground">
            {issue.code} · {issue.rule}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function AviationDraft() {
  const [kind, setKind] = useState<AviationKind>("METAR");
  const [station, setStation] = useState("TGPY");
  const [form, setForm] = useState(EMPTY);
  const [baseline, setBaseline] = useState(EMPTY);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<AviationDraftRead | null>(null);
  const [drafts, setDrafts] = useState<AviationDraftRead[]>([]);
  const [history, setHistory] = useState<AviationRevisionRead[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [coding, setCoding] = useState<{
    issues: AviationIssue[];
    key: string;
  } | null>(null);
  const draftKey = JSON.stringify({ kind, station, form });
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  let draftState = "New draft";
  if (revision) draftState = `Saved revision ${revision}`;
  if (dirty) draftState = "Unsaved changes";
  function canReplace() {
    if (!dirty) return true;
    setStatus("Save your changes or discard them before switching drafts.");
    return false;
  }
  function select(draft: AviationDraftRead) {
    if (!canReplace()) return;
    const values = {
      message: draft.message,
      observed_at: utcInput(draft.observed_at),
      issued_at: utcInput(draft.issued_at),
      valid_from: utcInput(draft.valid_from),
      valid_to: utcInput(draft.valid_to),
    };
    setForm(values);
    setBaseline(values);
    setId(draft.id);
    setRevision(draft.revision);
    setSaved(draft);
    setHistory([]);
    setKind(draft.kind);
    setStation(draft.station);
    setStatus(`Loaded revision ${draft.revision}.`);
  }
  function newDraft(nextKind = kind) {
    if (!canReplace()) return;
    setKind(nextKind);
    setId(crypto.randomUUID());
    setRevision(0);
    setSaved(null);
    setForm(EMPTY);
    setBaseline(EMPTY);
    setHistory([]);
    setStatus("");
    if (nextKind !== kind) setDrafts([]);
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await work();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Request failed. Your draft is still here."
      );
    } finally {
      setBusy(false);
    }
  }
  function utcTimes() {
    return Object.fromEntries(
      TIMES.map(([key]) => [
        key,
        form[key] ? new Date(`${form[key]}Z`).toISOString() : null,
      ])
    );
  }
  async function checkCoding() {
    await action(async () => {
      const session = browserSessionSchema.parse(
        await request("/_backend/browser-session")
      );
      const result = aviationValidationResponseSchema.parse(
        await request(`${BASE}/validate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrfToken,
          },
          body: JSON.stringify({
            kind,
            station,
            message: form.message,
            ...utcTimes(),
          }),
        })
      );
      setCoding({ issues: result.issues ?? [], key: draftKey });
      setStatus(
        result.valid
          ? "Coding check passed. Drafts can still be saved with notes."
          : "Coding check found errors. See the review panel; the draft can still be saved."
      );
    });
  }
  async function save() {
    await action(async () => {
      const session = browserSessionSchema.parse(
        await request("/_backend/browser-session")
      );
      const times = utcTimes();
      const result = aviationDraftReadSchema.parse(
        await request(BASE, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrfToken,
          },
          body: JSON.stringify({
            id,
            expected_revision: revision,
            kind,
            station,
            message: form.message,
            ...times,
          }),
        })
      );
      setRevision(result.revision);
      setSaved(result);
      setBaseline(form);
      setHistory([]);
      setDrafts((current) => [
        result,
        ...current.filter((item) => item.id !== result.id),
      ]);
      setStatus(
        `Revision ${result.revision} saved to FastAPI. Not issued or transmitted.`
      );
    });
  }
  function importBrowserDraft() {
    if (!canReplace()) return;
    try {
      const message = localStorage.getItem(
        `gms-aviation-draft:${kind}:${station}`
      );
      if (!message) {
        setStatus("No browser draft found for this station and report type.");
        return;
      }
      setId(crypto.randomUUID());
      setRevision(0);
      setSaved(null);
      setHistory([]);
      setForm({ ...EMPTY, message });
      setBaseline(EMPTY);
      setStatus(
        "Browser draft loaded as a new unsaved draft. Check its UTC times, then save. The browser copy is retained."
      );
    } catch {
      setStatus("Browser storage is unavailable.");
    }
  }
  return (
    <div className="@container space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            Aviation weather
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            TAF / METAR Composer
          </h1>
          <p className="text-muted-foreground text-sm">
            {kind} · {station} · working draft
          </p>
        </div>
        <Badge variant="secondary">{draftState}</Badge>
      </header>
      <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
        <SectionCard
          action={<Badge variant="secondary">Draft · not transmitted</Badge>}
          title="Aviation message workbook"
        >
          <fieldset className="space-y-5 p-4" disabled={busy}>
            {dirty ? (
              <Button
                onClick={() => {
                  setForm(baseline);
                  setStatus("Unsaved changes discarded.");
                }}
                type="button"
                variant="outline"
              >
                Discard unsaved changes
              </Button>
            ) : null}
            <p className="text-muted-foreground text-sm">
              Enter the coded message and UTC times. Saving records a working
              draft; it does not issue or transmit the message.
            </p>
            <Tabs
              className="border-b pb-5"
              onValueChange={(value) => newDraft(value as AviationKind)}
              value={kind}
            >
              <TabsList aria-label="Message type">
                {(["METAR", "SPECI", "TAF"] as const).map((type) => (
                  <TabsTrigger
                    key={type}
                    onClick={() => {
                      // Re-selecting the open type starts a fresh draft, as the buttons did.
                      if (type === kind) newDraft(type);
                    }}
                    value={type}
                  >
                    {type}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="max-w-40">
                <FieldLabel htmlFor="aviation-station">ICAO station</FieldLabel>
                <Input
                  disabled={revision > 0}
                  id="aviation-station"
                  maxLength={4}
                  onChange={(event) => {
                    setStation(event.target.value.toUpperCase());
                    setDrafts([]);
                  }}
                  value={station}
                />
              </Field>
              <Button
                onClick={() => newDraft()}
                type="button"
                variant="outline"
              >
                New draft
              </Button>
              <Button
                onClick={() =>
                  action(async () => {
                    const result = aviationDraftListSchema.parse(
                      await request(
                        `${BASE}?${new URLSearchParams({ kind, station })}`
                      )
                    );
                    setDrafts(result.drafts);
                    setStatus(
                      result.drafts.length
                        ? "Select a saved draft below (up to 50 latest)."
                        : "No saved drafts for this station and report type."
                    );
                  })
                }
                type="button"
                variant="outline"
              >
                Load saved drafts
              </Button>
            </div>
            {drafts.length ? (
              <ul className="space-y-2">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <Button
                      onClick={() => select(draft)}
                      type="button"
                      variant="outline"
                    >
                      Revision {draft.revision} · {draft.updated_at} ·{" "}
                      {draft.actor_name}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Field>
              <FieldLabel htmlFor="aviation-message">
                Coded message (UTC time groups)
              </FieldLabel>
              <Textarea
                className="font-mono"
                id="aviation-message"
                maxLength={6000}
                onChange={(event) =>
                  setForm({ ...form, message: event.target.value })
                }
                rows={8}
                value={form.message}
              />
            </Field>
            <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
              {TIMES.map(([key, label]) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`aviation-${key}`}>{label}</FieldLabel>
                  <Input
                    id={`aviation-${key}`}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                    step="any"
                    type="datetime-local"
                    value={form[key]}
                  />
                </Field>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Leave unknown times blank. Save time is recorded separately and
              does not establish an observation or issue time.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!form.message.trim()}
                onClick={save}
                type="button"
              >
                Save draft
              </Button>
              <Button
                disabled={!form.message.trim()}
                onClick={checkCoding}
                type="button"
                variant="outline"
              >
                Check coding
              </Button>
              <Button
                onClick={importBrowserDraft}
                type="button"
                variant="outline"
              >
                Import browser draft
              </Button>
              <Button
                disabled={!form.message}
                onClick={() =>
                  action(async () => {
                    await navigator.clipboard.writeText(form.message);
                    setStatus("Message copied.");
                  })
                }
                type="button"
                variant="outline"
              >
                Copy message
              </Button>
            </div>
            {saved ? (
              <p className="text-sm">
                Saved revision {saved.revision} · {saved.actor_name} ·{" "}
                {saved.updated_at}
                {dirty ? " · Unsaved changes" : ""}
              </p>
            ) : null}
            {revision > 0 ? (
              <Button
                onClick={() =>
                  action(async () => {
                    const result = aviationHistorySchema.parse(
                      await request(`${BASE}/${id}/history`)
                    );
                    setHistory(result.revisions);
                  })
                }
                type="button"
                variant="outline"
              >
                View revision history
              </Button>
            ) : null}
            {history.map((item) => (
              <details key={item.revision}>
                <summary>
                  Revision {item.revision} · {item.actor_name} ·{" "}
                  {item.recorded_at}
                </summary>
                <pre className="text-xs break-words whitespace-pre-wrap">
                  {JSON.stringify(item, null, 2)}
                </pre>
              </details>
            ))}
            {status ? <p role="status">{status}</p> : null}
          </fieldset>
        </SectionCard>
        <SectionCard
          action={<Badge variant="secondary">Working text</Badge>}
          title="Message review"
        >
          <div className="space-y-4 p-4">
            <p className="text-muted-foreground text-xs">
              Review the coded text, then use Check coding to test it against
              the WMO/ICAO rules. Findings advise; they never block saving, and
              nothing is transmitted.
            </p>
            <div className="bg-muted rounded-lg p-3">
              <p className="mb-2 text-xs font-medium">
                {kind} · {station}
              </p>
              <code className="block font-mono text-sm break-words whitespace-pre-wrap">
                {form.message || "Enter a message to review it here."}
              </code>
            </div>
            <CodingFindings
              issues={coding?.key === draftKey ? coding.issues : null}
            />
            <dl className="grid gap-2 text-xs">
              {TIMES.map(([key, label]) => (
                <div className="flex justify-between gap-3" key={key}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-mono">{form[key] || "Not set"}</dd>
                </div>
              ))}
            </dl>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
