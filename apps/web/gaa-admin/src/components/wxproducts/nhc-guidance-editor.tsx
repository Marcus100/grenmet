"use client";

import {
  type GuidanceSystem,
  type NhcContent,
  type NhcJob,
  type NhcPage,
  type NhcPrefill,
  nhcContentSchema,
  nhcPageSchema,
  nhcPrefillSchema,
  nhcSourceCheckSchema,
  type ProductGuidance,
} from "@barrelsgd/api-client";
import type { ProductValues } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  NhcContentView,
  RecordTable,
} from "@/components/wxproducts/nhc-content";
import { reportError } from "@/lib/report-error";
import { nhcRequest } from "@/lib/wxproducts/nhc-api";
import { FactsForm } from "./nhc-facts-form";
import { mergeGuidancePrefill, mergePrefillValues } from "./nhc-guidance-merge";

// Re-exported so existing imports of these helpers keep working.
export {
  mergeGuidancePrefill,
  mergePrefillValues,
} from "./nhc-guidance-merge";

export function NhcGuidanceEditor({
  kind,
  guidance,
  values,
  sourceEditionIds,
  onChange,
  disabled,
  existingSystems,
}: {
  kind: "outlook" | "cyclone" | "marine";
  guidance: ProductGuidance | null;
  values: ProductValues;
  sourceEditionIds: string[];
  onChange: (guidance: ProductGuidance, values?: ProductValues) => void;
  disabled: boolean;
  existingSystems: GuidanceSystem[];
}) {
  const [proposal, setProposal] = useState<NhcPrefill | null>(null);
  const [replace, setReplace] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sources, setSources] = useState<NhcContent[]>([]);
  const [updates, setUpdates] = useState<string[]>([]);
  const [picked, setPicked] = useState(sourceEditionIds);
  const [catalogue, setCatalogue] = useState<NhcPage | null>(null);
  const [history, setHistory] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [confirmedLinks, setConfirmedLinks] = useState<string[]>([]);
  const [marinePeriod, setMarinePeriod] = useState("");
  const [pointJobs, setPointJobs] = useState<NhcJob[]>([]);
  const recordPoint = useCallback((job: NhcJob) => {
    setPointJobs((jobs) => [
      ...jobs.filter((existing) => existing.id !== job.id),
      job,
    ]);
  }, []);
  const selected = [
    ...new Set([
      ...picked,
      ...(guidance?.sources ?? []).map((source) => source.edition_id),
    ]),
  ];
  const selectedKey = selected.join(",");
  useEffect(() => {
    if (!selectedKey) {
      setSources([]);
      setUpdates([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedKey
        .split(",")
        .map((id) =>
          nhcRequest(`editions/${encodeURIComponent(id)}`, nhcContentSchema)
        )
    )
      .then((items) => {
        if (!cancelled) setSources(items);
      })
      .catch((caught) => {
        reportError(caught, "wxproducts-nhc");
        if (!cancelled)
          setError(
            "Source editions unavailable; existing draft content is retained."
          );
      });
    const query = new URLSearchParams();
    for (const id of selectedKey.split(",")) query.append("edition_ids", id);
    nhcRequest(`source-checks?${query}`, z.array(nhcSourceCheckSchema))
      .then((items) => {
        if (!cancelled)
          setUpdates(
            items
              .filter((item) => item.newer_edition_id)
              .map((item) => item.edition_id)
          );
      })
      .catch((caught) => {
        reportError(caught, "wxproducts-nhc");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);
  const current: ProductGuidance = guidance ?? {
    sources: [],
    systems: [],
    facts: [],
    graphics: [],
    local_assessment: "",
  };
  const systems = current.systems ?? [];
  function updateSystem(index: number, change: Partial<GuidanceSystem>) {
    onChange({
      ...current,
      systems: systems.map((system, position) =>
        position === index ? { ...system, ...change } : system
      ),
    });
  }
  const periods = sources.flatMap((source) => {
    const structured = source.decoded.structured;
    if (
      typeof structured !== "object" ||
      structured === null ||
      Array.isArray(structured) ||
      !("marine_periods" in structured) ||
      !Array.isArray(structured.marine_periods)
    )
      return [];
    return structured.marine_periods.flatMap((period) =>
      typeof period === "object" &&
      period !== null &&
      !Array.isArray(period) &&
      "zone_id" in period &&
      typeof period.zone_id === "string" &&
      "label" in period &&
      typeof period.label === "string"
        ? [
            {
              id: `${period.zone_id}|${period.label}`,
              label: `${period.zone_id} · ${period.label}`,
            },
          ]
        : []
    );
  });
  async function browse(offset = 0) {
    setBusy(true);
    setError("");
    try {
      setCatalogue(
        await nhcRequest(
          `editions?latest=${!history}&offset=${offset}`,
          nhcPageSchema
        )
      );
    } catch (caught) {
      reportError(caught, "wxproducts-nhc");
      setError("Could not load collected NHC sources.");
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...picked, id])].slice(0, 30)
      : picked.filter((item) => item !== id);
    setPicked(next);
    const url = new URL(window.location.href);
    if (next.length) url.searchParams.set("sources", next.join(","));
    else url.searchParams.delete("sources");
    window.history.replaceState(null, "", url);
  }
  async function propose() {
    setBusy(true);
    setError("");
    try {
      const [zone_id, period_label] = marinePeriod.split("|");
      setProposal(
        await nhcRequest("prefill", nhcPrefillSchema, {
          kind,
          edition_ids: selected,
          point_job_ids: pointJobs
            .filter(
              (job) =>
                typeof job.result?.edition_id === "string" &&
                selected.includes(job.result.edition_id)
            )
            .map((job) => job.id),
          zone_id: zone_id || null,
          period_label: period_label || null,
        })
      );
      setReplace([]);
      setLinks({});
      setConfirmedLinks([]);
    } catch (caught) {
      reportError(caught, "wxproducts-nhc");
      setError(
        caught instanceof Error ? caught.message : "Prefill unavailable"
      );
    } finally {
      setBusy(false);
    }
  }
  function accept() {
    if (!proposal) return;
    onChange(
      mergeGuidancePrefill(
        current,
        proposal.guidance,
        existingSystems,
        links,
        confirmedLinks
      ),
      mergePrefillValues(values, proposal.values, replace)
    );
    setProposal(null);
  }
  return (
    <fieldset
      className="space-y-4 rounded-lg border p-4"
      disabled={disabled || busy}
    >
      <legend className="font-semibold">NHC guidance and GMS assessment</legend>
      <div className="flex flex-wrap items-center gap-3">
        <label>
          <input
            checked={history}
            onChange={(event) => setHistory(event.target.checked)}
            type="checkbox"
          />{" "}
          Browse collected history
        </label>
        <Button onClick={() => browse()} type="button" variant="outline">
          Choose NHC source editions
        </Button>
      </div>
      {catalogue && (
        <section aria-label="Collected NHC sources" className="space-y-2">
          <ul>
            {catalogue.items.map((edition) => (
              <li key={edition.id}>
                <label>
                  <input
                    checked={picked.includes(edition.id)}
                    onChange={(event) =>
                      choose(edition.id, event.target.checked)
                    }
                    type="checkbox"
                  />{" "}
                  {edition.title} · {edition.storm_id ?? ""} ·{" "}
                  {edition.issued_at ?? "Issue unknown"}
                </label>
              </li>
            ))}
          </ul>
          {catalogue.items.length === 0 && (
            <p>No collected editions match this view.</p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={catalogue.offset === 0}
              onClick={() => browse(Math.max(0, catalogue.offset - 30))}
              type="button"
              variant="outline"
            >
              Previous source editions
            </Button>
            <Button
              disabled={!catalogue.has_more}
              onClick={() => browse(catalogue.offset + 30)}
              type="button"
              variant="outline"
            >
              Next source editions
            </Button>
          </div>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {updates.length > 0 && (
        <p role="status">
          Newer guidance is available for {updates.length} selected source(s).
          Review it before preparing the next issue; this draft has not changed.
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {sources.map((source) => (
          <li key={source.edition.id}>
            {source.edition.title} ·{" "}
            {source.edition.issued_at ?? "Issue time unknown"}
            {(current.sources ?? []).some(
              (item) => item.edition_id === source.edition.id
            ) && " · Accepted source"}
          </li>
        ))}
      </ul>
      {kind === "marine" && periods.length > 0 && (
        <label className="block">
          Regional forecast period
          <select
            className="ml-3 rounded-md border bg-background p-2"
            onChange={(event) => setMarinePeriod(event.target.value)}
            value={marinePeriod}
          >
            <option value="">Select a zone and period</option>
            {[
              ...new Map(periods.map((period) => [period.id, period])).values(),
            ].map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {sources
        .filter((source) => source.edition.kind === "grid")
        .map((source) => (
          <details key={source.edition.id}>
            <summary>Inspect and sample {source.edition.title}</summary>
            <NhcContentView content={source} onPointReady={recordPoint} />
          </details>
        ))}
      {pointJobs.length > 0 && (
        <p>
          {pointJobs.length} completed sample request(s) available for prefill
          review. Source units and native-cell validity are retained.
        </p>
      )}
      <Button
        disabled={selected.length === 0}
        onClick={propose}
        type="button"
        variant="outline"
      >
        Review proposed prefills
      </Button>
      {proposal && (
        <section
          aria-label="Proposed NHC prefills"
          className="space-y-3 rounded-lg border p-3"
        >
          <h3 className="font-semibold">Proposed fields</h3>
          {proposal.notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
          {Object.entries(proposal.values).map(([key, value]) => (
            <div key={key}>
              <strong>{key}</strong>
              <p className="whitespace-pre-wrap">{value}</p>
              {values[key] && values[key] !== value && (
                <label>
                  <input
                    checked={replace.includes(key)}
                    onChange={(event) =>
                      setReplace((items) =>
                        event.target.checked
                          ? [...items, key]
                          : items.filter((item) => item !== key)
                      )
                    }
                    type="checkbox"
                  />{" "}
                  Replace existing {key} wording
                </label>
              )}
            </div>
          ))}
          <RecordTable rows={proposal.guidance.facts} />
          {(proposal.guidance.systems ?? []).map((system) => (
            <section className="space-y-2" key={system.id}>
              <p>
                {system.name}: {system.narrative}
              </p>
              <RecordTable rows={system.facts} />
              <label>
                Connect to existing GMS system
                <select
                  className="ml-2 rounded-md border bg-background p-2"
                  onChange={(event) => {
                    setLinks((items) => ({
                      ...items,
                      [system.id]: event.target.value,
                    }));
                    setConfirmedLinks((items) =>
                      items.filter((id) => id !== system.id)
                    );
                  }}
                  value={links[system.id] ?? ""}
                >
                  <option value="">Create a new system</option>
                  {existingSystems.map((existing) => (
                    <option key={existing.id} value={existing.id}>
                      {existing.name} · {existing.id}
                    </option>
                  ))}
                </select>
              </label>
              {links[system.id] && (
                <label className="block">
                  <input
                    checked={confirmedLinks.includes(system.id)}
                    onChange={(event) =>
                      setConfirmedLinks((items) =>
                        event.target.checked
                          ? [...items, system.id]
                          : items.filter((id) => id !== system.id)
                      )
                    }
                    type="checkbox"
                  />{" "}
                  I confirm these source descriptions refer to the same system
                </label>
              )}
            </section>
          ))}
          <Button
            disabled={Object.entries(links).some(
              ([id, value]) => value && !confirmedLinks.includes(id)
            )}
            onClick={accept}
            type="button"
          >
            Accept reviewed prefills
          </Button>
          <Button
            onClick={() => setProposal(null)}
            type="button"
            variant="outline"
          >
            Discard proposals
          </Button>
        </section>
      )}
      {systems.map((system, index) => (
        <section className="space-y-3 rounded-lg border p-3" key={system.id}>
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={`system-name-${system.id}`}>
              Name
              <Input
                id={`system-name-${system.id}`}
                maxLength={300}
                onChange={(event) =>
                  updateSystem(index, { name: event.target.value })
                }
                value={system.name}
              />
            </label>
            <label>
              Feature type
              <select
                className="ml-2 rounded-md border bg-background p-2"
                onChange={(event) =>
                  updateSystem(index, {
                    feature_type: event.target
                      .value as GuidanceSystem["feature_type"],
                  })
                }
                value={system.feature_type}
              >
                {[
                  "disturbance",
                  "tropical_wave",
                  "low_pressure_area",
                  "low_pressure_centre",
                  "tropical_cyclone",
                  "other",
                ].map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() =>
                onChange({
                  ...current,
                  systems: systems
                    .filter((item) => item.id !== system.id)
                    .map((item) =>
                      item.parent_system_id === system.id
                        ? {
                            ...item,
                            parent_system_id: null,
                            relationship_confirmed: false,
                          }
                        : item
                    ),
                })
              }
              type="button"
              variant="outline"
            >
              Remove system
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Stable GMS system ID: {system.id}
          </p>
          {system.suggested_parent_system_id && !system.parent_system_id && (
            <p className="text-sm">
              Source describes an embedded feature.{" "}
              <Button
                onClick={() =>
                  updateSystem(index, {
                    parent_system_id: system.suggested_parent_system_id,
                    relationship_confirmed: true,
                    suggested_parent_system_id: null,
                  })
                }
                type="button"
                variant="outline"
              >
                Confirm suggested parent relationship
              </Button>
            </p>
          )}
          <label className="block">
            Parent / containing system
            <select
              className="ml-2 rounded-md border bg-background p-2"
              onChange={(event) =>
                updateSystem(index, {
                  parent_system_id: event.target.value || null,
                  relationship_confirmed: false,
                })
              }
              value={system.parent_system_id ?? ""}
            >
              <option value="">Independent system</option>
              {systems
                .filter((item) => item.id !== system.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          {system.parent_system_id && (
            <label className="flex items-center gap-2">
              <input
                checked={system.relationship_confirmed ?? false}
                onChange={(event) =>
                  updateSystem(index, {
                    relationship_confirmed: event.target.checked,
                  })
                }
                type="checkbox"
              />{" "}
              I confirm this feature belongs to the selected parent system
            </label>
          )}
          <label className="block" htmlFor={`system-narrative-${system.id}`}>
            System narrative
            <Textarea
              id={`system-narrative-${system.id}`}
              maxLength={12_000}
              onChange={(event) =>
                updateSystem(index, { narrative: event.target.value })
              }
              value={system.narrative ?? ""}
            />
          </label>
          <FactsForm
            facts={system.facts ?? []}
            full
            onChange={(facts) => updateSystem(index, { facts })}
            sources={current.sources ?? []}
          />
          <label className="block" htmlFor={`system-assessment-${system.id}`}>
            GMS assessment of this system
            <Textarea
              id={`system-assessment-${system.id}`}
              maxLength={12_000}
              onChange={(event) =>
                updateSystem(index, { local_assessment: event.target.value })
              }
              value={system.local_assessment ?? ""}
            />
          </label>
        </section>
      ))}
      <Button
        onClick={() =>
          onChange({
            ...current,
            systems: [
              ...systems,
              {
                id: crypto.randomUUID(),
                name: "",
                feature_type: "disturbance",
                narrative: "",
                facts: [],
              },
            ],
          })
        }
        type="button"
        variant="outline"
      >
        Add meteorological system
      </Button>
      {(current.facts ?? []).length > 0 && (
        <section>
          <h3 className="font-semibold">Other selected source facts</h3>
          <FactsForm
            facts={current.facts ?? []}
            onChange={(facts) => onChange({ ...current, facts })}
            sources={current.sources ?? []}
          />
        </section>
      )}
      <label className="block" htmlFor="gms-local-assessment">
        GMS local assessment
        <Textarea
          id="gms-local-assessment"
          maxLength={12_000}
          onChange={(event) =>
            onChange({ ...current, local_assessment: event.target.value })
          }
          value={current.local_assessment ?? ""}
        />
      </label>
      {sources.flatMap((source) =>
        (source.edition.assets ?? [])
          .filter(
            (asset) =>
              asset.media_type.startsWith("image/") &&
              (current.sources ?? []).some(
                (selectedSource) =>
                  selectedSource.edition_id === source.edition.id
              )
          )
          .map((asset) => (
            <label className="block" key={asset.asset_id}>
              <input
                checked={(current.graphics ?? []).some(
                  (graphic) => graphic.asset_id === asset.asset_id
                )}
                onChange={(event) =>
                  onChange({
                    ...current,
                    graphics: event.target.checked
                      ? [
                          ...(current.graphics ?? []),
                          {
                            edition_id: source.edition.id,
                            asset_id: asset.asset_id,
                            caption: source.edition.title,
                          },
                        ]
                      : (current.graphics ?? []).filter(
                          (graphic) => graphic.asset_id !== asset.asset_id
                        ),
                  })
                }
                type="checkbox"
              />{" "}
              Include {source.edition.title} graphic in PDF (accept the source
              first)
            </label>
          ))
      )}
      {(current.graphics ?? []).map((graphic, index) => (
        <label
          className="block"
          htmlFor={`caption-${graphic.asset_id}`}
          key={graphic.asset_id}
        >
          Graphic caption
          <Input
            id={`caption-${graphic.asset_id}`}
            maxLength={1000}
            onChange={(event) =>
              onChange({
                ...current,
                graphics: (current.graphics ?? []).map((item, position) =>
                  position === index
                    ? { ...item, caption: event.target.value }
                    : item
                ),
              })
            }
            value={graphic.caption}
          />
        </label>
      ))}
      <p className="text-muted-foreground text-sm">
        NHC guidance and GMS assessments remain distinguishable. Publication
        still requires your product preview and confirmation.
      </p>
    </fieldset>
  );
}
