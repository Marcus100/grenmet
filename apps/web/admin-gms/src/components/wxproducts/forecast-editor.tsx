"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Card, CardContent } from "@grenmet/ui/components/ui/card";
import { Input } from "@grenmet/ui/components/ui/input";
import { Label } from "@grenmet/ui/components/ui/label";
import { Textarea } from "@grenmet/ui/components/ui/textarea";
import { useForm } from "@tanstack/react-form";
import { Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import {
  EMPTY_FORECAST,
  EMPTY_IMPACT,
  ForecastDocument,
  IMPACT_LEVELS,
  LIKELIHOOD_LEVELS,
  RESPONSE_LEVELS,
} from "./forecast-document";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface SimpleField {
  label: string;
  name: keyof typeof EMPTY_FORECAST;
  type: "text" | "date" | "textarea";
}

const SIMPLE_FIELDS: SimpleField[] = [
  { name: "dateIssued", label: "Date Issued", type: "date" },
  { name: "location", label: "Location", type: "text" },
  { name: "headline", label: "Headline", type: "text" },
  { name: "summary", label: "Summary", type: "textarea" },
  { name: "minTemperature", label: "Min Temperature", type: "text" },
  { name: "maxTemperature", label: "Max Temperature", type: "text" },
  { name: "marineAdvisory", label: "Marine Advisory", type: "textarea" },
  { name: "nextUpdate", label: "Next Update", type: "text" },
  { name: "forecasterName", label: "Forecaster on Duty", type: "text" },
];

const IMPACT_SELECTS: {
  key: "impactLevel" | "likelihoodLevel" | "responseLevel";
  label: string;
  options: string[];
}[] = [
  { key: "impactLevel", label: "Impact", options: IMPACT_LEVELS },
  { key: "likelihoodLevel", label: "Likelihood", options: LIKELIHOOD_LEVELS },
  { key: "responseLevel", label: "Response", options: RESPONSE_LEVELS },
];

export function ForecastEditor({ period }: { period: string }) {
  const form = useForm({ defaultValues: EMPTY_FORECAST });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{period} Forecast</h2>
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
                {SIMPLE_FIELDS.map((f) => (
                  <form.Field key={f.name} name={f.name}>
                    {(field) => (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>{f.label}</Label>
                        {f.type === "textarea" ? (
                          <Textarea
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            rows={3}
                            value={field.state.value as string}
                          />
                        ) : (
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            type={f.type}
                            value={field.state.value as string}
                          />
                        )}
                      </div>
                    )}
                  </form.Field>
                ))}

                <form.Field mode="array" name="impacts">
                  {(impactsField) => (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Impacts</Label>
                        <Button
                          onClick={() =>
                            impactsField.pushValue({
                              ...EMPTY_IMPACT,
                              id: crypto.randomUUID(),
                            })
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Plus className="size-3.5" />
                          Add impact
                        </Button>
                      </div>

                      {impactsField.state.value.map((imp, i) => (
                        <div
                          className="space-y-3 rounded-md border p-3"
                          key={imp.id}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">
                              Impact {i + 1}
                            </span>
                            <Button
                              onClick={() => impactsField.removeValue(i)}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>

                          <form.Field name={`impacts[${i}].hazard`}>
                            {(field) => (
                              <div className="space-y-1.5">
                                <Label htmlFor={field.name}>Hazard</Label>
                                <Input
                                  id={field.name}
                                  onChange={(e) =>
                                    field.handleChange(e.target.value)
                                  }
                                  value={field.state.value}
                                />
                              </div>
                            )}
                          </form.Field>

                          <div className="grid grid-cols-3 gap-3">
                            {IMPACT_SELECTS.map((sel) => (
                              <form.Field
                                key={sel.key}
                                name={`impacts[${i}].${sel.key}`}
                              >
                                {(field) => (
                                  <div className="space-y-1.5">
                                    <Label htmlFor={field.name}>
                                      {sel.label}
                                    </Label>
                                    <select
                                      className={selectClass}
                                      id={field.name}
                                      onChange={(e) =>
                                        field.handleChange(e.target.value)
                                      }
                                      value={field.state.value}
                                    >
                                      {sel.options.map((o) => (
                                        <option key={o} value={o}>
                                          {o}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </form.Field>
                            ))}
                          </div>

                          <form.Field name={`impacts[${i}].details`}>
                            {(field) => (
                              <div className="space-y-1.5">
                                <Label htmlFor={field.name}>Details</Label>
                                <Textarea
                                  id={field.name}
                                  onChange={(e) =>
                                    field.handleChange(e.target.value)
                                  }
                                  rows={2}
                                  value={field.state.value}
                                />
                              </div>
                            )}
                          </form.Field>
                        </div>
                      ))}
                    </div>
                  )}
                </form.Field>
              </form>
            </CardContent>
          </Card>

          <ForecastDocument period={period} values={values} />
        </div>
      )}
    </form.Subscribe>
  );
}
