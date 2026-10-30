"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Check, Printer, ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { admitTicket } from "@/data/actions";
import type { DoorManifest } from "@/domain/types";
import { formatTime } from "@/lib/datetime";
import { DoorCamera } from "./door-camera";

const REFRESH_MS = 15_000;

type Outcome =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The door page: a text field that takes a barcode scanner's keyboard input
 * (it types the code and presses Enter) or a code typed by hand, an optional
 * camera scan (`DoorCamera`, where the browser supports it), live counts, and
 * the printable door list.
 */
export function DoorConsole({
  listingId,
  manifest,
}: {
  listingId: string;
  manifest: DoorManifest;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  async function admit(value: string, fromCamera = false) {
    const trimmed = value.trim();
    if (!trimmed || pending) {
      return;
    }
    setPending(true);
    const result = await admitTicket(listingId, trimmed, newKey());
    setPending(false);
    if (result.ok) {
      const { data } = result;
      setOutcome({
        kind: "ok",
        text: `${data.holderName ?? "Guest"} · ${data.tierName} · ${data.code}`,
      });
      setCode("");
      router.refresh();
    } else {
      setOutcome({ kind: "error", text: result.error });
    }
    if (fromCamera) {
      // Keep the on-screen keyboard closed on a phone; buzz so the result is felt.
      navigator.vibrate?.(result.ok ? 80 : [120, 60, 120]);
    } else {
      input.current?.focus();
    }
  }

  const needle = filter.trim().toLowerCase();
  const rows = needle
    ? manifest.rows.filter(
        (row) =>
          (row.holderName ?? "").toLowerCase().includes(needle) ||
          row.code.toLowerCase().includes(needle)
      )
    : manifest.rows;

  return (
    <div className="space-y-6">
      <section
        aria-label="Counts"
        className="grid grid-cols-3 gap-3 text-center print:hidden"
      >
        <Count label="Admitted" value={manifest.admitted} />
        <Count label="Still to come" value={manifest.waiting} />
        <Count label="Tickets issued" value={manifest.issued} />
      </section>

      <form
        className="space-y-2 print:hidden"
        onSubmit={(event) => {
          event.preventDefault();
          admit(code);
        }}
      >
        <label className="text-body font-medium" htmlFor="door-code">
          Scan or enter a ticket code
        </label>
        <div className="flex gap-2">
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            className="text-body-base font-mono tracking-widest uppercase"
            id="door-code"
            onChange={(event) => setCode(event.target.value)}
            ref={input}
            spellCheck={false}
            value={code}
          />
          <Button disabled={pending || code.trim() === ""} type="submit">
            <ScanLine data-icon="inline-start" />
            Admit
          </Button>
        </div>
      </form>

      <div className="space-y-3 print:hidden">
        <DoorCamera disabled={pending} onScan={(value) => admit(value, true)} />
        {outcome ? (
          <p
            className={
              outcome.kind === "ok"
                ? "border-primary text-body-base text-primary flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 font-medium"
                : "border-destructive text-body-base text-destructive flex min-h-11 items-center rounded-xl border px-3 py-2 font-medium"
            }
            role={outcome.kind === "ok" ? "status" : "alert"}
          >
            {outcome.kind === "ok" ? (
              <Check className="size-5 shrink-0" />
            ) : null}
            {outcome.text}
          </p>
        ) : null}
      </div>

      <section aria-labelledby="door-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="font-display text-heading-sm font-semibold"
            id="door-list"
          >
            Door list
          </h2>
          <div className="flex gap-2 print:hidden">
            <Input
              aria-label="Find by name or code"
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Find by name or code"
              value={filter}
            />
            <Button onClick={() => window.print()} variant="outline">
              <Printer data-icon="inline-start" />
              Print list
            </Button>
          </div>
        </div>
        <p className="hidden print:block">
          {manifest.title} · {manifest.admitted} of {manifest.issued} admitted
        </p>
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="text-body w-full text-left">
            <thead className="text-caption text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Ticket</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">In</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.ticketId}>
                  <td className="px-3 py-2">{row.holderName ?? "Guest"}</td>
                  <td className="px-3 py-2">{row.tierName}</td>
                  <td className="px-3 py-2 font-mono tracking-wider">
                    {row.code}
                  </td>
                  <td className="px-3 py-2">
                    {row.admittedAt ? (
                      <Badge variant="light-success">
                        {formatTime(row.admittedAt)}
                      </Badge>
                    ) : (
                      <Button
                        className="print:hidden"
                        disabled={pending}
                        onClick={() => admit(row.code)}
                        size="sm"
                        variant="outline"
                      >
                        Admit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td
                    className="text-muted-foreground px-3 py-6 text-center"
                    colSpan={4}
                  >
                    No tickets match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-xl border px-3 py-4">
      <p className="font-display text-heading-base font-bold tabular-nums">
        {value}
      </p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}
