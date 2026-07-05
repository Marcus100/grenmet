"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@grenmet/ui/components/ui/field";
import { Input } from "@grenmet/ui/components/ui/input";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/document/date-picker";
import { DocumentPreview } from "@/components/document/document-preview";
import { FormActionBar } from "@/components/hr/form-action-bar";
import {
  EMPTY_HOURLY,
  EMPTY_HOURLY_ROW,
  HOURLY_COLUMNS,
  HourlyDocument,
} from "./hourly-document";

export function HourlyEditor() {
  const form = useForm({ defaultValues: EMPTY_HOURLY });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3">
              <h2 className="font-medium text-lg">Hourly Forecast</h2>
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
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="date">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Date
                        </FieldLabel>
                        <DatePicker
                          id={field.name}
                          onChange={field.handleChange}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="forecasterName">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Forecaster on Duty
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                </div>
                <form.Field name="location">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Location
                      </FieldLabel>
                      <Input
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        value={field.state.value}
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>

              <Separator />

              <form.Field mode="array" name="rows">
                {(rowsField) => (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <FieldLabel>Hours</FieldLabel>
                      <Button
                        onClick={() =>
                          rowsField.pushValue({
                            ...EMPTY_HOURLY_ROW,
                            id: crypto.randomUUID(),
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Plus data-icon="inline-start" />
                        Add hour
                      </Button>
                    </div>

                    {rowsField.state.value.map((row, i) => (
                      <div
                        className="flex flex-col gap-3 rounded-md border p-3"
                        key={row.id}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">
                            Hour {i + 1}
                          </span>
                          <Button
                            onClick={() => rowsField.removeValue(i)}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          {HOURLY_COLUMNS.map((col) => (
                            <form.Field
                              key={col.key}
                              name={`rows[${i}].${col.key}`}
                            >
                              {(field) => (
                                <Field className="gap-1">
                                  <FieldLabel
                                    className="text-xs"
                                    htmlFor={field.name}
                                  >
                                    {col.label}
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
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form.Field>
            </form>
          </div>

          <DocumentPreview showDownloadPdf={false} title="Hourly Forecast">
            <HourlyDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
