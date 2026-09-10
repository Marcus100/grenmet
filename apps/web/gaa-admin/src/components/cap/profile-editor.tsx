"use client";
import {
  approveHazardProfileApiV1CapHazardProfilesProfileIdApprovePost,
  type CapProfileDefinition,
  type CapProfilePublic,
  draftFromHazardProfileApiV1CapHazardProfilesProfileIdDraftPost,
  saveHazardProfileApiV1CapHazardProfilesKeyVersionsPost,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@barrelsgd/ui/components/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { emptySubtype, floodProfile } from "@/lib/cap-profile-defaults";
import { ProfileField } from "./profile-field";
import { ProfileSubtypeEditor } from "./profile-subtype";

const CHANNELS = [
  "CAP feed",
  "Email / EDIS",
  "WIS2",
  "GMS website",
  "Agency channels",
] as const;
const LEVELS = ["Advisory", "Watch", "Warning"] as const;

export function ProfileEditor({
  initialVersions,
}: {
  initialVersions: CapProfilePublic[];
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [selected, setSelected] = useState<CapProfilePublic | null>(
    initialVersions[0] ?? null
  );
  const [key, setKey] = useState(initialVersions[0]?.key ?? "flood-heavy-rain");
  const [definition, setDefinition] = useState<CapProfileDefinition>(
    () => initialVersions[0]?.definition ?? floodProfile()
  );
  const [dirty, setDirty] = useState(!initialVersions.length);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>(
    initialVersions[0]?.approval_errors ?? []
  );
  const [draftSubtype, setDraftSubtype] = useState("");
  const [draftLevel, setDraftLevel] = useState<
    "Advisory" | "Watch" | "Warning"
  >("Warning");

  function edit(next: CapProfileDefinition) {
    setDefinition(next);
    setDirty(true);
    setErrors([]);
  }
  function selectVersion(version: CapProfilePublic) {
    setSelected(version);
    setKey(version.key);
    setDefinition(version.definition);
    setDirty(false);
    setErrors(version.approval_errors);
    setMessage("");
    setDraftSubtype("");
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch {
      setMessage(
        "The action could not be completed. Check permissions, required fields and whether another editor saved a newer version. Your edits are still here."
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    await action(async () => {
      const base = Math.max(
        0,
        ...versions.filter((v) => v.key === key).map((v) => v.version)
      );
      const saved =
        await saveHazardProfileApiV1CapHazardProfilesKeyVersionsPost({
          path: { key },
          body: { base_version: base, definition },
        }).unwrap();
      if (!saved) throw new Error("No saved profile");
      setVersions((previous) => [saved, ...previous]);
      selectVersion(saved);
      setMessage(`Saved draft version ${saved.version}.`);
    });
  }
  async function approve() {
    if (!selected || dirty) return;
    await action(async () => {
      const approved =
        await approveHazardProfileApiV1CapHazardProfilesProfileIdApprovePost({
          path: { profile_id: selected.id },
        }).unwrap();
      if (!approved) throw new Error("No approved profile");
      setVersions((previous) =>
        previous.map((v) => (v.id === approved.id ? approved : v))
      );
      selectVersion(approved);
      setMessage("Profile approved. No alert has been issued.");
    });
  }
  async function startDraft() {
    if (!selected || dirty) return;
    await action(async () => {
      await draftFromHazardProfileApiV1CapHazardProfilesProfileIdDraftPost({
        path: { profile_id: selected.id },
        body: { subtype: draftSubtype, level: draftLevel },
      }).unwrap();
      router.push("/cap");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Configure the rules and wording used to prepare alerts. Saving creates
        an immutable draft version. A different authorised reviewer must approve
        it before use.
      </p>
      <fieldset className="space-y-6" disabled={busy}>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!(dirty && key.trim())} onClick={save}>
            Save new draft version
          </Button>
          <Button
            onClick={() => {
              setSelected(null);
              setKey("");
              setDefinition(floodProfile());
              setDirty(true);
              setErrors([]);
              setMessage("");
            }}
            variant="outline"
          >
            New profile from flood starter
          </Button>
          <Button
            disabled={
              dirty ||
              selected?.state !== "DRAFT" ||
              !!selected.approval_errors.length
            }
            onClick={approve}
            variant="outline"
          >
            Approve saved version
          </Button>
        </div>
        <p className="text-sm">
          {selected
            ? `${selected.key} · version ${selected.version} · ${selected.state}`
            : "Unsaved draft"}
          {dirty ? " · unsaved changes" : ""}
        </p>
        {message && <p role="status">{message}</p>}
        {!!errors.length && (
          <div className="space-y-2 border p-4" role="alert">
            <h2 className="font-medium">Before approval</h2>
            <ul className="list-inside list-disc">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Profile identity</h2>
          <ProfileField
            label="Profile key (lowercase letters, numbers and hyphens)"
            onChange={(value) => {
              setKey(value);
              setDirty(true);
            }}
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
            variant="outline"
          >
            Add hazard subtype
          </Button>
        </section>
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Message templates</h2>
          <p className="text-muted-foreground text-sm">
            Plain editable wording. Each level needs assessment rules for every
            subtype. No placeholders or threshold values are substituted
            automatically.
          </p>
          {LEVELS.map((level) => {
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
                {template &&
                  (["headline", "description", "instruction"] as const).map(
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
                            ),
                          })
                        }
                        value={template[field] ?? ""}
                      />
                    )
                  )}
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
          <p className="text-muted-foreground text-sm">
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
        {selected?.state === "APPROVED" && !dirty && (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">Start an alert draft</h2>
            <Select
              onValueChange={(v) => setDraftSubtype(v ?? "")}
              value={draftSubtype}
            >
              <SelectTrigger aria-label="Alert subtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {definition.subtypes.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(v) => setDraftLevel(v as typeof draftLevel)}
              value={draftLevel}
            >
              <SelectTrigger aria-label="Alert message level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {definition.templates?.map((t) => (
                  <SelectItem key={t.level} value={t.level}>
                    {t.level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">
              Creates a draft with this version's wording. Severity, urgency and
              certainty remain Unknown for assessment. Nothing is published or
              sent.
            </p>
            <Button
              disabled={
                !(
                  draftSubtype &&
                  definition.templates?.some((t) => t.level === draftLevel)
                )
              }
              onClick={startDraft}
            >
              Create alert draft
            </Button>
          </section>
        )}
        <section className="space-y-3">
          <h2 className="font-semibold">Saved version history</h2>
          <p className="text-muted-foreground text-sm">
            Save your edits before opening another version.
          </p>
          {versions.map((version) => (
            <Button
              disabled={dirty}
              key={version.id}
              onClick={() => selectVersion(version)}
              variant="outline"
            >
              {version.definition.name} · v{version.version} · {version.state}
            </Button>
          ))}
        </section>
      </fieldset>
    </div>
  );
}
