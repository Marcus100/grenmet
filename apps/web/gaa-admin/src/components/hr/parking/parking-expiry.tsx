"use client";

import { readParkingPermitsApiV1HrParkingPermitsGet } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ExpiryBadge,
  ExpiryFilter,
  expiryState,
  grenadaToday,
} from "@/components/hr/expiry";

export function ParkingExpiry() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const query = useQuery({
    queryKey: ["parking-expiry", page],
    queryFn: () =>
      readParkingPermitsApiV1HrParkingPermitsGet({
        query: { page, size: 20 },
      }).unwrap(),
  });
  const today = grenadaToday();
  const rows =
    query.data?.data.filter(
      (permit) =>
        filter === "all" ||
        expiryState(permit.vehicle_insurance_expiry_date, today) === filter ||
        (permit.issued_at && expiryState(permit.valid_to, today) === filter)
    ) ?? [];
  return (
    <section aria-label="Parking expiry" className="space-y-4">
      <p className="text-muted-foreground">
        Your parking applications, permit validity and vehicle insurance dates.
        Expiry dates alone do not confirm approval or access.
      </p>
      <ExpiryFilter onChange={setFilter} value={filter} />
      {query.isPending && <p role="status">Loading parking permits…</p>}
      {query.isError && (
        <div role="alert">
          <p>Unable to load parking permits.</p>
          <Button onClick={() => query.refetch()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          {!rows.length && <p>No parking permits match on this page.</p>}
          <ul className="space-y-3">
            {rows.map((permit) => (
              <li
                className="space-y-2 rounded-lg border border-border p-4"
                key={permit.id}
              >
                <h2 className="font-medium">
                  {permit.vehicle_registration_no}
                </h2>
                <p className="text-sm">Application: {permit.status}</p>
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  Vehicle insurance:{" "}
                  {permit.vehicle_insurance_expiry_date ?? "Not recorded"}{" "}
                  <ExpiryBadge
                    date={permit.vehicle_insurance_expiry_date}
                    today={today}
                  />
                </p>
                {permit.issued_at ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    Decal {permit.decal_number ?? ""}:{" "}
                    {permit.valid_to ?? "Expiry not recorded"}{" "}
                    <ExpiryBadge date={permit.valid_to} today={today} />
                  </p>
                ) : (
                  <p className="text-sm">Decal not issued</p>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <Button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              variant="outline"
            >
              Previous
            </Button>
            <p className="text-sm">
              Page {page} of {Math.max(1, Math.ceil(query.data.count / 20))} ·{" "}
              {query.data.count} applications
            </p>
            <Button
              disabled={page * 20 >= query.data.count}
              onClick={() => setPage(page + 1)}
              variant="outline"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
