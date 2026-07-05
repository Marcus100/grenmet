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
import { Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { FormActionBar } from "@/components/hr/form-action-bar";
import {
  EMPTY_FORECAST,
  EMPTY_IMPACT,
  ForecastDocument,
  IMPACT_LEVELS,
  LIKELIHOOD_LEVELS,
  RESPONSE_LEVELS,
} from "./forecast-document";

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
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3">
              <h2 className="font-medium text-lg">{period} Forecast</h2>
              <FormActionBar
                onDownloadPdf={() => window.print()}
                onReset={() => form.reset()}
              />
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
                {SIMPLE_FIELDS.map((f) => (
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
                            rows={3}
                            value={field.state.value as string}
                          />
                        ) : null}
                        {f.type === "date" ? (
                          <DatePicker
                            id={field.name}
                            onChange={field.handleChange}
                            value={field.state.value as string}
                          />
                        ) : null}
                        {f.type === "text" ? (
                          <Input
                            id={field.name}
                            onChange={(e) => field.handleChange(e.target.value)}
                            value={field.state.value as string}
                          />
                        ) : null}
                      </Field>
                    )}
                  </form.Field>
                ))}
              </FieldGroup>

              <Separator />

              <form.Field mode="array" name="impacts">
                {(impactsField) => (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <FieldLabel>Impacts</FieldLabel>
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
                        <Plus data-icon="inline-start" />
                        Add impact
                      </Button>
                    </div>

                    {impactsField.state.value.map((imp, i) => (
                      <div
                        className="flex flex-col gap-3 rounded-md border p-3"
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
                            <Field className="gap-1">
                              <FieldLabel
                                className="text-xs"
                                htmlFor={field.name}
                              >
                                Hazard
                              </FieldLabel>
                              <Input
                                id={field.name}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                value={field.state.value}
                              />
                            </Field>
                          )}
                        </form.Field>

                        <div className="grid grid-cols-3 gap-3">
                          {IMPACT_SELECTS.map((sel) => (
                            <form.Field
                              key={sel.key}
                              name={`impacts[${i}].${sel.key}`}
                            >
                              {(field) => (
                                <Field className="gap-1">
                                  <FieldLabel
                                    className="text-xs"
                                    htmlFor={field.name}
                                  >
                                    {sel.label}
                                  </FieldLabel>
                                  <Select
                                    onValueChange={(v) =>
                                      field.handleChange(v ?? "")
                                    }
                                    value={field.state.value}
                                  >
                                    <SelectTrigger id={field.name}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {sel.options.map((o) => (
                                        <SelectItem key={o} value={o}>
                                          {o}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </Field>
                              )}
                            </form.Field>
                          ))}
                        </div>

                        <form.Field name={`impacts[${i}].details`}>
                          {(field) => (
                            <Field className="gap-1">
                              <FieldLabel
                                className="text-xs"
                                htmlFor={field.name}
                              >
                                Details
                              </FieldLabel>
                              <Textarea
                                id={field.name}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                rows={2}
                                value={field.state.value}
                              />
                            </Field>
                          )}
                        </form.Field>
                      </div>
                    ))}
                  </div>
                )}
              </form.Field>
            </form>
          </div>

          <DocumentPreview showDownloadPdf={false} title={`${period} Forecast`}>
            <ForecastDocument period={period} values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
