"use client";

import {
  type CapAreaCreate,
  type CapPredefinedAreaPublic,
  capCreatePredefinedArea,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaPicker } from "./area-picker";

export function PredefinedAreaManager({
  areas,
}: {
  areas: CapPredefinedAreaPublic[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CapAreaCreate[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  return (
    <div className="space-y-6">
      <p>
        Create reusable geographic areas. Existing areas are read-only here; the
        API does not currently provide editing or deletion.
      </p>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !selected.length || !name.trim()) return;
          setBusy(true);
          setMessage("");
          try {
            await capCreatePredefinedArea({
              body: {
                name: name.trim(),
                area_desc: selected.map((area) => area.area_desc).join("; "),
                polygons: selected.flatMap((area) => area.polygons ?? []),
                multipolygons: selected.flatMap(
                  (area) => area.multipolygons ?? []
                ),
                circles: selected.flatMap((area) => area.circles ?? []),
                geocodes: selected.flatMap((area) => area.geocodes ?? []),
                is_active: true,
              },
            }).unwrap();
            setMessage("Predefined area created.");
            setName("");
            setSelected([]);
            setPickerKey((key) => key + 1);
            router.refresh();
          } catch {
            setMessage(
              "Area creation was not confirmed. Check the selected area and permissions; reload before retrying."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="space-y-4" disabled={busy}>
          <Label htmlFor="area-name">Area name</Label>
          <Input
            id="area-name"
            maxLength={255}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <AreaPicker
            key={pickerKey}
            onAreasChange={setSelected}
            severity="Unknown"
          />
          <Button disabled={!(selected.length && name.trim())} type="submit">
            {busy ? "Creating…" : "Create predefined area"}
          </Button>
        </fieldset>
        {message ? <p role="status">{message}</p> : null}
      </form>
      <h2 className="font-semibold text-lg">Saved areas</h2>
      {areas.length === 0 ? <p>No predefined areas available.</p> : null}
      {areas.map((area) => (
        <article className="space-y-2 rounded-lg border p-4" key={area.id}>
          <h3 className="font-semibold">{area.name}</h3>
          <p>{area.area_desc}</p>
          <p>{area.is_active ? "Active" : "Inactive"}</p>
          <details>
            <summary>Geographic definition</summary>
            <pre className="overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(
                {
                  polygons: area.polygons,
                  multipolygons: area.multipolygons,
                  circles: area.circles,
                  geocodes: area.geocodes,
                },
                null,
                2
              )}
            </pre>
          </details>
        </article>
      ))}
    </div>
  );
}
