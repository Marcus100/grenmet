"use client";

import type { NhcContent, NhcJob } from "@barrelsgd/api-client";
import { nhcJobSchema } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Layer, type MapRef, Source } from "react-map-gl/maplibre";
import { CapMap } from "@/components/cap/cap-map";
import { reportError } from "@/lib/report-error";
import { nhcAssetUrl, nhcRequest } from "@/lib/wxproducts/nhc-api";

function displayValue(value: unknown) {
  if (value == null) return "Unknown";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function RecordTable({ rows }: { rows: unknown }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const records = rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row)
  );
  const columns = [...new Set(records.flatMap((row) => Object.keys(row)))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className="p-2 text-left" key={column}>
                {column.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr className="border-t" key={JSON.stringify(row)}>
              {columns.map((column) => (
                <td className="p-2" key={column}>
                  {displayValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VectorMap({ assetId }: { assetId: string }) {
  const map = useRef<MapRef>(null);
  const [colour, setColour] = useState("");
  const setMap = useCallback((instance: MapRef | null) => {
    map.current = instance;
    instance?.fitBounds(
      [
        [-100, 0],
        [-10, 45],
      ],
      { duration: 0, padding: 24 }
    );
  }, []);
  useEffect(() => {
    const update = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim();
        context.fillRect(0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        setColour(`rgb(${pixel[0]},${pixel[1]},${pixel[2]})`);
      }
      map.current?.fitBounds(
        [
          [-100, 0],
          [-10, 45],
        ],
        { duration: 0, padding: 24 }
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return (
    <section aria-label="NHC vector map">
      <CapMap height={360} interactiveLayerIds={[]} mapRef={setMap}>
        {colour && (
          <Source data={nhcAssetUrl(assetId)} id="nhc-features" type="geojson">
            <Layer
              id="nhc-lines"
              paint={{ "line-color": colour, "line-width": 2 }}
              type="line"
            />
            <Layer
              filter={["==", "$type", "Point"]}
              id="nhc-points"
              paint={{
                "circle-color": colour,
                "circle-radius": 5,
              }}
              type="circle"
            />
          </Source>
        )}
      </CapMap>
      <p className="text-muted-foreground text-xs">
        NHC source geometry. Pan and zoom to inspect; the original graphic
        remains a separate reference.
      </p>
    </section>
  );
}

export function NhcContentView({
  content,
  onPointReady,
}: {
  content: NhcContent;
  onPointReady?: (job: NhcJob) => void;
}) {
  const [latitude, setLatitude] = useState("12.05");
  const [longitude, setLongitude] = useState("-61.75");
  const [job, setJob] = useState<NhcJob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!(job && ["queued", "running"].includes(job.status))) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const result = await nhcRequest(`jobs/${job.id}`, nhcJobSchema);
        if (!cancelled) {
          setJob(result);
          if (result.status === "success") onPointReady?.(result);
        }
      } catch (caught) {
        reportError(caught, "wxproducts-nhc");
        if (!cancelled)
          setError("Could not check the grid request. Retry the status check.");
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, onPointReady]);
  async function sample() {
    setBusy(true);
    setError("");
    try {
      setJob(
        await nhcRequest("points", nhcJobSchema, {
          edition_id: content.edition.id,
          latitude: Number(latitude),
          longitude: Number(longitude),
        })
      );
    } catch (caught) {
      reportError(caught, "wxproducts-nhc");
      setError(
        caught instanceof Error ? caught.message : "Grid query unavailable"
      );
    } finally {
      setBusy(false);
    }
  }
  const assets = content.edition.assets ?? [];
  const vector = assets.find((asset) => asset.role === "geojson");
  return (
    <div className="space-y-4">
      {error && (
        <div className="space-y-2">
          <p role="alert">{error}</p>
          {job && ["queued", "running"].includes(job.status) && (
            <Button
              onClick={() => {
                setError("");
                setJob((current) => (current ? { ...current } : current));
              }}
              type="button"
              variant="outline"
            >
              Retry status check
            </Button>
          )}
        </div>
      )}
      {content.text && (
        <pre className="rounded-lg border p-3 text-sm break-words whitespace-pre-wrap">
          {content.text}
        </pre>
      )}
      {assets
        .filter((asset) => asset.media_type.startsWith("image/"))
        .map((asset) => (
          <a
            href={nhcAssetUrl(asset.asset_id)}
            key={asset.asset_id}
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt={`${content.edition.title} · NHC original graphic`}
              className="h-auto max-w-full"
              height={750}
              src={nhcAssetUrl(asset.asset_id)}
              unoptimized
              width={1000}
            />
          </a>
        ))}
      {vector && <VectorMap assetId={vector.asset_id} />}
      {content.edition.kind === "grid" && (
        <section className="space-y-3">
          <h3 className="font-semibold">Grid values</h3>
          <RecordTable rows={content.decoded.records} />
          <div className="flex flex-wrap items-end gap-3">
            <label htmlFor={`latitude-${content.edition.id}`}>
              Latitude
              <Input
                className="w-32"
                id={`latitude-${content.edition.id}`}
                max={90}
                min={-90}
                onChange={(event) => setLatitude(event.target.value)}
                step="any"
                type="number"
                value={latitude}
              />
            </label>
            <label htmlFor={`longitude-${content.edition.id}`}>
              Longitude
              <Input
                className="w-32"
                id={`longitude-${content.edition.id}`}
                max={180}
                min={-180}
                onChange={(event) => setLongitude(event.target.value)}
                step="any"
                type="number"
                value={longitude}
              />
            </label>
            <Button
              disabled={
                busy ||
                !latitude ||
                !longitude ||
                Boolean(job && ["queued", "running"].includes(job.status))
              }
              onClick={sample}
              type="button"
            >
              Get native-cell values
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            No interpolation. Returned cell coordinates and distance describe
            the sample location.
          </p>
          {job && (
            <p role="status">
              Grid request: {job.status}
              {job.error ? ` · ${job.error}` : ""}
            </p>
          )}
          <RecordTable rows={job?.result?.records} />
        </section>
      )}
      {content.edition.kind === "storms" && (
        <section className="space-y-2">
          <h3 className="font-semibold">Atlantic cyclone metadata</h3>
          <RecordTable rows={content.decoded.storms} />
          {Array.isArray(content.decoded.storms) &&
            content.decoded.storms.length === 0 && (
              <p>
                No active Atlantic cyclones are reported in this source edition.
              </p>
            )}
        </section>
      )}
      <RecordTable rows={content.decoded.observations} />
      {Array.isArray(content.decoded.profiles) &&
        content.decoded.profiles.map((profile) => (
          <RecordTable
            key={JSON.stringify(profile)}
            rows={
              typeof profile === "object" &&
              profile !== null &&
              "levels" in profile
                ? profile.levels
                : []
            }
          />
        ))}
      {content.edition.kind === "vortex" && (
        <RecordTable rows={[content.decoded]} />
      )}
      <ul className="flex flex-wrap gap-3 text-sm">
        {assets.map((asset) => (
          <li key={`${asset.role}-${asset.asset_id}`}>
            <a
              className="underline"
              download
              href={nhcAssetUrl(asset.asset_id)}
            >
              {asset.role === "original"
                ? "Download original"
                : `Download ${asset.role}`}{" "}
              ({Math.ceil(asset.byte_size / 1024)} KB)
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
