"use client";
import { useReadStaffCardApiV1HrStaffCardMeGet } from "@barrelsgd/api-client";
import Image from "next/image";

export function StaffDigitalCard() {
  const query = useReadStaffCardApiV1HrStaffCardMeGet({
    query: { retry: false },
  });
  const card = query.data;
  const loading = query.isLoading;
  const missing = query.error?.status === 404;
  const error =
    query.isError && !missing ? "Unable to load your staff card" : "";
  if (loading) return <p role="status">Loading staff card…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!card) return null;
  return (
    <section
      aria-label="GAA digital staff card"
      className="mb-6 max-w-xl space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground"
    >
      <div className="flex justify-between gap-3">
        <h2 className="font-semibold">Grenada Airports Authority</h2>
        <span className="capitalize">{card.status}</span>
      </div>
      <div className="flex items-center gap-4">
        {card.photo ? (
          <Image
            alt={`${card.name} staff photo`}
            className="rounded-lg"
            height={80}
            src={card.photo}
            unoptimized
            width={80}
          />
        ) : (
          <span
            className="rounded-lg bg-muted p-4 text-xl"
            title="Staff photo not added"
          >
            {card.name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </span>
        )}
        <div>
          <p className="font-semibold text-xl">{card.name}</p>
          <p>{card.department}</p>
          <p className="text-muted-foreground">{card.grade}</p>
        </div>
      </div>
      <div>
        <p className="text-muted-foreground text-sm">Permanent staff ID</p>
        <p className="break-all font-mono text-sm">{card.number}</p>
      </div>
      {card.status !== "active" && (
        <p className="text-sm">
          This credential is not currently active. Contact your administrator to
          complete staff setup.
        </p>
      )}
    </section>
  );
}
