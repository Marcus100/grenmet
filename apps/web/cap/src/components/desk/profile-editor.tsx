"use client";

import type {
  CapProfileDefinition,
  CapProfileDefinitionPropertiesChannelsItemsEnum,
  CapProfilePublic,
  CapProfileTemplate,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveHazardProfileVersionAction } from "@/app/desk/profiles/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import { useGmsCatalogue } from "@/components/desk/gms-catalogue";
import { ProfileMatrixEditor } from "@/components/desk/profile-editor-matrix";
import { ProfileSubtypeEditor } from "@/components/desk/profile-editor-subtype";
import { ProfileField } from "@/components/desk/profile-field";
import type { GmsProduct } from "@/lib/desk/cap/cap-levels";
import type { DeskError } from "@/lib/desk/errors";
import { emptySubtype, starterProfile } from "@/lib/desk/profile-defaults";
import type { DeskCheck } from "@/lib/desk/profiles";

/** Lowercase letters, digits and hyphens: the key the API accepts. */
const KEY_PATTERN = /^[a-z][a-z0-9-]{0,99}$/u;

const CHANNELS: CapProfileDefinitionPropertiesChannelsItemsEnum[] = [
  "CAP feed",
  "Email / EDIS",
  "WIS2",
  "GMS website",
  "Agency channels",
];

/** The version an editor starts from. Null means a brand-new profile. */
export interface ProfileDraftSource {
  definition: CapProfileDefinition;
  key: string;
  /** Latest saved version of this key; the save is refused if it has moved. */
  version: number;
}

export interface ProfileVersionDrafterProps {
  buttonLabel: string;
  /** Whether this viewer may save; the reason is shown when they may not. */
  check: DeskCheck;
  intro: string;
  /** The version to start from, or null for a new profile. */
  source: ProfileDraftSource | null;
  /** Keys that already exist, so a new profile cannot reuse one. */
  takenKeys: readonly string[];
}

/**
 * Opens the profile editor on a copy of one version and saves the result as a
 * new draft. Nothing already saved is changed, and a draft is never approved
 * here: approval stays a separate, reviewed step on the profile card.
 */
export function ProfileVersionDrafter({
  check,
  takenKeys,
  source,
  buttonLabel,
  intro,
}: ProfileVersionDrafterProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");

  if (!check.allowed) {
    return (
      <p className="text-muted-foreground text-body-sm" role="status">
        {check.reason}
      </p>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2">
        {status ? (
          <p className="text-body-sm" role="status">
            {status}
          </p>
        ) : null}
        <Button
          onClick={() => {
            setStatus("");
            setOpen(true);
          }}
          type="button"
          variant="outline"
        >
          {buttonLabel}
        </Button>
      </div>
    );
  }

  return (
    <ProfileEditor
      intro={intro}
      onCancel={() => setOpen(false)}
      onSaved={(profile) => {
        setOpen(false);
        setStatus(
          `Saved as version ${profile.version}. It is a draft and needs approval before any warning can use it.`
        );
        router.refresh();
      }}
      source={source}
      takenKeys={takenKeys}
    />
  );
}

function ProfileEditor({
  source,
  takenKeys,
  intro,
  onCancel,
  onSaved,
}: {
  source: ProfileDraftSource | null;
  takenKeys: readonly string[];
  intro: string;
  onCancel: () => void;
  onSaved: (profile: CapProfilePublic) => void;
}) {
  const catalogue = useGmsCatalogue();
  /** GMS products from the catalogue; Advisory is the Small Craft Advisory. */
  const levels = catalogue.products.map((item) => item.key as GmsProduct);
  const [key, setKey] = useState(source?.key ?? "");
  const [definition, setDefinition] = useState<CapProfileDefinition>(
    () => source?.definition ?? starterProfile()
  );
  const [error, setError] = useState<DeskError | null>(null);
  const [pending, startTransition] = useTransition();

  const keyLocked = source !== null;
  const trimmedKey = key.trim();
  const keyValid = KEY_PATTERN.test(trimmedKey);
  const keyTaken = !keyLocked && takenKeys.includes(trimmedKey);
  const canSave = keyValid && !keyTaken && !pending;

  function keyHint(): string {
    if (keyTaken) {
      return "A profile with this key already exists. Draft a new version from it instead.";
    }
    if (keyLocked) {
      return "The key cannot change. It identifies this profile's versions.";
    }
    return "Lowercase letters, numbers and hyphens, starting with a letter.";
  }

  function edit(next: CapProfileDefinition) {
    setDefinition(next);
    setError(null);
  }

  function save() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const outcome = await saveHazardProfileVersionAction({
        baseVersion: source?.version ?? 0,
        definition,
        key: trimmedKey,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      onSaved(outcome.profile);
    });
  }

  return (
    <form
      className="space-y-6 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="text-body-sm">{intro}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canSave} type="submit">
          {pending ? "Saving…" : "Save as new draft version"}
        </Button>
        <Button
          disabled={pending}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Close without saving
        </Button>
      </div>
      <DeskErrorNotice error={error} />
      <fieldset className="space-y-6" disabled={pending}>
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Profile identity</h2>
          <ProfileField
            disabled={keyLocked}
            hint={keyHint()}
            label="Profile key"
            onChange={(value) => setKey(value)}
            value={key}
          />
          <ProfileField
            label="Profile name"
            onChange={(name) => edit({ ...definition, name })}
            value={definition.name}
          />
          <ProfileField
            label="Hazard family"
            onChange={(family) => edit({ ...definition, family })}
            value={definition.family}
          />
          <ProfileField
            label="Notes and source schema"
            multiline
            onChange={(notes) => edit({ ...definition, notes })}
            value={definition.notes ?? ""}
          />
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold">Subtypes, rules and impacts</h2>
          {definition.subtypes.map((subtype, index) => (
            <ProfileSubtypeEditor
              key={subtype.id}
              onChange={(next) =>
                edit({
                  ...definition,
                  subtypes: definition.subtypes.map((s, i) =>
                    i === index ? next : s
                  ),
                })
              }
              onRemove={() =>
                edit({
                  ...definition,
                  subtypes: definition.subtypes.filter((_, i) => i !== index),
                })
              }
              subtype={subtype}
            />
          ))}
          <Button
            onClick={() =>
              edit({
                ...definition,
                subtypes: [...definition.subtypes, emptySubtype()],
              })
            }
            type="button"
            variant="outline"
          >
            Add hazard subtype
          </Button>
        </section>

        <ProfileMatrixEditor
          matrix={definition.matrix}
          onChange={(matrix) => edit({ ...definition, matrix })}
        />

        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Message templates</h2>
          <p className="text-muted-foreground text-body-sm">
            Plain editable wording. Each level needs assessment rules for every
            subtype. No placeholders or threshold values are filled in
            automatically.
          </p>
          {levels.map((level) => {
            const template = definition.templates?.find(
              (t) => t.level === level
            );
            return (
              <div className="space-y-3 border-b pb-4" key={level}>
                <Label>
                  <Checkbox
                    checked={!!template}
                    onCheckedChange={(checked) =>
                      edit({
                        ...definition,
                        templates: checked
                          ? [
                              ...(definition.templates ?? []),
                              {
                                level,
                                headline: "",
                                description: "",
                                instruction: "",
                              },
                            ]
                          : definition.templates?.filter(
                              (t) => t.level !== level
                            ),
                      })
                    }
                  />
                  {level} template
                </Label>
                {template
                  ? (["headline", "description", "instruction"] as const).map(
                      (field) => (
                        <ProfileField
                          key={field}
                          label={`${level} ${field}`}
                          multiline={field !== "headline"}
                          onChange={(value) =>
                            edit({
                              ...definition,
                              templates: definition.templates?.map((t) =>
                                t.level === level ? { ...t, [field]: value } : t
                              ) as CapProfileTemplate[],
                            })
                          }
                          value={template[field] ?? ""}
                        />
                      )
                    )
                  : null}
              </div>
            );
          })}
        </section>

        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Authority and intended distribution</h2>
          <ProfileField
            label="Issuing authority"
            onChange={(issuing_authority) =>
              edit({ ...definition, issuing_authority })
            }
            value={definition.issuing_authority ?? ""}
          />
          <ProfileField
            label="Reviewing authority"
            onChange={(reviewing_authority) =>
              edit({ ...definition, reviewing_authority })
            }
            value={definition.reviewing_authority ?? ""}
          />
          <ProfileField
            label="Contact"
            onChange={(contact) => edit({ ...definition, contact })}
            value={definition.contact ?? ""}
          />
          <p className="text-muted-foreground text-body-sm">
            These choices record the intended channels. Sending and website
            filtering are not configured by this form.
          </p>
          <div className="flex flex-wrap gap-3">
            {CHANNELS.map((channel) => (
              <Label key={channel}>
                <Checkbox
                  checked={definition.channels?.includes(channel) ?? false}
                  onCheckedChange={(checked) =>
                    edit({
                      ...definition,
                      channels: checked
                        ? [...(definition.channels ?? []), channel]
                        : definition.channels?.filter((c) => c !== channel),
                    })
                  }
                />
                {channel}
              </Label>
            ))}
          </div>
        </section>
      </fieldset>
    </form>
  );
}
