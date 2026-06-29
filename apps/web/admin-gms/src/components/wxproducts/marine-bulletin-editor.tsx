"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { RotateCcw } from "lucide-react";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import {
  EMPTY_MARINE_BULLETIN,
  MarineBulletinDocument,
  WARNING_LEVELS,
} from "./marine-bulletin-document";

type FieldType = "text" | "date" | "time" | "textarea" | "select";

const FIELDS: {
  name: keyof typeof EMPTY_MARINE_BULLETIN;
  label: string;
  type: FieldType;
}[] = [
  { name: "date", label: "Date", type: "date" },
  { name: "time", label: "Time", type: "time" },
  { name: "validity", label: "Validity", type: "text" },
  { name: "warningLevel", label: "Warning Level", type: "select" },
  { name: "synopsis", label: "Synopsis", type: "textarea" },
  { name: "weather", label: "Weather", type: "text" },
  { name: "seaState", label: "Sea State", type: "text" },
  { name: "visibility", label: "Visibility", type: "text" },
  { name: "wind", label: "Wind", type: "text" },
  { name: "tideHigh1", label: "High Tide 1", type: "text" },
  { name: "tideLow", label: "Low Tide", type: "text" },
  { name: "tideHigh2", label: "High Tide 2", type: "text" },
  { name: "sunrise", label: "Sunrise", type: "text" },
  { name: "sunset", label: "Sunset", type: "text" },
  { name: "forecasterName", label: "Forecaster on Duty", type: "text" },
];

export function MarineBulletinEditor() {
  const form = useForm({ defaultValues: EMPTY_MARINE_BULLETIN });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-lg">Marine Weather Bulletin</h2>
              <Button
                onClick={() => form.reset()}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcw data-icon="inline-start" />
                Reset
              </Button>
            </div>

            <Separator />

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                form.handleSubmit();
              }}
            >
              <FieldGroup>
                {FIELDS.map((f) => (
                  <form.Field key={f.name} name={f.name}>
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          {f.label}
                        </FieldLabel>
                        {f.type === "textarea" ? (
                          <Textarea
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            rows={4}
                            value={field.state.value}
                          />
                        ) : null}
                        {f.type === "select" ? (
                          <Select
                            onValueChange={(v) => field.handleChange(v ?? "")}
                            value={field.state.value}
                          >
                            <SelectTrigger id={field.name}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WARNING_LEVELS.map((w) => (
                                <SelectItem key={w} value={w}>
                                  {w}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : null}
                        {f.type === "date" ? (
                          <DatePicker
                            id={field.name}
                            onChange={field.handleChange}
                            value={field.state.value}
                          />
                        ) : null}
                        {f.type === "text" || f.type === "time" ? (
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            type={f.type === "time" ? "time" : "text"}
                            value={field.state.value}
                          />
                        ) : null}
                      </Field>
                    )}
                  </form.Field>
                ))}
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Marine Weather Bulletin">
            <MarineBulletinDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
