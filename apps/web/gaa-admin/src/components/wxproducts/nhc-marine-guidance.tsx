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
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useEffect, useMemo, useState } from "react";
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
 * Read-only NHC marine block. "Fill empty fields from NHC" copies the first
 * period's wind and sea into the product's empty `fillFrom: "nhc"` fields, in
 * knots and metres, and records the NHC edition as the guidance source. It never
 * runs by itself, never replaces a typed or saved value, and is unavailable for an
 * edition older than 12 hours.
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

  const data = load.status === "ready" ? load.data : null;
  const proposal = useMemo(
    () =>
      data?.status === "available" && !data.stale
        ? nhcFillValues(values, (data.periods ?? [])[0], fields)
        : { patch: {}, filled: [] },
    [data, fields, values]
  );

  const fill = () => {
    const product = data?.product;
    if (disabled || !product || proposal.filled.length === 0) return;
    const base = guidance ?? EMPTY_GUIDANCE;
    const cited = (base.sources ?? []).some(
      (source) => source.edition_id === product.edition_id
    );
    setFilled(proposal.filled);
    onChange(
      cited ? base : { ...base, sources: [...(base.sources ?? []), product] },
      { ...values, ...proposal.patch }
    );
  };

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
      {data && (
        <ReadyBody
          canFill={!disabled && proposal.filled.length > 0}
          data={data}
          filled={fields.filter((field) => filled.includes(field.key))}
          kind={kind}
          onFill={fill}
        />
      )}
    </section>
  );
}

function ReadyBody({
  canFill,
  data,
  filled,
  kind,
  onFill,
}: {
  canFill: boolean;
  data: NhcMarineGuidance;
  filled: ProductField[];
  kind: "marine" | "marine-forecast";
  onFill: () => void;
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
      {data.stale ? (
        <p role="status">
          This Offshore Waters Forecast is older than 12 hours. It is shown for
          reference only and cannot fill fields.
        </p>
      ) : (
        <div className="space-y-1">
          <Button
            disabled={!canFill}
            onClick={onFill}
            size="sm"
            type="button"
            variant="outline"
          >
            Fill empty fields from NHC
          </Button>
          <p className="text-muted-foreground">
            Fills only empty wind and sea fields from the first period, in knots
            and metres, and cites this NHC edition. Only the GMS assessment is
            published as our text; NHC wording is cited, not copied.
            {kind === "marine"
              ? " A bulletin that cites NHC guidance needs your GMS local assessment before publishing."
              : ""}
          </p>
        </div>
      )}
      {filled.length > 0 && (
        <p className="text-muted-foreground" role="status">
          From NHC {data.zone_id} {issued}:{" "}
          {filled.map((field) => field.label).join(", ")}. Edit any value
          freely; your edits are kept.
          {kind === "marine" ? " Add your GMS local assessment next." : ""}
        </p>
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
