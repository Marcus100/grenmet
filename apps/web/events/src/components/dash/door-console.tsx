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

const REFRESH_MS = 15_000;

type Outcome =
  | { readonly kind: "ok"; readonly text: string }
  | { readonly kind: "error"; readonly text: string };

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * The door page: a text field that takes a barcode scanner's keyboard input
 * (it types the code and presses Enter) or a code typed by hand, live counts,
 * and the printable door list. No camera is used.
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

  async function admit(value: string) {
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
    input.current?.focus();
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
        <label className="font-medium text-body" htmlFor="door-code">
          Scan or enter a ticket code
        </label>
        <div className="flex gap-2">
          <Input
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono text-body-base uppercase tracking-widest"
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
        {outcome ? (
          <p
            className={
              outcome.kind === "ok"
                ? "flex items-center gap-1 font-medium text-body text-primary"
                : "font-medium text-body text-destructive"
            }
            role={outcome.kind === "ok" ? "status" : "alert"}
          >
            {outcome.kind === "ok" ? <Check className="size-4" /> : null}
            {outcome.text}
          </p>
        ) : null}
      </form>

      <section aria-labelledby="door-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            className="font-display font-semibold text-heading-sm"
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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-body">
            <thead className="border-b text-caption text-muted-foreground">
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
                    className="px-3 py-6 text-center text-muted-foreground"
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
    <div className="rounded-xl border bg-card px-3 py-4">
      <p className="font-bold font-display text-heading-base tabular-nums">
        {value}
      </p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </div>
  );
}
