"use client";

import {
  type NhcMarineGuidance,
  nhcMarineGuidanceSchema,
  type ProductGuidance,
} from "@barrelsgd/api-client";
import {
  fillableFields,
  type ProductField,
  type ProductValues,
} from "@barrelsgd/gms/products";
import { useEffect, useMemo, useRef, useState } from "react";
import { reportError } from "@/lib/report-error";
import { nhcRequest } from "@/lib/wxproducts/nhc-api";
import {
  formatNhcIssue,
  nhcFillValues,
  nhcPeriodSummary,
} from "./nhc-marine-fill";

type Load =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; data: NhcMarineGuidance };

const EMPTY_GUIDANCE: ProductGuidance = {
  sources: [],
  systems: [],
  facts: [],
  graphics: [],
  local_assessment: "",
};

/**
 * Read-only NHC marine block. When the panel loads with AMZ058 available, the
 * product's `fillFrom: "nhc"` wind and sea fields that are empty are filled once,
 * in knots and metres, and the NHC edition is recorded as the guidance source.
 * Typed or saved values are never replaced.
 */
export function NhcMarineGuidancePanel({
  disabled,
  guidance,
  kind,
  onChange,
  values,
}: {
  disabled: boolean;
  guidance: ProductGuidance | null;
  kind: "marine" | "marine-forecast";
  onChange: (next: ProductGuidance, values?: ProductValues) => void;
  values: ProductValues;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [filled, setFilled] = useState<string[]>([]);
  const fields = useMemo(() => fillableFields(kind, "nhc"), [kind]);
  const latest = useRef({ disabled, fields, guidance, onChange, values });
  // The fill decision reads the newest props, so a slow load never reverts a typed edit.
  const applied = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { disabled, fields, guidance, onChange, values };
  });

  useEffect(() => {
    let cancelled = false;
    nhcRequest("marine-guidance", nhcMarineGuidanceSchema)
      .then((data) => {
        if (!cancelled) setLoad({ status: "ready", data });
      })
      .catch((caught: unknown) => {
        reportError(caught, "wxproducts-nhc");
        if (!cancelled) setLoad({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (load.status !== "ready") return;
    const { data } = load;
    const current = latest.current;
    if (current.disabled) return;
    const edition = data.product?.edition_id ?? "none";
    if (applied.current === edition) return;
    applied.current = edition;
    if (data.status !== "available") return;
    const result = nhcFillValues(
      current.values,
      (data.periods ?? [])[0],
      current.fields
    );
    setFilled(result.filled);
    if (result.filled.length === 0 || !data.product) return;
    const base = current.guidance ?? EMPTY_GUIDANCE;
    const cited = (base.sources ?? []).some(
      (source) => source.edition_id === data.product?.edition_id
    );
    current.onChange(
      cited
        ? base
        : { ...base, sources: [...(base.sources ?? []), data.product] },
      { ...current.values, ...result.patch }
    );
  }, [load]);

  return (
    <section
      aria-label="NHC marine guidance"
      className="space-y-2 rounded-lg border p-4 text-sm"
    >
      <h3 className="font-semibold">NHC marine guidance (read only)</h3>
      {load.status === "loading" && <p>Loading NHC marine guidance…</p>}
      {load.status === "failed" && (
        <p role="status">
          NHC marine guidance is unavailable. Enter winds and seas by hand;
          publishing is not blocked.
        </p>
      )}
      {load.status === "ready" && (
        <ReadyBody
          data={load.data}
          filled={fields.filter((field) => filled.includes(field.key))}
          kind={kind}
        />
      )}
    </section>
  );
}

function ReadyBody({
  data,
  filled,
  kind,
}: {
  data: NhcMarineGuidance;
  filled: ProductField[];
  kind: "marine" | "marine-forecast";
}) {
  if (data.status === "not_imported") {
    return (
      <p role="status">
        No NHC Offshore Waters Forecast has been imported. Enter winds and seas
        by hand; publishing is not blocked.
      </p>
    );
  }
  if (data.status === "zone_missing") {
    return (
      <p role="status">
        The latest Offshore Waters Forecast (issued{" "}
        {formatNhcIssue(data.product?.issued_at)}) has no AMZ058 block. Enter
        winds and seas by hand; publishing is not blocked.
      </p>
    );
  }
  const issued = formatNhcIssue(data.product?.issued_at);
  return (
    <>
      <p>
        NHC says: Offshore Waters Forecast issued {issued},{" "}
        {data.zone_name ?? "zone"} ({data.zone_id}).
      </p>
      {filled.length > 0 && (
        <div className="text-muted-foreground space-y-1" role="status">
          <p>
            From NHC {data.zone_id} {issued}:{" "}
            {filled.map((field) => field.label).join(", ")}. Edit any value
            freely; your edits are kept.
          </p>
          <p>
            Only the GMS assessment is published as our text; NHC wording is
            cited, not copied.
            {kind === "marine"
              ? " Publishing this bulletin with NHC guidance needs your GMS local assessment."
              : ""}
          </p>
        </div>
      )}
      <ol className="list-none space-y-1">
        {(data.periods ?? []).map((period) => (
          <li key={period.label}>
            <strong>{period.label}.</strong> {nhcPeriodSummary(period)}
          </li>
        ))}
      </ol>
      {data.outlook && (
        <p>
          Latest tropical outlook on file: {data.outlook.title}, issued{" "}
          {formatNhcIssue(data.outlook.issued_at)} (reference only).
        </p>
      )}
    </>
  );
}
