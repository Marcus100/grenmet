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
  DailyStatusDocument,
  EMPTY_DAILY_STATUS,
  SHIFT_OPTIONS,
  YES_NO,
} from "./daily-status-document";

export function DailyStatusEditor() {
  const form = useForm({ defaultValues: EMPTY_DAILY_STATUS });

  return (
    <form.Subscribe selector={(s) => s.values}>
      {(values) => (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-lg">
                Daily Airport Status Report
              </h2>
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
                <div className="grid gap-5 md:grid-cols-2">
                  <form.Field name="department">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Department
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
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
                  <form.Field name="shift">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Shift
                        </FieldLabel>
                        <Select
                          onValueChange={(v) => field.handleChange(v ?? "")}
                          value={field.state.value}
                        >
                          <SelectTrigger id={field.name}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SHIFT_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                  <form.Field name="absenteeism">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          Absenteeism
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

                <form.Field name="allReported">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        All persons reported on time?
                      </FieldLabel>
                      <Select
                        onValueChange={(v) => field.handleChange(v ?? "")}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YES_NO.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>

                {values.allReported === "No" ? (
                  <form.Field name="notReportedExplain">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          If No, explain
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                ) : null}

                <form.Field name="affectedEfficiency">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Affected status / efficiency of operations?
                      </FieldLabel>
                      <Select
                        onValueChange={(v) => field.handleChange(v ?? "")}
                        value={field.state.value}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {YES_NO.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>

                {values.affectedEfficiency === "Yes" ? (
                  <form.Field name="affectedExplain">
                    {(field) => (
                      <Field className="gap-1">
                        <FieldLabel className="text-xs" htmlFor={field.name}>
                          If Yes, explain
                        </FieldLabel>
                        <Input
                          id={field.name}
                          onChange={(e) => field.handleChange(e.target.value)}
                          value={field.state.value}
                        />
                      </Field>
                    )}
                  </form.Field>
                ) : null}

                <form.Field name="comments">
                  {(field) => (
                    <Field className="gap-1">
                      <FieldLabel className="text-xs" htmlFor={field.name}>
                        Operational status comments
                      </FieldLabel>
                      <Textarea
                        id={field.name}
                        onChange={(e) => field.handleChange(e.target.value)}
                        rows={4}
                        value={field.state.value}
                      />
                    </Field>
                  )}
                </form.Field>
              </FieldGroup>
            </form>
          </div>

          <DocumentPreview title="Daily Airport Status Report">
            <DailyStatusDocument values={values} />
          </DocumentPreview>
        </div>
      )}
    </form.Subscribe>
  );
}
