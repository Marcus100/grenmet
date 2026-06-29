"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { Printer, RotateCcw } from "lucide-react";
import {
  EMPTY_MARINE_BULLETIN,
  MarineBulletinDocument,
  WARNING_LEVELS,
} from "./marine-bulletin-document";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">
                  Marine Weather Bulletin
                </h2>
                <div className="flex gap-2">
                  <Button
                    onClick={() => form.reset()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw className="size-3.5" />
                    Reset
                  </Button>
                  <Button
                    onClick={() => window.print()}
                    size="sm"
                    type="button"
                  >
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </div>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
              >
                {FIELDS.map((f) => (
                  <form.Field key={f.name} name={f.name}>
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>{f.label}</Label>
                        {f.type === "textarea" ? (
                          <Textarea
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            rows={4}
                            value={field.state.value}
                          />
                        ) : f.type === "select" ? (
                          <select
                            className={selectClass}
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value}
                          >
                            {WARNING_LEVELS.map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            type={f.type === "text" ? "text" : f.type}
                            value={field.state.value}
                          />
                        )}
                      </div>
                    )}
                  </form.Field>
                ))}
              </form>
            </CardContent>
          </Card>

          <MarineBulletinDocument values={values} />
        </div>
      )}
    </form.Subscribe>
  );
}
