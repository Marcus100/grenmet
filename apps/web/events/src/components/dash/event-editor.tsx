"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@barrelsgd/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { CircleCheck, Eye, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { EventCard } from "@/components/discovery/event-card";
import {
  ADMISSION_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  PARISH_LABELS,
  PARISHES,
} from "@/domain/labels";
import type { Admission } from "@/domain/types";
import {
  draftIssues,
  draftToCard,
  type EventDraft,
  type TierDraft,
} from "./event-draft";

/**
 * Organiser event editor with a live public-page preview. The preview uses
 * the same EventCard as the public site so what organisers see is what
 * attendees get. Saving is a demo until the Events API lands.
 */
export function EventEditor({ initial }: { initial: EventDraft }) {
  const [draft, setDraft] = useState<EventDraft>(initial);
  const [saved, setSaved] = useState<"draft" | "published" | null>(null);
  const issues = draftIssues(draft);

  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setSaved(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updateTier = (id: string, patch: Partial<TierDraft>) =>
    update(
      "tiers",
      draft.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier))
    );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <h2>Details</h2>
            </CardTitle>
            <CardDescription>What attendees see first.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="ed-title">Event name</FieldLabel>
                <Input
                  id="ed-title"
                  onChange={(e) => update("title", e.target.value)}
                  value={draft.title}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ed-summary">One-line summary</FieldLabel>
                <Input
                  id="ed-summary"
                  maxLength={120}
                  onChange={(e) => update("summary", e.target.value)}
                  value={draft.summary}
                />
                <FieldDescription>
                  {draft.summary.length}/120 · shown on cards and WhatsApp
                  previews
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ed-description">Description</FieldLabel>
                <Textarea
                  id="ed-description"
                  onChange={(e) => update("description", e.target.value)}
                  rows={5}
                  value={draft.description}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ed-category">Category</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="ed-category"
                    onChange={(e) =>
                      update(
                        "category",
                        CATEGORIES.find((c) => c === e.target.value) ??
                          draft.category
                      )
                    }
                    value={draft.category}
                  >
                    {CATEGORIES.map((category) => (
                      <NativeSelectOption key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-visibility">Visibility</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="ed-visibility"
                    onChange={(e) =>
                      update(
                        "visibility",
                        e.target.value === "unlisted" ? "unlisted" : "public"
                      )
                    }
                    value={draft.visibility}
                  >
                    <NativeSelectOption value="public">
                      Public — listed on the calendar
                    </NativeSelectOption>
                    <NativeSelectOption value="unlisted">
                      Unlisted — link only
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <h2>When & where</h2>
            </CardTitle>
            <CardDescription>Times are Grenada local time.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="ed-date">Date</FieldLabel>
                  <Input
                    id="ed-date"
                    onChange={(e) => update("date", e.target.value)}
                    type="date"
                    value={draft.date}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-start">Starts</FieldLabel>
                  <Input
                    id="ed-start"
                    onChange={(e) => update("startTime", e.target.value)}
                    type="time"
                    value={draft.startTime}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-end">Ends</FieldLabel>
                  <Input
                    id="ed-end"
                    onChange={(e) => update("endTime", e.target.value)}
                    type="time"
                    value={draft.endTime}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ed-venue">Venue</FieldLabel>
                  <Input
                    id="ed-venue"
                    onChange={(e) => update("venue", e.target.value)}
                    value={draft.venue}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-parish">Parish</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="ed-parish"
                    onChange={(e) =>
                      update(
                        "parish",
                        PARISHES.find((p) => p === e.target.value) ??
                          draft.parish
                      )
                    }
                    value={draft.parish}
                  >
                    {PARISHES.map((parish) => (
                      <NativeSelectOption key={parish} value={parish}>
                        {PARISH_LABELS[parish]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <h2>Admission & capacity</h2>
            </CardTitle>
            <CardDescription>
              One capacity pool; every sales channel draws from it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="ed-admission">Admission</FieldLabel>
                  <NativeSelect
                    className="w-full"
                    id="ed-admission"
                    onChange={(e) => {
                      const value = (
                        ["free", "rsvp", "ticketed"] as const
                      ).find((a) => a === e.target.value);
                      update(
                        "admission",
                        value ?? ("free" satisfies Admission)
                      );
                    }}
                    value={draft.admission}
                  >
                    {(["free", "rsvp", "ticketed"] as const).map(
                      (admission) => (
                        <NativeSelectOption key={admission} value={admission}>
                          {ADMISSION_LABELS[admission]}
                        </NativeSelectOption>
                      )
                    )}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="ed-capacity">Capacity</FieldLabel>
                  <Input
                    id="ed-capacity"
                    min={1}
                    onChange={(e) =>
                      update(
                        "capacity",
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    type="number"
                    value={draft.capacity}
                  />
                </Field>
              </div>
              {draft.admission === "ticketed" ? (
                <fieldset className="space-y-3">
                  <legend className="font-medium text-body">
                    Ticket tiers (EC$)
                  </legend>
                  {draft.tiers.map((tier, index) => (
                    <div
                      className="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2"
                      key={tier.id}
                    >
                      <Field>
                        <FieldLabel
                          className={index > 0 ? "sr-only" : undefined}
                          htmlFor={`${tier.id}-name`}
                        >
                          Name
                        </FieldLabel>
                        <Input
                          id={`${tier.id}-name`}
                          onChange={(e) =>
                            updateTier(tier.id, { name: e.target.value })
                          }
                          value={tier.name}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          className={index > 0 ? "sr-only" : undefined}
                          htmlFor={`${tier.id}-price`}
                        >
                          Price
                        </FieldLabel>
                        <Input
                          id={`${tier.id}-price`}
                          min={0}
                          onChange={(e) =>
                            updateTier(tier.id, {
                              priceMajor: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          type="number"
                          value={tier.priceMajor}
                        />
                      </Field>
                      <Field>
                        <FieldLabel
                          className={index > 0 ? "sr-only" : undefined}
                          htmlFor={`${tier.id}-alloc`}
                        >
                          Allocation
                        </FieldLabel>
                        <Input
                          id={`${tier.id}-alloc`}
                          min={0}
                          onChange={(e) =>
                            updateTier(tier.id, {
                              allocation: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          type="number"
                          value={tier.allocation}
                        />
                      </Field>
                      <Button
                        aria-label={`Remove ${tier.name || "tier"}`}
                        onClick={() =>
                          update(
                            "tiers",
                            draft.tiers.filter((t) => t.id !== tier.id)
                          )
                        }
                        size="icon-lg"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    onClick={() =>
                      update("tiers", [
                        ...draft.tiers,
                        {
                          id: `tier_${Date.now()}`,
                          name: "",
                          priceMajor: 0,
                          allocation: 0,
                        },
                      ])
                    }
                    variant="outline"
                  >
                    <Plus data-icon="inline-start" />
                    Add tier
                  </Button>
                </fieldset>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-4" />
              <h2>Public preview</h2>
            </CardTitle>
            <CardDescription>
              {draft.visibility === "public"
                ? "How it appears on the calendar."
                : "Unlisted: only people with the link see it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-events-paper">
            <div data-testid="editor-preview">
              <EventCard event={draftToCard(draft)} href={null} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Ready to publish?</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-body text-success">
                <CircleCheck className="size-4" />
                Everything required is in place.
              </p>
            ) : (
              <ul className="space-y-2">
                {issues.map((issue) => (
                  <li className="flex gap-2 text-body" key={issue}>
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => setSaved("draft")}
                size="lg"
                variant="outline"
              >
                Save draft
              </Button>
              <Button
                className="flex-1"
                disabled={issues.length > 0}
                onClick={() => setSaved("published")}
                size="lg"
              >
                Publish
              </Button>
            </div>
            {saved ? (
              <p className="text-caption text-muted-foreground" role="status">
                <Badge className="mr-2" variant="light-warning">
                  Demo
                </Badge>
                {saved === "draft"
                  ? "Draft saved in this tab only."
                  : "Would publish now — nothing is sent in the preview."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
