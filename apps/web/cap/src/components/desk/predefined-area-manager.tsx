"use client";

import type {
  CapAreaCreate,
  CapPredefinedAreaPublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { savePredefinedArea } from "@/app/desk/areas/actions";
import { AreaPicker } from "@/components/desk/area-picker";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";

/** Joins the picked shapes into the one predefined area the API stores. */
export function buildPredefinedArea(
  name: string,
  selected: readonly CapAreaCreate[]
) {
  return {
    area_desc: selected.map((area) => area.area_desc).join("; "),
    circles: selected.flatMap((area) => area.circles ?? []),
    geocodes: selected.flatMap((area) => area.geocodes ?? []),
    is_active: true,
    multipolygons: selected.flatMap((area) => area.multipolygons ?? []),
    name: name.trim(),
    polygons: selected.flatMap((area) => area.polygons ?? []),
  };
}

function SavedAreas({ areas }: { areas: CapPredefinedAreaPublic[] }) {
  if (areas.length === 0) {
    return (
      <p className="text-muted-foreground">
        No predefined areas are saved yet.
      </p>
    );
  }
  return areas.map((area) => (
    <article className="space-y-2 rounded-lg border bg-card p-4" key={area.id}>
      <h3 className="font-semibold">{area.name}</h3>
      <p className="text-body-sm">{area.area_desc}</p>
      <p className="text-body-sm">{area.is_active ? "Active" : "Inactive"}</p>
      <details>
        <summary className="cursor-pointer text-body-sm">
          Geographic definition
        </summary>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(
            {
              circles: area.circles,
              geocodes: area.geocodes,
              multipolygons: area.multipolygons,
              polygons: area.polygons,
            },
            null,
            2
          )}
        </pre>
      </details>
    </article>
  ));
}

/**
 * Saved areas for every staff member, and a form to save a new one when the
 * account holds cap.settings.manage. Without it the form area says so plainly.
 * The API has no edit or delete for areas yet, so the list is not editable.
 */
export function PredefinedAreaManager({
  areas,
  canCreate,
}: {
  areas: CapPredefinedAreaPublic[];
  canCreate: boolean;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Save a new predefined area</h2>
        {canCreate ? (
          <CreateArea />
        ) : (
          <p className="rounded-lg border p-4 text-body-sm" role="status">
            No access to save predefined areas. This needs the
            cap.settings.manage permission.
          </p>
        )}
      </section>
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">
          Saved areas{" "}
          <span className="font-normal text-muted-foreground">
            ({areas.length})
          </span>
        </h2>
        <SavedAreas areas={areas} />
      </section>
    </div>
  );
}

function CreateArea() {
  const router = useRouter();
  const idPrefix = useId();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<CapAreaCreate[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeskError | null>(null);
  const [message, setMessage] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || selected.length === 0 || !name.trim()) return;
        const body = buildPredefinedArea(name, selected);
        setError(null);
        setMessage("");
        startTransition(async () => {
          const result = await savePredefinedArea(body);
          if (result.ok) {
            setMessage("Predefined area saved.");
            setName("");
            setSelected([]);
            setPickerKey((key) => key + 1);
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <fieldset className="space-y-4" disabled={pending}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-name`}>Area name</Label>
          <Input
            id={`${idPrefix}-name`}
            maxLength={255}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <AreaPicker
          key={pickerKey}
          onAreasChange={setSelected}
          severity="Unknown"
        />
        <Button disabled={!(selected.length > 0 && name.trim())} type="submit">
          {pending ? "Saving…" : "Save predefined area"}
        </Button>
      </fieldset>
      <DeskErrorNotice error={error} />
      {message ? (
        <p className="text-body-sm" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
