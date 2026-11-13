"use client";

import type { CapProfilePublic, GmsColour } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { startAlertDraftFromProfileAction } from "@/app/desk/profiles/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import { useGmsCatalogue } from "@/components/desk/gms-catalogue";
import { WarningLevelPicker } from "@/components/desk/warning-level-picker";
import { type GmsProduct, needsColour } from "@/lib/desk/cap/cap-levels";
import type { DeskError } from "@/lib/desk/errors";
import type { DeskCheck } from "@/lib/desk/profiles";

/**
 * Starts one warning draft from an approved profile version. The draft uses
 * this version's wording for the chosen product and subtype. Nothing is
 * submitted, approved, published or sent by this step.
 */
export function ProfileAlertStarter({
  profile,
  check,
}: {
  profile: CapProfilePublic;
  check: DeskCheck;
}) {
  const catalogue = useGmsCatalogue();
  const router = useRouter();
  const idPrefix = useId();
  const subtypes = profile.definition.subtypes;
  const [subtype, setSubtype] = useState(subtypes[0]?.name ?? "");
  const [product, setProduct] = useState<GmsProduct>("Warning");
  const [colour, setColour] = useState<GmsColour | null>(null);
  const [error, setError] = useState<DeskError | null>(null);
  const [pending, startTransition] = useTransition();

  if (!check.allowed) {
    return (
      <p className="text-muted-foreground text-body-sm" role="status">
        {check.reason}
      </p>
    );
  }

  const hasTemplate =
    profile.definition.templates?.some((t) => t.level === product) ?? false;
  const colourReady = needsColour(catalogue, product) ? colour !== null : true;
  const canStart =
    !pending &&
    subtype !== "" &&
    hasTemplate &&
    colourReady &&
    subtypes.length > 0;

  function start() {
    if (!canStart) return;
    setError(null);
    startTransition(async () => {
      const outcome = await startAlertDraftFromProfileAction({
        colour: needsColour(catalogue, product) ? colour : null,
        level: product,
        profileId: profile.id,
        subtype,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      router.push(`/desk/alerts/${outcome.alertId}`);
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        start();
      }}
    >
      <fieldset className="space-y-4" disabled={pending}>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-subtype`}>Subtype</Label>
          <NativeSelect
            id={`${idPrefix}-subtype`}
            onChange={(event) => setSubtype(event.target.value)}
            value={subtype}
          >
            {subtypes.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <WarningLevelPicker
          colour={colour}
          onChange={(nextProduct, nextColour) => {
            setProduct(nextProduct);
            setColour(nextColour);
          }}
          product={product}
        />
        {hasTemplate ? null : (
          <p className="text-body-sm" role="status">
            This version has no {product} template. Add one in a new draft
            version before starting a {product} warning from it.
          </p>
        )}
        <p className="text-muted-foreground text-body-sm">
          Creates a warning draft with this version&apos;s wording for the
          chosen product. The colour sets the CAP severity; urgency and
          certainty stay for assessment. Nothing is submitted, approved,
          published or sent.
        </p>
        <DeskErrorNotice error={error} />
        <Button disabled={!canStart} type="submit">
          {pending ? "Creating…" : "Create warning draft"}
        </Button>
      </fieldset>
    </form>
  );
}
