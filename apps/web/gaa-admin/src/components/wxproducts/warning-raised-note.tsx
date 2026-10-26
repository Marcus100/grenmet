"use client";

import { capGetEscalation } from "@barrelsgd/api-client";
import { useEffect, useState } from "react";

/**
 * Shown on a GMS alert once a CAP warning was raised from it. The alert is not
 * withdrawn automatically; the forecaster does that when appropriate. The
 * parent remounts it (a changed `key`) to look again after a raise.
 */
export function WarningRaisedNote({ productId }: { productId: string }) {
  const [alertId, setAlertId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    capGetEscalation({ query: { product_id: productId } })
      .unwrap()
      .then((found) => {
        if (!cancelled) setAlertId(found.alert_id ?? null);
      })
      .catch(() => {
        // The note is a convenience; the editor works without it.
        if (!cancelled) setAlertId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);
  if (!alertId) return null;
  return (
    <p className="rounded-lg border p-3 text-sm" role="status">
      Warning raised:{" "}
      <a className="underline" href={`/cap/admin/${alertId}`}>
        open the CAP alert
      </a>
      . This green alert stays in force until you withdraw it.
    </p>
  );
}
