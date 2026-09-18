"use client";
import {
  type AviationDraftRead,
  type AviationRevisionRead,
  aviationDraftListSchema,
  aviationDraftReadSchema,
  aviationHistorySchema,
  browserSessionSchema,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";
import { DocumentPreview } from "@/components/document/document-preview";
import { Paper } from "@/components/document/paper";

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
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
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
  async function save() {
    await action(async () => {
      const session = browserSessionSchema.parse(
        await request("/_backend/browser-session")
      );
      const times = Object.fromEntries(
        TIMES.map(([key]) => [
          key,
          form[key] ? new Date(`${form[key]}Z`).toISOString() : null,
        ])
      );
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
    <div className="@container">
      <div className="grid @4xl:grid-cols-2 items-start gap-5">
        <fieldset className="space-y-5" disabled={busy}>
          <h1 className="font-semibold text-2xl">TAF / METAR Composer</h1>
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
          <p>
            Save working METAR, SPECI and TAF drafts to FastAPI. Full
            coded-message validation, issuance and transmission are not part of
            this draft workspace.
          </p>
          <p className="text-muted-foreground text-sm">
            All time fields use UTC. Enter full dates explicitly; leave unknown
            times blank. Save time is recorded separately and does not establish
            an observation or issue time.
          </p>
          <div className="flex gap-2">
            {(["METAR", "SPECI", "TAF"] as const).map((type) => (
              <Button
                key={type}
                onClick={() => newDraft(type)}
                type="button"
                variant={kind === type ? "default" : "outline"}
              >
                {type}
              </Button>
            ))}
          </div>
          <Field>
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
          <Button onClick={() => newDraft()} type="button" variant="outline">
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
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!form.message.trim()}
              onClick={save}
              type="button"
            >
              Save draft
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
              <pre className="whitespace-pre-wrap break-words text-xs">
                {JSON.stringify(item, null, 2)}
              </pre>
            </details>
          ))}
          {status ? <p role="status">{status}</p> : null}
        </fieldset>
        <DocumentPreview title="PDF preview">
          <Paper className="p-10">
            <p>GRENADA METEOROLOGICAL SERVICE</p>
            <h2 className="my-4 font-bold text-xl">
              {kind} · {station}
            </h2>
            <p className="mb-6">Working draft — not transmitted</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {form.message || "Enter a message to preview it here."}
            </pre>
          </Paper>
        </DocumentPreview>
      </div>
    </div>
  );
}
