"use client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";
import { DocumentPreview } from "@/components/document/document-preview";
import { Paper } from "@/components/document/paper";
export function AviationDraft() {
  const [kind, setKind] = useState("METAR");
  const [station, setStation] = useState("TGPY");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  function save() {
    try {
      localStorage.setItem(`gms-aviation-draft:${kind}:${station}`, message);
      setStatus(
        "Draft saved in this browser. It has not been issued or transmitted."
      );
    } catch {
      setStatus(
        "Browser storage is unavailable. Copy the message to retain it."
      );
    }
  }
  function load() {
    try {
      setMessage(
        localStorage.getItem(`gms-aviation-draft:${kind}:${station}`) ?? ""
      );
      setStatus("Loaded this browser's draft.");
    } catch {
      setStatus("Browser storage is unavailable.");
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setStatus("Message copied.");
    } catch {
      setStatus("Select and copy the message text.");
    }
  }
  return (
    <div className="@container">
      <div className="grid @4xl:grid-cols-2 items-start gap-5">
        <div className="space-y-5">
          <h1 className="font-semibold text-2xl">TAF / METAR Composer</h1>
          <p>
            Prepare and review a coded message. METAR is issued hourly; TAF at
            00:00, 06:00, 12:00 and 18:00 on the supplied operational schedule.
            Confirm the schedule's time basis at the desk; coded message time
            groups use UTC.
          </p>
          <p className="text-muted-foreground text-sm">
            This workspace saves browser drafts. It does not validate full
            WMO/ICAO syntax or transmit to an aviation network.
          </p>
          <div className="flex gap-2">
            {["METAR", "SPECI", "TAF"].map((type) => (
              <Button
                key={type}
                onClick={() => setKind(type)}
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
              id="aviation-station"
              maxLength={4}
              onChange={(e) => setStation(e.target.value.toUpperCase())}
              value={station}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="aviation-message">
              Coded message (UTC time groups)
            </FieldLabel>
            <Textarea
              className="font-mono"
              id="aviation-message"
              maxLength={6000}
              onChange={(e) => setMessage(e.target.value.toUpperCase())}
              rows={12}
              value={message}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} type="button">
              Save browser draft
            </Button>
            <Button onClick={load} type="button" variant="outline">
              Load browser draft
            </Button>
            <Button
              disabled={!message}
              onClick={copy}
              type="button"
              variant="outline"
            >
              Copy message
            </Button>
          </div>
          {status ? <p role="status">{status}</p> : null}
        </div>
        <DocumentPreview title="PDF preview">
          <Paper className="p-10">
            <p>GRENADA METEOROLOGICAL SERVICE</p>
            <h2 className="my-4 font-bold text-xl">
              {kind} · {station}
            </h2>
            <p className="mb-6">Working draft — not transmitted</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {message || "Enter a message to preview it here."}
            </pre>
          </Paper>
        </DocumentPreview>
      </div>
    </div>
  );
}
