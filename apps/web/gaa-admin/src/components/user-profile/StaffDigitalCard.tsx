"use client";
import { type StaffCard, useHrGetStaffCard } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { BadgeCheck, Copy, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

const NAME_SEPARATOR = /\s+/u;

export function DigitalStaffCard({ card }: { card: StaffCard }) {
  const [message, setMessage] = useState("");
  const active = card.status === "active";
  let statusLabel = "Credential pending verification";
  if (active) statusLabel = "Active credential";
  else if (card.status === "inactive") statusLabel = "Inactive credential";
  return (
    <section
      aria-label="GAA digital staff card"
      className="border-border bg-card text-card-foreground mb-6 overflow-hidden rounded-xl border"
    >
      <div className="border-border bg-muted/50 flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-xs tracking-widest uppercase">
            Grenada Airports Authority
          </p>
          <h2 className="mt-1 text-lg font-semibold">Employee Digital ID</h2>
        </div>
        <ShieldCheck aria-hidden="true" className="text-primary size-7" />
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-5">
          {card.photo ? (
            <Image
              alt={`${card.name} staff photo`}
              className="size-24 rounded-xl object-cover"
              height={96}
              src={card.photo}
              unoptimized
              width={96}
            />
          ) : (
            <span
              className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold"
              title="Staff photo not added"
            >
              {card.name
                .split(NAME_SEPARATOR)
                .filter(Boolean)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
          )}
          <div>
            <p className="text-2xl font-semibold">{card.name}</p>
            <p className="mt-1">{card.grade || "Grade not assigned"}</p>
            <p className="text-muted-foreground">
              {card.department || "Department not assigned"}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
              {active && <BadgeCheck aria-hidden="true" className="size-4" />}
              {statusLabel}
            </p>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{card.email_verified ? "Verified" : "Verification pending"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Account approval</dt>
            <dd>{card.account_approved ? "Approved" : "Approval pending"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">HR details</dt>
            <dd>{card.employment_ready ? "Complete" : "Pending completion"}</dd>
          </div>
        </dl>
      </div>
      <div className="border-border space-y-3 border-t px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Permanent staff ID</p>
            <p className="mt-1 font-mono text-sm break-all">{card.number}</p>
          </div>
          <Button
            aria-label="Copy staff ID"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(card.number);
                setMessage("Staff ID copied.");
              } catch {
                setMessage(
                  "Unable to copy. Select the staff ID to copy it manually."
                );
              }
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Your permanent ID stays the same when your name, email, department or
          grade changes.
        </p>
        {message && (
          <p className="text-sm" role="status">
            {message}
          </p>
        )}
        {!card.employment_ready && (
          <p className="text-muted-foreground text-sm">
            Your administrator can complete employment details separately. Your
            staff ID is already assigned.
          </p>
        )}
      </div>
    </section>
  );
}

export function StaffDigitalCard() {
  const query = useHrGetStaffCard({
    query: { retry: false },
  });
  if (query.isLoading) return <p role="status">Loading staff card…</p>;
  if (query.isError && query.error?.status !== 404)
    return <p role="alert">Unable to load your staff card</p>;
  if (!query.data) return null;
  return <DigitalStaffCard card={query.data} />;
}
